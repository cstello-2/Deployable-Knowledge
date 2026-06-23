from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
from datetime import datetime
from pydantic import BaseModel
from core.sessions import ChatSession, SessionStore
from api.utils import validate_session_id

SESSION_COOKIE_NAME = "chat_session_id"

router = APIRouter()
store = SessionStore()


class RenameSessionBody(BaseModel):
    title: str


@router.get("/sessions")
async def list_sessions(request: Request):
    """Return lightweight metadata for all stored sessions."""
    store.prune_empty()
    summaries = []
    for entry in store.list_sessions():
        session = store.load(entry["id"])
        if not session or not session.history or not _owns_session(request, session):
            continue
        summaries.append(
            {
                "session_id": entry["id"],
                "title": session.title if session else "",
                "created_at": datetime.fromtimestamp(entry["created"]).isoformat(),
            }
        )
    return JSONResponse(content=summaries)


@router.get("/sessions/{session_id}")
async def get_session_data(request: Request, session_id: str):
    """Return the chat history for ``session_id``.

    The frontend expects the history to be a list of ``[user, assistant]``
    pairs, so we convert the stored :class:`ChatExchange` objects to that
    structure here.
    """

    session_id = _validate_session_id(session_id)
    session = store.load(session_id)
    if not session or not _owns_session(request, session):
        raise HTTPException(status_code=404, detail="Session not found")

    history_pairs = [[ex.user, ex.assistant] for ex in session.history]
    entry = next(
        (item for item in store.list_sessions() if item["id"] == session_id),
        None,
    )
    created_at = datetime.fromtimestamp(entry["created"]).isoformat() if entry else None

    return JSONResponse(
        content={
            "session_id": session.session_id,
            "created_at": created_at,
            "summary": session.summary,
            "title": session.title,
            "history": history_pairs,
        }
    )


@router.patch("/sessions/{session_id}")
async def rename_session(request: Request, session_id: str, body: RenameSessionBody):
    """Rename a stored chat session."""

    session_id = _validate_session_id(session_id)
    session = store.load(session_id)
    if not session or not _owns_session(request, session):
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = (body.title or "").strip()
    store.save(session)
    return JSONResponse({"status": "ok", "session_id": session_id, "title": session.title})


@router.delete("/sessions/{session_id}")
async def delete_session(request: Request, session_id: str):
    """Delete a stored chat session."""

    session_id = _validate_session_id(session_id)
    session = store.load(session_id)
    if not session or not _owns_session(request, session):
        raise HTTPException(status_code=404, detail="Session not found")
    store.delete(session_id)
    return JSONResponse({"status": "ok", "session_id": session_id})


@router.get("/session")
async def get_or_create_session(request: Request):
    """Return an existing session or create a new one if none is found."""
    store.prune_empty()
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    try:
        session_id = validate_session_id(session_id) if session_id else None
    except ValueError:
        session_id = None
    if session_id and store.exists(session_id):
        session = store.load(session_id)
        if not session or not session.history or not _owns_session(request, session):
            session = ChatSession.new(user_id=getattr(request.state, "user_id", "default"))
            store.save(session)
    else:
        session = ChatSession.new(user_id=getattr(request.state, "user_id", "default"))
        store.save(session)

    response = JSONResponse({"session_id": session.session_id})
    response.set_cookie(key=SESSION_COOKIE_NAME, value=session.session_id, httponly=True)
    return response


@router.post("/session")
async def create_session(request: Request):
    """Always create and return a new chat session."""

    session = ChatSession.new(user_id=getattr(request.state, "user_id", "default"))
    store.save(session)

    response = JSONResponse({"session_id": session.session_id})
    response.set_cookie(key=SESSION_COOKIE_NAME, value=session.session_id, httponly=True)
    return response


@router.get("/user")
async def get_user(request: Request):
    """Return the authenticated user's identifier."""
    user = getattr(request.state, "user_id", "default")
    return {"user": user}


def _owns_session(request: Request, session: ChatSession) -> bool:
    return session.user_id == getattr(request.state, "user_id", "default")


def _validate_session_id(session_id: str) -> str:
    try:
        return validate_session_id(session_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
