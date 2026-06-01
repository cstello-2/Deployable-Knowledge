from __future__ import annotations
from typing import List, Dict, Optional, Iterable, Any
from dataclasses import dataclass
import re
import requests
from core.sessions import ChatExchange
from core.settings import get_prompt_template, load_settings
from core.llm import make_llm

from . import loader as prompt_loader


@dataclass
class Template:
    id: str
    name: str
    system: str
    user_format: str
    context_item_format: str = "- {chunk}"
    context_header: str = "Relevant context:"
    context_join: str = "\n"
    persona_format: str = "Persona: {persona}"
    history_separator: str = "\n"
    include_history: bool = True
    temperature: float | None = None
    max_tokens: int | None = None
    top_k: int | None = None


def _load_template(tid: Optional[str]) -> Template:
    """Resolve ``tid`` to a :class:`Template` instance."""

    tid = tid or "rag_chat"
    tmpl = get_prompt_template(tid)
    if tmpl is None:
        data = prompt_loader.load_template(tid)
        if data is None:
            data = {
                "id": "rag_chat",
                "name": "RAG Chat (default)",
                "system": "You are a concise, technical assistant. Answer using only the provided context when possible.",
                "user_format": "{user}",
                "context_item_format": "- {chunk} (source: {source})",
                "context_header": "Context:",
                "context_join": "\n",
                "persona_format": "Persona: {persona}",
                "history_separator": "\n",
                "include_history": True,
                "temperature": 0.2,
                "top_k": 8,
                "max_tokens": 512,
            }
    else:
        data = {
            "id": tmpl.id,
            "name": tmpl.name,
            "system": getattr(tmpl, "system", "") or "",
            "user_format": getattr(tmpl, "user_format", "") or "{user}",
            "context_item_format": getattr(tmpl, "context_item_format", "") or "- {chunk}",
            "context_header": getattr(tmpl, "context_header", "") or "Context:",
            "context_join": getattr(tmpl, "context_join", "") or "\n",
            "persona_format": getattr(tmpl, "persona_format", "") or "Persona: {persona}",
            "history_separator": getattr(tmpl, "history_separator", "") or "\n",
            "include_history": bool(getattr(tmpl, "include_history", True)),
            "temperature": getattr(tmpl, "temperature", None),
            "top_k": getattr(tmpl, "top_k", None),
            "max_tokens": getattr(tmpl, "max_tokens", None),
        }
    return Template(**data)


def _fmt_defaults(s: str, **kwargs) -> str:
    """Format ``s`` replacing ``{name|default}`` tokens with values."""

    def repl(m):
        name = m.group(1)
        default = m.group(2) if m.group(2) is not None else ""
        return str(kwargs.get(name, default))

    s = re.sub(r"\{([a-zA-Z0-9_]+)\|([^}]+)\}", repl, s)
    return s.format(**{k: kwargs.get(k, "") for k in kwargs})


def _render_context(t: Template, context_blocks: List[Dict]) -> str:
    """Render retrieved context blocks using the template's format."""

    if not context_blocks:
        return ""
    lines = []
    for b in context_blocks:
        lines.append(
            _fmt_defaults(
                t.context_item_format,
                chunk=b.get("text", b.get("chunk", "")),
                source=b.get("source", b.get("doc", "unknown")),
                score=b.get("score", ""),
            )
        )
    return t.context_header + "\n" + t.context_join.join(lines)


def _render_history(t: Template, history: List[ChatExchange]) -> str:
    """Render the chat history portion of the prompt."""

    if not t.include_history or not history:
        return ""
    lines = []
    for h in history:
        lines.append(f"User: {getattr(h, 'user', '')}")
        a = getattr(h, "assistant", None) or getattr(h, "llm_response", None) or ""
        if a:
            lines.append(f"Assistant: {a}")
    return t.history_separator.join(lines)


