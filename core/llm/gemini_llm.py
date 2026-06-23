import json
from typing import Any, Iterator

import requests

from .base import BaseLLM, ModelInfo

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_MODEL = "gemini-2.5-flash"


class GeminiLLM(BaseLLM):
    """Gemini chat backend using the Gemini REST API."""

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
            model or GEMINI_MODEL,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            max_tokens=max_tokens,
        )
        self.api_key = kwargs.get("api_key") or ""
        self.base_url = (kwargs.get("base_url") or GEMINI_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError("Gemini API key is not configured")
        return {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    def _model_name(self) -> str:
        if self.model.startswith(("models/", "tunedModels/")):
            return self.model
        return f"models/{self.model}"

    def _endpoint(self, action: str) -> str:
        return f"{self.base_url}/{self._model_name()}:{action}"

    def _generation_config(self, **kwargs: Any) -> dict[str, Any]:
        config = {}
        for source, target in (
            ("max_tokens", "maxOutputTokens"),
            ("temperature", "temperature"),
            ("top_p", "topP"),
            ("top_k", "topK"),
        ):
            value = kwargs.get(source, getattr(self, source))
            if value is not None:
                config[target] = value
        return config

    def _payload(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        payload = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
        generation_config = self._generation_config(**kwargs)
        if generation_config:
            payload["generationConfig"] = generation_config
        return payload

    @staticmethod
    def _text(data: dict[str, Any]) -> str:
        return "".join(
            part.get("text", "")
            for candidate in data.get("candidates", [])
            for part in candidate.get("content", {}).get("parts", [])
        )

    def list_models(self, refresh: bool = False, **kwargs: Any) -> list[ModelInfo]:
        if not refresh:
            return super().list_models(refresh=refresh, **kwargs)

        try:
            resp = requests.get(
                f"{self.base_url}/models",
                headers={"x-goog-api-key": self.api_key},
                params={"pageSize": 1000},
                timeout=kwargs.get("timeout", 2),
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return super().list_models(refresh=False)

        return [
            ModelInfo(
                id=model["name"].replace("models/", "", 1),
                label=model.get("displayName") or model["name"].replace("models/", "", 1),
            )
            for model in data.get("models", [])
            if model.get("name")
            and "generateContent" in model.get("supportedGenerationMethods", [])
        ] or super().list_models(refresh=False)

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        resp = requests.post(
            self._endpoint("generateContent"),
            headers=self._headers(),
            json=self._payload(prompt, **kwargs),
            timeout=kwargs.get("timeout", 120),
        )
        resp.raise_for_status()
        return self._text(resp.json())

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        with requests.post(
            self._endpoint("streamGenerateContent"),
            headers=self._headers(),
            json=self._payload(prompt, **kwargs),
            params={"alt": "sse"},
            stream=True,
            timeout=kwargs.get("timeout", None),
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines(decode_unicode=True):
                if line and line.startswith("data:"):
                    text = self._text(json.loads(line[5:].strip()))
                    if text:
                        yield text
