import json
from typing import Any, Iterator

import requests

from .base import BaseLLM, ModelInfo

ANTHROPIC_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicLLM(BaseLLM):
    """Anthropic chat backend using the HTTP Messages API."""

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
            model or ANTHROPIC_MODEL,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        self.api_key = kwargs.get("api_key") or ""
        self.base_url = (kwargs.get("base_url") or ANTHROPIC_BASE_URL).rstrip("/")
        self.version = kwargs.get("version") or ANTHROPIC_VERSION

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("Anthropic API key is not configured")
        return {
            "x-api-key": self.api_key,
            "anthropic-version": self.version,
            "Content-Type": "application/json",
        }

    def _payload(self, prompt: str, stream: bool, **kwargs: Any) -> dict[str, Any]:
        payload = {
            "model": self.model,
            "max_tokens": int(kwargs.get("max_tokens", self.max_tokens) or 512),
            "messages": [{"role": "user", "content": prompt}],
            "stream": stream,
        }
        temperature = kwargs.get("temperature", self.temperature)
        top_p = kwargs.get("top_p", self.top_p)
        if temperature is not None:
            payload["temperature"] = temperature
        elif top_p is not None:
            payload["top_p"] = top_p
        return payload

    @staticmethod
    def _text(data: dict[str, Any]) -> str:
        return "".join(
            item.get("text", "")
            for item in data.get("content", [])
            if item.get("type") == "text"
        )

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        if not refresh:
            return super().list_models(refresh=refresh, **kwargs)

        resp = requests.get(
            f"{self.base_url}/v1/models",
            headers=self._headers(),
            timeout=kwargs.get("timeout", 2),
        )

        resp.raise_for_status()
        data = resp.json()

        return [
            ModelInfo(id=model["id"], label=model.get("display_name") or model["id"])
            for model in data.get("data", [])
            if model.get("id")
        ] or super().list_models(refresh=False)

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        resp = requests.post(
            f"{self.base_url}/v1/messages",
            headers=self._headers(),
            json=self._payload(prompt, False, **kwargs),
            timeout=kwargs.get("timeout", (10, 120)),
        )
        resp.raise_for_status()
        return self._text(resp.json())

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        with requests.post(
            f"{self.base_url}/v1/messages",
            headers=self._headers(),
            json=self._payload(prompt, True, **kwargs),
            stream=True,
            timeout=kwargs.get("timeout", (10, 120)),
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines(decode_unicode=True):
                if line and line.startswith("data:"):
                    data = json.loads(line[5:].strip())
                    if data.get("type") == "content_block_delta":
                        text = data.get("delta", {}).get("text")
                        if text:
                            yield text
