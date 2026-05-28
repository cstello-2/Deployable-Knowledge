from typing import Any, Iterator
import requests
from config import OLLAMA_BASE_URL, OLLAMA_MODEL
import json
from .base import BaseLLM

CHAT_URL = f"{OLLAMA_BASE_URL}/v1/chat/completions"


class OllamaLLM(BaseLLM):
    def __init__(self, model: str | None = None, **kwargs: Any) -> None:
        super().__init__(model or OLLAMA_MODEL)

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "stream": stream,
        }

        resp = requests.post(
            CHAT_URL,
            json=payload,
            timeout=kwargs.get("timeout", 120),
        )

        resp.raise_for_status()

        data = resp.json()

        return data["choices"][0]["message"]["content"]

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "stream": True,
        }

        with requests.post(
            CHAT_URL,
            json=payload,
            stream=True,
            timeout=kwargs.get("timeout", None),
        ) as r:

            r.raise_for_status()

            for line in r.iter_lines(decode_unicode=True):

                if not line:
                    continue

                if line.startswith("data: "):
                    line = line[len("data: "):]

                if line.strip() == "[DONE]":
                    break

                try:
                    obj = json.loads(line)

                    delta = (
                        obj.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content", "")
                    )

                    if delta:
                        yield delta

                except Exception:
                    continue
