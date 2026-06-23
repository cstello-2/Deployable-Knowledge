from typing import Optional

from core.providers import get_available_provider_record

from .base import BaseLLM, ModelInfo
from .anthropic_llm import AnthropicLLM
from .gemini_llm import GeminiLLM
from .github_models_llm import GitHubModelsLLM
from .ollama_llm import OllamaLLM
from .openai_llm import OpenAILLM


def _list_models_or_empty(llm: BaseLLM, refresh: bool = False) -> list[ModelInfo]:
    try:
        return llm.list_models(refresh=refresh)
    except Exception:
        return []


def make_llm(
    provider: str,
    model: Optional[str],
    temperature: float | None = None,
    top_p: float | None = None,
    top_k: int | None = None,
    max_tokens: int | None = None,
) -> BaseLLM:
    record = get_available_provider_record(provider)

    if provider == "ollama":
        return OllamaLLM(
            model=model,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    if provider == "openai":
        return OpenAILLM(
            model=model,
            api_key=record.api_key,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    if provider == "anthropic":
        return AnthropicLLM(
            model=model,
            api_key=record.api_key,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    if provider == "gemini":
        return GeminiLLM(
            model=model,
            api_key=record.api_key,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    if provider == "github":
        return GitHubModelsLLM(
            model=model,
            api_key=record.api_key,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    raise ValueError(f"Unsupported LLM provider: {provider}")


def _llm_for_record(record, model: str | None = None) -> BaseLLM:
    return make_llm(record.id, model)


def list_provider_models(provider: str, refresh: bool = False) -> list[ModelInfo]:
    record = get_available_provider_record(provider)
    llm = _llm_for_record(record)
    return _list_models_or_empty(llm, refresh=refresh)
