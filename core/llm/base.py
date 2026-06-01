from dataclasses import dataclass
from typing import Any, Iterator


@dataclass(frozen=True)
class ModelInfo:
    id: str
    label: str | None = None

    @classmethod
    def from_id(cls, model_id: str) -> "ModelInfo":
        return cls(id=model_id, label=model_id)

    def as_dict(self) -> dict[str, str]:
        return {"id": self.id, "label": self.label or self.id}


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    models: list[ModelInfo]

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "models": [model.as_dict() for model in self.models],
        }


class BaseLLM:
    """Minimal LLM interface the app expects."""

    def __init__(
        self,
        model: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> None:
        self.model = model
        self.temperature = temperature
        self.top_p = top_p
        self.top_k = top_k
        self.max_tokens = max_tokens

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        """Return a full string completion."""
        raise NotImplementedError

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        """Yield chunks of text for streaming UIs."""
        raise NotImplementedError

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        """Return model metadata for this provider.

        By default this returns the configured model without network access.
        Providers may use ``refresh=True`` to fetch live model lists.
        """

        return [ModelInfo.from_id(self.model)] if self.model else []
