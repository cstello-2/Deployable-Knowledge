import sys, pathlib
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from core.models import ChatChunk
from core import pipeline
import app.main as main

client = TestClient(main.app)


def test_sse_stream(monkeypatch):
    def fake_stream(req):
        yield ChatChunk(type="meta", text="{}")
        yield ChatChunk(type="delta", text="hi")
        yield ChatChunk(type="done", sources=[], usage={})

    monkeypatch.setattr(pipeline, "chat_stream", fake_stream)

    with client.stream(
        "POST",
        "/chat?stream=true",
        data={"message": "test stream", "session_id": "12345678-1234-1234-1234-123456789012"},
        cookies={"session": "test"},
    ) as res:
        assert res.status_code == 200
        body = "".join(line.decode() if isinstance(line, bytes) else line for line in res.iter_lines())

    assert "event: meta" in body
    assert "event: delta" in body
    assert "event: done" in body
