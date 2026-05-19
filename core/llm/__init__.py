from typing import Optional
from .base import BaseLLM
from .ollama_llm import OllamaLLM

DEFAULT_PROVIDER = "ollama"

def make_llm(provider: str, model: Optional[str]) -> BaseLLM:
    # Local-only runtime: always use Ollama.
    return OllamaLLM(model=model)
