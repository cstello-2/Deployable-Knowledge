from typing import Optional
from config import ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY
from .base import BaseLLM, ProviderInfo
from .anthropic_llm import AnthropicLLM
from .gemini_llm import GeminiLLM
from .ollama_llm import OllamaLLM
from .openai_llm import OpenAILLM

DEFAULT_PROVIDER = "ollama"


def make_llm(
    provider: str,
    model: Optional[str],
    temperature: float | None = None,
    top_p: float | None = None,
    top_k: int | None = None,
    max_tokens: int | None = None,
) -> BaseLLM:
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
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    if provider == "anthropic":
        return AnthropicLLM(
            model=model,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    if provider == "gemini":
        return GeminiLLM(
            model=model,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )

    raise ValueError(f"Unsupported LLM provider: {provider}")


def list_model_providers(refresh: bool = False) -> list[ProviderInfo]:
    providers = [
        ProviderInfo(
            id="ollama",
            label="Ollama",
            models=OllamaLLM().list_models(refresh=True),
        )
    ]

    if OPENAI_API_KEY:
        providers.append(
            ProviderInfo(
                id="openai",
                label="OpenAI",
                models=OpenAILLM().list_models(refresh=refresh),
            )
        )

    if ANTHROPIC_API_KEY:
        providers.append(
            ProviderInfo(
                id="anthropic",
                label="Anthropic",
                models=AnthropicLLM().list_models(refresh=refresh),
            )
        )

    if GEMINI_API_KEY:
        providers.append(
            ProviderInfo(
                id="gemini",
                label="Gemini",
                models=GeminiLLM().list_models(refresh=refresh),
            )
        )

    return providers