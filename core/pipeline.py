from __future__ import annotations

from typing import Iterator, List, Dict
import json

from .models import ChatRequest, ChatResponse, ChatChunk, Source
from .prompts import renderer
from .rag import retriever


def _to_sources(blocks: List[dict]) -> List[Source]:
    """Convert raw retrieval blocks into Source objects."""

    out: List[Source] = []

    for i, b in enumerate(blocks):
        seg = b.get("segment_id")

        out.append(
            Source(
                id=str(seg) if seg is not None else str(i),
                title=b.get("source"),
                filepath=b.get("source"),
                page=b.get("page"),
                score=b.get("score"),
                text=b.get("text"),
            )
        )

    return out


def _build_manual_history_prompt(
    message: str,
    history: List[Dict] | None = None,
    persona: str | None = None,
) -> str:
    """
    Build a true non-RAG chat prompt.

    This does NOT call renderer.build_prompt().
    This does NOT run retrieval.
    This does NOT include new ChromaDB context.

    It only includes:
    - previous user messages
    - previous assistant responses
    - source snippets that were already retrieved in earlier RAG turns
    """

    blocks: List[str] = []

    blocks.append(
        "You are a helpful, conversational assistant.\n"
        "You are currently in manual chat mode, meaning no new document retrieval is being performed.\n"
        "You may use the previous conversation and any previously retrieved document excerpts included below.\n"
        "If a document excerpt was retrieved earlier, you may discuss it naturally in follow-up answers.\n"
        "Do not claim that you performed a new search or retrieved new sources for the latest message."
    )

    if persona:
        blocks.append(f"Persona:\n{persona}")

    source_lines: List[str] = []
    transcript_lines: List[str] = []

    seen_sources = set()

    for turn in history or []:
        user_msg = (turn.get("user") or "").strip()
        assistant_msg = (turn.get("assistant") or "").strip()

        if user_msg:
            transcript_lines.append(f"User: {user_msg}")

        if assistant_msg:
            transcript_lines.append(f"Assistant: {assistant_msg}")

        for src in turn.get("context_used", []) or []:
            if not isinstance(src, dict):
                continue

            text = (src.get("text") or "").strip()
            if not text:
                continue

            title = src.get("title") or src.get("filepath") or "Unknown source"
            page = src.get("page")

            key = (title, page, text[:200])
            if key in seen_sources:
                continue

            seen_sources.add(key)

            label = f"{title}"
            if page is not None:
                label += f", page {page}"

            source_lines.append(
                f"[Previously retrieved source: {label}]\n{text}"
            )

    if source_lines:
        blocks.append(
            "Previously retrieved document excerpts:\n\n"
            + "\n\n".join(source_lines[-12:])
        )

    if transcript_lines:
        blocks.append(
            "Previous conversation:\n"
            + "\n".join(transcript_lines)
        )

    blocks.append(f"User: {message}")
    blocks.append("Assistant:")

    return "\n\n".join(blocks)

def chat_once(req: ChatRequest) -> ChatResponse:
    """Execute a full chat turn and return the complete response."""

    if req.rag_enabled:
        # RAG ON:
        # This is the ONLY branch that embeds/vectorizes the query
        # and searches ChromaDB.
        context = retriever.search(
            req.message,
            top_k=req.top_k,
            exclude_sources=set(req.inactive_sources or []),
        )

        prompt = renderer.build_prompt(
            summary="",
            history=[],
            user_message=req.message,
            context_blocks=context,
            persona=req.persona,
            template_id=req.template_id,
        )

        llm_template_id = req.template_id

    else:
        # RAG OFF:
        # No retriever.search().
        # No ChromaDB.
        # No cosine similarity.
        # No RAG prompt template.
        # Only manual chat history.
        context = []

        prompt = _build_manual_history_prompt(
            message=req.message,
            history=req.history or [],
            persona=req.persona,
        )

        # Use default only for generation settings.
        # Do not use rag_chat here.
        llm_template_id = "default"

    llm_kwargs = {
        "user_id": req.user_id,
        "template_id": llm_template_id,
    }

    if req.provider_id:
        llm_kwargs["provider_id"] = req.provider_id

    if req.model_id:
        llm_kwargs["model_id"] = req.model_id

    text = renderer.ask_llm(prompt, **llm_kwargs)

    return ChatResponse(text=text, sources=_to_sources(context), usage={})


def chat_stream(req: ChatRequest) -> Iterator[ChatChunk]:
    """Yield chat response chunks as they are produced by the LLM."""

    if req.rag_enabled:
        # RAG ON:
        # This is the ONLY branch that touches retrieval.
        context = retriever.search(
            req.message,
            top_k=req.top_k,
            exclude_sources=set(req.inactive_sources or []),
        )

        prompt = renderer.build_prompt(
            summary="",
            history=[],
            user_message=req.message,
            context_blocks=context,
            persona=req.persona,
            template_id=req.template_id,
        )

        llm_template_id = req.template_id

    else:
        # RAG OFF:
        # Manual chat mode only.
        context = []

        prompt = _build_manual_history_prompt(
            message=req.message,
            history=req.history or [],
            persona=req.persona,
        )

        llm_template_id = "default"

    meta = json.dumps(
        {
            "rag_enabled": req.rag_enabled,
            "top_k": req.top_k if req.rag_enabled else None,
            "template": req.template_id if req.rag_enabled else "manual_chat",
            "context": context,
        }
    )

    yield ChatChunk(type="meta", text=meta)

    llm_kwargs = {
        "user_id": req.user_id,
        "template_id": llm_template_id,
    }

    if req.provider_id:
        llm_kwargs["provider_id"] = req.provider_id

    if req.model_id:
        llm_kwargs["model_id"] = req.model_id

    for token in renderer.stream_llm(prompt, **llm_kwargs):
        yield ChatChunk(type="delta", text=token)

    yield ChatChunk(type="done", sources=_to_sources(context), usage={})
