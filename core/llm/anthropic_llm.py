from typing import Any, Iterator
import json
import threading
import requests

from config import (
    ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL,
    ANTHROPIC_MODEL,
    ANTHROPIC_VERSION,
)
from .base import BaseLLM, ModelInfo

_thread_local = threading.local()


def _session() -> requests.Session:
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        _thread_local.session = session
    return session


def _raise_for_status(resp: requests.Response) -> None:
    try:
        resp.raise_for_status()
    except requests.HTTPError as exc:
        detail = getattr(resp, "text", "") or ""
        if detail:
            raise RuntimeError(f"{exc}: {detail}") from exc
        raise


class AnthropicLLM(BaseLLM):
    """Anthropic chat backend using the HTTP Messages API."""

    def __init__(self, model: str | None = None, **kwargs: Any) -> None:
        super().__init__(model or ANTHROPIC_MODEL)
        self.api_key = kwargs.get("api_key") or ANTHROPIC_API_KEY
        self.base_url = (kwargs.get("base_url") or ANTHROPIC_BASE_URL).rstrip("/")
        self.version = kwargs.get("version") or ANTHROPIC_VERSION

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        return {
            "x-api-key": self.api_key,
            "anthropic-version": self.version,
            "Content-Type": "application/json",
        }

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        if not refresh or not self.api_key:
            return super().list_models(refresh=refresh, **kwargs)

        timeout = kwargs.get("timeout", 2)
        try:
            resp = _session().get(
                f"{self.base_url}/v1/models",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": self.version,
                },
                timeout=timeout,
            )
            _raise_for_status(resp)
            data = resp.json()
        except Exception:
            return super().list_models(refresh=False)

        models = [
            model["id"]
            for model in data.get("data", [])
            if isinstance(model, dict) and isinstance(model.get("id"), str)
        ]
        return [ModelInfo.from_id(model) for model in models] or super().list_models(
            refresh=False
        )

    def _payload(
        self,
        prompt: str,
        stream: bool,
        max_tokens: int,
        temperature: float | None = None,
        top_p: float | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "stream": stream,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if top_p is not None and temperature is None:
            payload["top_p"] = top_p
        return payload

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        timeout = kwargs.get("timeout", (10, 120))
        max_tokens = int(kwargs.get("max_tokens", 512))
        resp = _session().post(
            f"{self.base_url}/v1/messages",
            headers=self._headers(),
            json=self._payload(
                prompt,
                False,
                max_tokens,
                kwargs.get("temperature"),
                kwargs.get("top_p"),
            ),
            timeout=timeout,
        )
        _raise_for_status(resp)
        data = resp.json()
        parts = []
        for item in data.get("content", []):
            if item.get("type") == "text" and item.get("text"):
                parts.append(item["text"])
        return "".join(parts)

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        timeout = kwargs.get("timeout", (10, 120))
        max_tokens = int(kwargs.get("max_tokens", 512))
        with _session().post(
            f"{self.base_url}/v1/messages",
            headers=self._headers(),
            json=self._payload(
                prompt,
                True,
                max_tokens,
                kwargs.get("temperature"),
                kwargs.get("top_p"),
            ),
            stream=True,
            timeout=timeout,
        ) as resp:
            _raise_for_status(resp)
            for line in resp.iter_lines(chunk_size=1, decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except Exception:
                    continue
                if data.get("type") == "content_block_delta":
                    delta = data.get("delta", {})
                    if delta.get("type") == "text_delta" and delta.get("text"):
                        yield delta["text"]