def build_prompt(
    summary: str,
    history: List[ChatExchange],
    user_message: str,
    context_blocks: List[Dict],
    persona: Optional[str] = None,
    template_id: Optional[str] = None,
) -> str:
    """Construct the final prompt string for the LLM."""

    t = _load_template(template_id)
    ctx = _render_context(t, context_blocks)
    hist = _render_history(t, history)
    persona_str = _fmt_defaults(t.persona_format, persona=persona) if persona else ""
    user_str = _fmt_defaults(t.user_format, user=user_message)
    blocks = [t.system]
    if persona_str:
        blocks.append(persona_str)
    if summary:
        blocks.append(f"Summary so far: {summary}")
    if hist:
        blocks.append(hist)
    if ctx:
        blocks.append(ctx)
    blocks.append(user_str)
    return "\n\n".join([b for b in blocks if b])


def _resolve_settings(user_id: Optional[str]):
    """Best-effort lookup of user settings falling back to defaults."""

    s = None
    if user_id:
        try:
            s = load_settings(user_id)
        except Exception:
            pass
    if s is None:
        try:
            s = load_settings("default")
        except Exception:
            pass
    return s


def _generation_values(s, t: Template) -> Dict[str, Any]:
    """Resolve generation settings, allowing template values to override user settings."""

    settings_temperature = getattr(s, "temperature", 0.2)
    settings_top_p = getattr(s, "top_p", 0.95)
    settings_top_k = getattr(s, "top_k", 8)
    settings_max_tokens = getattr(s, "max_tokens", 512)

    temperature = (
        t.temperature if getattr(t, "temperature", None) is not None else settings_temperature
    )
    top_k = t.top_k if getattr(t, "top_k", None) is not None else settings_top_k
    max_tokens = t.max_tokens if getattr(t, "max_tokens", None) is not None else settings_max_tokens

    return {
        "temperature": temperature,
        "top_p": settings_top_p,
        "top_k": top_k,
        "max_tokens": max_tokens,
    }


def _should_fallback_to_ollama(exc: Exception) -> bool:
    if isinstance(exc, (requests.ConnectionError, requests.Timeout)):
        return True
    if isinstance(exc, RuntimeError) and "not configured" in str(exc).lower():
        return True
    return False


def stream_llm(
    prompt: str,
    user_id: Optional[str] = None,
    template_id: Optional[str] = None,
) -> Iterable[str]:
    """Stream tokens from the configured LLM provider."""

    s = _resolve_settings(user_id)
    t = _load_template(template_id)

    provider = getattr(s, "llm_provider", "ollama")
    model = getattr(s, "llm_model", "") or None
    gen = _generation_values(s, t)

    llm = make_llm(
        provider,
        model,
        temperature=gen["temperature"],
        top_p=gen["top_p"],
        top_k=gen["top_k"],
        max_tokens=gen["max_tokens"],
    )

    def tokens():
        try:
            yield from llm.stream_text(prompt)
        except Exception as exc:
            if provider == "ollama" or not _should_fallback_to_ollama(exc):
                raise

            fallback = make_llm(
                "ollama",
                None,
                temperature=gen["temperature"],
                top_p=gen["top_p"],
                top_k=gen["top_k"],
                max_tokens=gen["max_tokens"],
            )
            yield from fallback.stream_text(prompt)

    return tokens()


def ask_llm(
    prompt: str,
    user_id: Optional[str] = None,
    template_id: Optional[str] = None,
) -> str:
    """Return a complete text response from the LLM."""

    s = _resolve_settings(user_id)
    t = _load_template(template_id)

    provider = getattr(s, "llm_provider", "ollama")
    model = getattr(s, "llm_model", "") or None
    gen = _generation_values(s, t)

    llm = make_llm(
        provider,
        model,
        temperature=gen["temperature"],
        top_p=gen["top_p"],
        top_k=gen["top_k"],
        max_tokens=gen["max_tokens"],
    )

    try:
        return llm.generate_text(prompt)
    except Exception as exc:
        if provider == "ollama" or not _should_fallback_to_ollama(exc):
            raise

        fallback = make_llm(
            "ollama",
            None,
            temperature=gen["temperature"],
            top_p=gen["top_p"],
            top_k=gen["top_k"],
            max_tokens=gen["max_tokens"],
        )
        return fallback.generate_text(prompt)
