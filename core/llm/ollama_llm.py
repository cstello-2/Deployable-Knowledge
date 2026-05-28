from typing import Any, Iterator
import json
import requests
from config import OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_KEEP_ALIVE
from .base import BaseLLM, ModelInfo

CHAT_URL = f"{OLLAMA_BASE_URL}/api/chat"
GENERATE_URL = f"{OLLAMA_BASE_URL}/api/generate"


class OllamaLLM(BaseLLM):
    def __init__(self, model: str | None = None, **kwargs: Any) -> None:
        super().__init__(model or OLLAMA_MODEL)

    def list_models(self, refresh: bool = True, **kwargs: Any) -> list[ModelInfo]:
        if not refresh:
            return super().list_models(refresh=refresh, **kwargs)

        timeout = kwargs.get("timeout", 0.75)
        try:
            resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return super().list_models(refresh=False)

        models = [
            model["name"]
            for model in data.get("models", [])
            if isinstance(model, dict) and isinstance(model.get("name"), str)
        ]
        return [ModelInfo.from_id(model) for model in models] or super().list_models(
            refresh=False
        )

    def _generate_payload(self, prompt: str, stream: bool) -> dict[str, Any]:
        return {
            "model": self.model,
            "prompt": prompt,
            "stream": stream,
            "keep_alive": OLLAMA_KEEP_ALIVE
        }

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "keep_alive": OLLAMA_KEEP_ALIVE
        }

        timeout = kwargs.get("timeout", 120)

        try:
            resp = requests.post(CHAT_URL, json=payload, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
        except requests.HTTPError as exc:
            if exc.response is None or exc.response.status_code != 404:
                raise
            resp = requests.post(
                GENERATE_URL,
                json=self._generate_payload(prompt, False),
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "")
        return data.get("message", {}).get("content", "")

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
            "keep_alive": OLLAMA_KEEP_ALIVE
        }
        timeout = kwargs.get("timeout", None)
        try:
            with requests.post(
                CHAT_URL, json=payload, stream=True, timeout=timeout
            ) as r:
                r.raise_for_status()
                for line in r.iter_lines(decode_unicode=True):
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        chunk = obj.get("message", {}).get("content", "")
                        if chunk:
                            yield chunk
                    except Exception:
                        yield line
        except requests.HTTPError as exc:
            if exc.response is None or exc.response.status_code != 404:
                raise

            with requests.post(
                GENERATE_URL,
                json=self._generate_payload(prompt, True),
                stream=True,
                timeout=timeout,
            ) as r:
                r.raise_for_status()
                for line in r.iter_lines(decode_unicode=True):
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        chunk = obj.get("response", "")
                        if chunk:
                            yield chunk
                    except Exception:
                        yield line
