from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Optional
import json
import markdown2

from core.models import ChatRequest
from core import pipeline
from core.sessions import SessionStore, ChatSession
from core.providers import (
    ProviderUnavailableError,
    UnknownProviderError,
    get_available_provider_record,
)
from core.settings import update_settings
from api.utils import validate_identifier, validate_session_id, clamp_int
from config import MIN_TOP_K, MAX_TOP_K

router = APIRouter()
store = SessionStore()


def _update_session_metadata(session: ChatSession, message: str) -> None:
    """Update metadata without making extra LLM calls in the response path."""

    if not session.title:
        title = " ".join(message.split())
        session.title = title[:80] or "New chat"
        store.save(session)


def _provider_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, UnknownProviderError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ProviderUnavailableError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


def _resolve_provider_model(
    provider_id: str,
    model_id: str,
) -> tuple[str, str]:
    provider_id = validate_identifier(provider_id, "provider id")
    model_id = (model_id or "").strip()
    if not model_id:
        raise HTTPException(status_code=400, detail="model id is required")

    get_available_provider_record(provider_id)
    return provider_id, model_id


async def _chat_impl(
    request: Request,
    message: str,
    session_id: str,
    persona: str,
    inactive: Optional[str],
    template_id: str,
    top_k: int,
    stream: bool,
    provider_id: str | None = None,
    model_id: str | None = None,
):
    user_id = getattr(request.state, "user_id", "default")
    try:
        session_id = validate_session_id(session_id)
        validate_identifier(template_id, "prompt template id")
        provider_id, model_id = _resolve_provider_model(provider_id or "", model_id or "")
    except (UnknownProviderError, ProviderUnavailableError) as exc:
        raise _provider_http_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    session = store.load(session_id)

    if session and session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session:
        session = ChatSession.new(session_id=session_id, user_id=user_id)

    if inactive:
        try:
            session.inactive_sources = json.loads(inactive)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid inactive sources") from exc

    req = ChatRequest(
        user_id=session.user_id,
        message=message,
        persona=persona or session.persona,
        template_id=template_id,
        top_k=clamp_int(top_k, MIN_TOP_K, MAX_TOP_K),
        inactive_sources=session.inactive_sources,
        stream=stream,
        provider_id=provider_id,
        model_id=model_id,
    )
    if not stream:
        resp = pipeline.chat_once(req)
        update_settings(user_id, {"provider_id": provider_id, "model_id": model_id})
        html_response = markdown2.markdown(resp.text)
        session.add_exchange(
            user=message,
            context_used=[s.model_dump() for s in resp.sources],
            rag_prompt="",
            assistant=resp.text,
            html_response=html_response,
        )
        session.trim_history(20)
        store.save(session)
        _update_session_metadata(session, message)
        return JSONResponse(
            {
                "response": resp.text,
                "html_response": html_response,
                "context": [s.model_dump() for s in resp.sources],
                "chat_summary": session.summary,
                "chat_title": session.title,
            }
        )

    async def event_stream():
        assistant = ""
        try:
            for chunk in pipeline.chat_stream(req):
                if chunk.type == "meta":
                    yield f"event: meta\ndata: {chunk.text or '{}'}\n\n"
                elif chunk.type == "delta":
                    assistant += chunk.text or ""
                    yield f"event: delta\ndata: {json.dumps(chunk.text or '')}\n\n"
                elif chunk.type == "done":
                    update_settings(user_id, {"provider_id": provider_id, "model_id": model_id})
                    html_response = markdown2.markdown(assistant)
                    session.add_exchange(
                        user=message,
                        context_used=[s.model_dump() for s in (chunk.sources or [])],
                        rag_prompt="",
                        assistant=assistant,
                        html_response=html_response,
                    )
                    session.trim_history(20)
                    store.save(session)
                    payload = {
                        "sources": [s.model_dump() for s in (chunk.sources or [])],
                        "usage": chunk.usage or {},
                    }
                    yield f"event: done\ndata: {json.dumps(payload)}\n\n"
                    _update_session_metadata(session, message)
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{provider_id}/{model_id:path}/chat")
async def provider_chat(
    provider_id: str,
    model_id: str,
    request: Request,
    message: str = Form(...),
    session_id: str = Form(...),
    persona: str = Form(""),
    inactive: Optional[str] = Form(None),
    template_id: str = Form("rag_chat"),
    top_k: int = Form(8),
    stream: bool = Query(False),
):
    return await _chat_impl(
        request=request,
        message=message,
        session_id=session_id,
        persona=persona,
        inactive=inactive,
        template_id=template_id,
        top_k=top_k,
        stream=stream,
        provider_id=provider_id,
        model_id=model_id,
    )


@router.post("/{provider_id}/{model_id:path}/chat-stream")
async def provider_chat_stream(
    provider_id: str,
    model_id: str,
    request: Request,
    message: str = Form(...),
    session_id: str = Form(...),
    persona: str = Form(""),
    inactive: Optional[str] = Form(None),
    template_id: str = Form("rag_chat"),
    top_k: int = Form(8),
):
    return await _chat_impl(
        request=request,
        message=message,
        session_id=session_id,
        persona=persona,
        inactive=inactive,
        template_id=template_id,
        top_k=top_k,
        stream=True,
        provider_id=provider_id,
        model_id=model_id,
    )
