from typing import Any, Iterator
import json
import requests
from config import OLLAMA_BASE_URL, OLLAMA_MODEL
from .base import BaseLLM

CHAT_URL = f"{OLLAMA_BASE_URL}/v1/chat/completions"


class OllamaLLM(BaseLLM):
    def __init__(self, model: str | None = None, **kwargs: Any) -> None:
        super().__init__(model or OLLAMA_MODEL)

    def _generate_payload(self, prompt: str, stream: bool) -> dict[str, Any]:
        return {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "stream": stream,
        }

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        payload = self._generate_payload(prompt, False)
        
        timeout = kwargs.get("timeout", 120)
        
        resp = requests.post(
            CHAT_URL,
            json=payload,
            timeout=timeout,
        )
        
        resp.raise_for_status()
        
        data = resp.json()
        
        return (data.get("choices", [{}])[0].get("message", {}).get("content", ""))

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
       payload = self._generate_payload(prompt, False)
        
       timeout = kwargs.get("timeout", None)
        
       with requests.post(
            CHAT_URL,
            json=payload,
            stream=True,
            timeout=timeout,
       ) as r:
           r.raise_for_status()
            
           for line in r.iter_lines(decode_unicode=True):
               if not line:
                   continue
                    
               if line.startswith("data: "):
                   line = line[6:]
                    
               if line.strip() == "[DONE]":
                   break
                    
               try:
                   obj = json.loads(line)
                    
                   chunk = (obj.get("choices", [{}])[0].get("delta", {}).get("content", ""))
                    
                   if chunk:
                       yield chunk
                        
               except Exception:
                   continue
