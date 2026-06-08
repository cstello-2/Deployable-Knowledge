from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from fastapi.templating import Jinja2Templates
from pathlib import Path
from core.rag.retriever import db
from core.sessions import ChatSession, SessionStore
from core.corpus_registry import merge_document_list
from api.utils import validate_session_id

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=BASE_DIR / "templates")

SESSION_COOKIE_NAME = "chat_session_id"
store = SessionStore()


def get_documents():
    """Return a summary of ingested documents with segment counts, tags, and activation."""
    try:
        raw = db.collection.get(include=["metadatas"])
        return merge_document_list(raw)
    except Exception:
        # e.g. embedding model missing or Chroma unavailable — still render the UI
        return []


@router.get("/documents")
async def list_documents_json():
    """Expose :func:`get_documents` via a JSON API."""
    return get_documents()


@router.get("/", response_class=HTMLResponse)
async def front_door(request: Request, q: str = ""):
    """Local-only entrypoint: auto-issue local session and render main UI."""
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    try:
        session_id = validate_session_id(session_id) if session_id else None
    except ValueError:
        session_id = None

    if session_id and store.exists(session_id):
        session = store.load(session_id)
    else:
        session = ChatSession.new(user_id="default")
        store.save(session)
        session_id = session.session_id

    all_docs = get_documents()
    filtered = [doc for doc in all_docs if q.lower() in doc["title"].lower()] if q else all_docs

    response = templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "documents": filtered,
            "query": q,
            "session_id": session_id,
        },
    )
    # Local-only mode: always ensure a local auth session exists for API routes.
    manager = request.app.state.session_manager
    manager.ensure(request, response, user_id="local-user")
    # keep your existing chat-session cookie
    response.set_cookie(key=SESSION_COOKIE_NAME, value=session.session_id, httponly=True)
    return response


@router.get("/begin")
async def begin(request: Request):
    """Legacy auth entrypoint retained for compatibility in local mode."""
    response = RedirectResponse(url="/", status_code=303)
    manager = request.app.state.session_manager
    manager.ensure(request, response, user_id="local-user")
    return response


@router.get("/logout")
async def logout(request: Request):
    """
    Kill the USER session (server-side + cookies) and the per-chat cookie,
    then return to local root (/), which auto-creates a local session.
    """
    resp = RedirectResponse("/", status_code=303)
    manager = request.app.state.session_manager

    # Try to delete the server-side user session if present
    sid = request.cookies.get("__Host-session_id") or request.cookies.get("session_id")
    if sid:
        try:
            manager.store.delete(sid)
        except Exception:
            pass

    # Nuke cookies (both possible session cookie names, plus CSRF + chat-session)
    resp.delete_cookie("__Host-session_id", path="/")
    resp.delete_cookie("session_id", path="/")
    resp.delete_cookie("csrf_token", path="/")
    # your per-chat cookie:
    resp.delete_cookie(SESSION_COOKIE_NAME, path="/")

    return resp
