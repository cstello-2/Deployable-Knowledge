from typing import Any, Iterator
import json
import requests
from config import API_KEY

url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"



class CloudGeminiLLM:
    """Minimal LLM interface the app expects."""
    def __init__(self, model: str | None = None, **kwargs: Any) -> None:
        self.model = {
            "x-goog-api-key": API_KEY,
            "Content-Type": "application/json",
        } #Just a header

    def generate_text(self, prompt: str, **kwargs: Any) -> str:
        print("Awaiting cloud response")
        data = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ]
        }

        response = requests.post(url, headers=self.model, json=data)

        print(response.status_code)
        print(response.json())
        return response

    def stream_text(self, prompt: str, **kwargs: Any) -> Iterator[str]:
        """Yield chunks of text for streaming UIs."""
        print("Awaiting cloud response")
        data = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ]
        }

        response = requests.post(url, headers=self.model, json=data)

        print(response.status_code)
        print(response.json())

        if response.status_code == 503:
            return "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."

        send = response.json()

        return send['candidates'][0]['content']['parts'][0]['text'] #Google got me messed up in writing this

        



