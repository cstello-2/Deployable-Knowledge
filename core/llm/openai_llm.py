from typing import Any, Iterator
import json
import requests

from config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
from .base import BaseLLM, ModelInfo


class OpenAILLM(BaseLLM):
    """OpenAI chat backend using the HTTP Chat Completions API."""

    def __init__(self, model: str | None = None, **kwargs: Any) -> None:
        super().__init__(model or OPENAI_MODEL)
        self.api_key = kwargs.get("api_key") or OPENAI_API_KEY
        self.base_url = (kwargs.get("base_url") or OPENAI_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        if not refresh or not self.api_key:
            return super().list_models(refresh=refresh, **kwargs)

        timeout = kwargs.get("timeout", 2)
        try:
            resp = requests.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return super().list_models(refresh=False)

        models = sorted(
            model["id"]
            for model in data.get("data", [])
            if isinstance(model, dict) and isinstance(model.get("id"), str)
        )
        return [ModelInfo.from_id(model) for model in models] or super().list_models(refresh=False)

    def _payload(self, prompt: str, stream: bool) -> dict[str, Any]:
        return {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": stream,
        }

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        timeout = kwargs.get("timeout", 120)
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json=self._payload(prompt, False),
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        timeout = kwargs.get("timeout", None)
        with requests.post(
            f"{self.base_url}/chat/completions",
            headers=self._headers(),
            json=self._payload(prompt, True),
            stream=True,
            timeout=timeout,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines(decode_unicode=True):
                if not line:
                    continue
                if line.startswith("data:"):
                    line = line[5:].strip()
                if line == "[DONE]":
                    break
                try:
                    data = json.loads(line)
                except Exception:
                    continue
                for choice in data.get("choices", []):
                    chunk = choice.get("delta", {}).get("content")
                    if chunk:
                        yield chunk
