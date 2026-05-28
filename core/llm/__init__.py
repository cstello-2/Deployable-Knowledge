from typing import Optional
from config import ANTHROPIC_API_KEY, OPENAI_API_KEY
from .base import BaseLLM, ProviderInfo
from .anthropic_llm import AnthropicLLM
from .ollama_llm import OllamaLLM
from .openai_llm import OpenAILLM

DEFAULT_PROVIDER = "ollama"

def make_llm(provider: str, model: Optional[str]) -> BaseLLM:
    if provider == "ollama":
        return OllamaLLM(model=model)
    if provider == "openai":
        return OpenAILLM(model=model)
    if provider == "anthropic":
        return AnthropicLLM(model=model)
    raise ValueError(f"Unsupported LLM provider: {provider}")


def list_model_providers(refresh: bool = False) -> list[ProviderInfo]:
    providers = [
        ProviderInfo(
            id="ollama",
            label="Ollama",
            models=OllamaLLM().list_models(refresh=refresh),
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
    return providers
