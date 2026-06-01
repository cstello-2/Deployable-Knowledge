import json
from typing import Any, Iterator

import requests

from config import GEMINI_API_KEY, GEMINI_BASE_URL, GEMINI_MODEL
from .base import BaseLLM, ModelInfo


_NON_CHAT_MODEL_MARKERS = (
    "aqa",
    "audio",
    "embed",
    "embedding",
    "image",
    "imagen",
    "live",
    "native-audio",
    "tts",
    "vision",
)


class GeminiLLM(BaseLLM):
    """Gemini chat backend using the Gemini REST API."""

    def __init__(self, model: str | None = None, **kwargs: Any) -> None:
        super().__init__(model or GEMINI_MODEL)
        self.api_key = kwargs.get("api_key") or GEMINI_API_KEY
        self.base_url = (kwargs.get("base_url") or GEMINI_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        return {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    def _model_name(self) -> str:
        model = self.model or GEMINI_MODEL
        if model.startswith(("models/", "tunedModels/")):
            return model
        return f"models/{model}"

    def _endpoint(self, action: str) -> str:
        return f"{self.base_url}/{self._model_name()}:{action}"

    @staticmethod
    def _model_id(name: str) -> str:
        if name.startswith("models/"):
            return name.split("/", 1)[1]
        return name

    @classmethod
    def _is_chat_model(cls, item: dict[str, Any]) -> bool:
        methods = item.get("supportedGenerationMethods") or []
        if "generateContent" not in methods:
            return False

        name = item.get("name")
        if not isinstance(name, str) or not name:
            return False

        model_id = cls._model_id(name)
        if not model_id.startswith("gemini-"):
            return False

        base_model = item.get("baseModelId", "")
        display_name = item.get("displayName", "")
        searchable = " ".join(
            value.lower()
            for value in (model_id, base_model, display_name)
            if isinstance(value, str)
        )
        return not any(marker in searchable for marker in _NON_CHAT_MODEL_MARKERS)

    @staticmethod
    def _raise_for_status(resp: requests.Response) -> None:
        try:
            resp.raise_for_status()
        except requests.HTTPError as exc:
            detail = ""
            try:
                error = resp.json().get("error", {})
                detail = error.get("message", "")
            except Exception:
                detail = getattr(resp, "text", "") or ""
            if detail:
                raise RuntimeError(f"{exc}: {detail}") from exc
            raise

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        parts: list[str] = []
        for candidate in data.get("candidates", []):
            content = candidate.get("content", {})
            for part in content.get("parts", []):
                text = part.get("text")
                if text:
                    parts.append(text)
        return "".join(parts)

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        if not refresh or not self.api_key:
            return super().list_models(refresh=refresh, **kwargs)

        timeout = kwargs.get("timeout", 2)
        params: dict[str, Any] = {"pageSize": 1000}
        models: dict[str, str] = {}
        try:
            while True:
                resp = requests.get(
                    f"{self.base_url}/models",
                    headers={"x-goog-api-key": self.api_key},
                    params=params,
                    timeout=timeout,
                )
                self._raise_for_status(resp)
                data = resp.json()
                for item in data.get("models", []):
                    if not isinstance(item, dict):
                        continue
                    if not self._is_chat_model(item):
                        continue
                    model_id = self._model_id(item["name"])
                    label = item.get("displayName")
                    models[model_id] = label if isinstance(label, str) else model_id
                next_page = data.get("nextPageToken")
                if not next_page:
                    break
                params["pageToken"] = next_page
        except Exception:
            return super().list_models(refresh=False)

        return [
            ModelInfo(id=model_id, label=models[model_id]) for model_id in sorted(models)
        ] or super().list_models(refresh=False)

    @staticmethod
    def _generation_config(**kwargs: Any) -> dict[str, Any]:
        config: dict[str, Any] = {}
        if kwargs.get("max_tokens") is not None:
            config["maxOutputTokens"] = int(kwargs["max_tokens"])
        if kwargs.get("temperature") is not None:
            config["temperature"] = kwargs["temperature"]
        if kwargs.get("top_p") is not None:
            config["topP"] = kwargs["top_p"]
        return config

    def _payload(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
        generation_config = self._generation_config(**kwargs)
        if generation_config:
            payload["generationConfig"] = generation_config
        return payload

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        timeout = kwargs.get("timeout", 120)
        resp = requests.post(
            self._endpoint("generateContent"),
            headers=self._headers(),
            json=self._payload(prompt, **kwargs),
            timeout=timeout,
        )
        self._raise_for_status(resp)
        return self._extract_text(resp.json())

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        timeout = kwargs.get("timeout", None)
        with requests.post(
            self._endpoint("streamGenerateContent"),
            headers=self._headers(),
            json=self._payload(prompt, **kwargs),
            params={"alt": "sse"},
            stream=True,
            timeout=timeout,
        ) as resp:
            self._raise_for_status(resp)
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    break
                try:
                    data = json.loads(payload)
                except Exception:
                    continue
                text = self._extract_text(data)
                if text:
                    yield text
