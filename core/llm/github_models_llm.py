from typing import Any, Iterator
import json
from urllib.parse import quote

import requests

from config import (
    GITHUB_MODELS_API_VERSION,
    GITHUB_MODELS_BASE_URL,
    GITHUB_MODELS_MODEL,
    GITHUB_MODELS_ORG,
    GITHUB_MODELS_TOKEN,
)
from .base import BaseLLM, ModelInfo

MAX_GITHUB_OUTPUT_TOKENS = 4096


class GitHubModelsLLM(BaseLLM):
    """GitHub Models backend using the REST inference API."""

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
        self.api_key = kwargs.get("api_key") or GITHUB_MODELS_TOKEN
        self.base_url = (kwargs.get("base_url") or GITHUB_MODELS_BASE_URL).rstrip("/")
        self.api_version = kwargs.get("api_version") or GITHUB_MODELS_API_VERSION
        self.org = kwargs.get("org") or GITHUB_MODELS_ORG

    @staticmethod
    def _clamp_number(value: Any, lower: float, upper: float) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return min(max(number, lower), upper)

    @staticmethod
    def _clamp_int(value: Any, lower: int, upper: int) -> int | None:
        try:
            number = int(value)
        except (TypeError, ValueError):
            return None
        return min(max(number, lower), upper)

    def _headers(
        self,
        include_content_type: bool = True,
        require_auth: bool = True,
    ) -> dict[str, str]:
        if require_auth and not self.api_key:
            raise RuntimeError("GITHUB_MODELS_TOKEN is not configured")

        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": self.api_version,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if include_content_type:
            headers["Content-Type"] = "application/json"
        return headers

    def _chat_url(self) -> str:
        if self.org:
            org = quote(self.org, safe="")
            return f"{self.base_url}/orgs/{org}/inference/chat/completions"
        return f"{self.base_url}/inference/chat/completions"

    def _payload(
        self,
        prompt: str,
        stream: bool,
        model: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": stream,
        }

        max_tokens = self._clamp_int(self.max_tokens, 1, MAX_GITHUB_OUTPUT_TOKENS)
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        temperature = self._clamp_number(self.temperature, 0, 1)
        if temperature is not None:
            payload["temperature"] = temperature
        if temperature is None:
            top_p = self._clamp_number(self.top_p, 0, 1)
            if top_p is not None:
                payload["top_p"] = top_p

        return payload

    @staticmethod
    def _error_detail(data: Any) -> str:
        if isinstance(data, str):
            return data
        if not isinstance(data, dict):
            return ""

        message = data.get("message")
        if isinstance(message, str):
            return message

        error = data.get("error")
        if isinstance(error, str):
            return error
        if isinstance(error, dict):
            error_message = error.get("message") or error.get("detail")
            if isinstance(error_message, str):
                return error_message

        detail = data.get("detail")
        if isinstance(detail, str):
            return detail
        return ""

    @staticmethod
    def _raise_for_status(resp: requests.Response) -> None:
        try:
            resp.raise_for_status()
        except requests.HTTPError as exc:
            detail = ""
            try:
                detail = GitHubModelsLLM._error_detail(resp.json())
            except Exception:
                detail = getattr(resp, "text", "") or ""
            if detail:
                raise RuntimeError(f"{exc}: {detail}") from exc
            raise

    @staticmethod
    def _extract_content(message: Any) -> str:
        if isinstance(message, str):
            return message
        if not isinstance(message, dict):
            return ""

        content = message.get("content", "")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            return "".join(parts)
        return ""

    @staticmethod
    def _is_chat_text_model(item: dict[str, Any]) -> bool:
        model_id = item.get("id")
        if not isinstance(model_id, str) or not model_id:
            return False

        input_modalities = item.get("supported_input_modalities") or []
        if input_modalities and "text" not in input_modalities:
            return False

        output_modalities = item.get("supported_output_modalities") or []
        if output_modalities and "text" not in output_modalities:
            return False

        return True

    @staticmethod
    def _catalog_items(data: Any) -> list[Any]:
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("data", "models", "items"):
                items = data.get(key)
                if isinstance(items, list):
                    return items
        return []

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        if not refresh:
            return super().list_models(refresh=refresh, **kwargs)

        timeout = kwargs.get("timeout", 10)
        resp = requests.get(
            f"{self.base_url}/catalog/models",
            headers=self._headers(include_content_type=False),
            timeout=timeout,
        )
        self._raise_for_status(resp)
        data = resp.json()

        models: dict[str, str] = {}
        for item in self._catalog_items(data):
            if not isinstance(item, dict) or not self._is_chat_text_model(item):
                continue
            model_id = item["id"]
            label = item.get("name")
            models[model_id] = label if isinstance(label, str) and label else model_id

        return [
            ModelInfo(id=model_id, label=models[model_id]) for model_id in sorted(models)
        ]

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        timeout = kwargs.get("timeout", 120)
        resp = requests.post(
            self._chat_url(),
            headers=self._headers(),
            json=self._payload(prompt, False),
            timeout=timeout,
        )
        self._raise_for_status(resp)
        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        return self._extract_content(choices[0].get("message", {}))

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        timeout = kwargs.get("timeout", None)
        with requests.post(
            self._chat_url(),
            headers=self._headers(),
            json=self._payload(prompt, True),
            stream=True,
            timeout=timeout,
        ) as resp:
            self._raise_for_status(resp)
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
                    chunk = self._extract_content(choice.get("delta", {}))
                    if chunk:
                        yield chunk
