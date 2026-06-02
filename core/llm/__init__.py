from typing import Optional
from config import ANTHROPIC_API_KEY, GEMINI_API_KEY, GITHUB_MODELS_TOKEN, OPENAI_API_KEY
from .base import BaseLLM, ModelInfo, ProviderInfo
from .anthropic_llm import AnthropicLLM
from .gemini_llm import GeminiLLM
from .github_models_llm import GitHubModelsLLM
from .ollama_llm import OllamaLLM
from .openai_llm import OpenAILLM

DEFAULT_PROVIDER = "ollama"


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

    if provider == "github":
        return GitHubModelsLLM(
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
                models=_list_models_or_empty(OpenAILLM(), refresh=refresh),
            )
        )

    if ANTHROPIC_API_KEY:
        providers.append(
            ProviderInfo(
                id="anthropic",
                label="Anthropic",
                models=_list_models_or_empty(AnthropicLLM(), refresh=refresh),
            )
        )

    if GEMINI_API_KEY:
        providers.append(
            ProviderInfo(
                id="gemini",
                label="Gemini",
                models=_list_models_or_empty(GeminiLLM(), refresh=refresh),
            )
        )

    if GITHUB_MODELS_TOKEN:
        providers.append(
            ProviderInfo(
                id="github",
                label="GitHub Models",
                models=_list_models_or_empty(GitHubModelsLLM(), refresh=refresh),
            )
        )

    return providers
