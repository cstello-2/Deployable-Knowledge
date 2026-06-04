import sys, pathlib

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

import app.main as main
from core import pipeline
from core.models import ChatResponse, Source
from core.rag import retriever
from app.auth.session import SessionValidationMiddleware


async def _bypass(self, request, call_next):
    return await call_next(request)


SessionValidationMiddleware.dispatch = _bypass

client = TestClient(main.app)


def test_chat_endpoint(monkeypatch):
    seen = {}

    def fake_chat_once(req):
        seen["provider_id"] = req.provider_id
        seen["model_id"] = req.model_id
        return ChatResponse(text="hi", sources=[Source(id="1")], usage={})

    monkeypatch.setattr(pipeline, "chat_once", fake_chat_once)
    res = client.post(
        "/ollama/llama3/chat",
        data={"message": "hi", "session_id": "52345678-1234-1234-1234-123456789012"},
        cookies={"session": "test"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["response"]
    assert seen == {"provider_id": "ollama", "model_id": "llama3"}

    settings = client.get(
        "/api/settings/default",
        cookies={"session": "test"},
    )
    assert settings.status_code == 200
    assert settings.json()["provider_id"] == "ollama"
    assert settings.json()["model_id"] == "llama3"


def test_search_endpoint(monkeypatch):
    monkeypatch.setattr(
        retriever, "search", lambda q, top_k=5, exclude_sources=None: [{"text": "a"}]
    )
    res = client.get("/search", params={"q": "test"}, cookies={"session": "test"})
    assert res.status_code == 200
    assert res.json()["results"]
