from typing import Any, Iterator

from .base import BaseLLM, ModelInfo

GITHUB_MODELS_BASE_URL = "https://models.github.ai"
GITHUB_MODELS_MODEL = "openai/gpt-4.1"

APPROVED_GITHUB_MODELS = (
    ModelInfo(id="openai/gpt-4.1", label="OpenAI GPT-4.1"),
)


class GitHubModelsLLM(BaseLLM):
    """GitHub Models chat backend using the Azure AI Inference SDK."""

    def __init__(
        self,
        model: str | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        max_tokens: int | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            model or GITHUB_MODELS_MODEL,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        self.token = kwargs.get("api_key") or ""
        self.base_url = (kwargs.get("base_url") or GITHUB_MODELS_BASE_URL).rstrip("/")
        self.endpoint = kwargs.get("endpoint") or self._inference_endpoint(self.base_url)
        self._client = None

    @staticmethod
    def _inference_endpoint(base_url: str) -> str:
        return base_url if base_url.endswith("/inference") else f"{base_url}/inference"

    def _get_client(self) -> Any:
        if not self.token:
            raise RuntimeError("GitHub Models API key is not configured")
        if self._client is None:
            from azure.ai.inference import ChatCompletionsClient
            from azure.core.credentials import AzureKeyCredential

            self._client = ChatCompletionsClient(
                endpoint=self.endpoint,
                credential=AzureKeyCredential(self.token),
            )
        return self._client

    def _completion_kwargs(self, prompt: str, stream: bool, **kwargs: Any) -> dict[str, Any]:
        from azure.ai.inference.models import UserMessage

        completion_kwargs = {
            "messages": [UserMessage(prompt)],
            "model": self.model,
            "stream": stream,
        }
        for source, target in (
            ("temperature", "temperature"),
            ("top_p", "top_p"),
            ("max_tokens", "max_tokens"),
        ):
            value = kwargs.get(source, getattr(self, source))
            if value is not None:
                completion_kwargs[target] = value
        return completion_kwargs

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        return list(APPROVED_GITHUB_MODELS)

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        response = self._get_client().complete(**self._completion_kwargs(prompt, False, **kwargs))
        return response.choices[0].message.content

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        response = self._get_client().complete(**self._completion_kwargs(prompt, True, **kwargs))
        for update in response:
            for choice in update.choices:
                if choice.delta.content:
                    yield choice.delta.content
