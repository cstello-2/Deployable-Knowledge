from fastapi import APIRouter, HTTPException, Request
from typing import Dict, Any
import json, time, shutil

from config import (
    BASE_DIR,
)
from core.settings import (
    UserSettings,
    load_settings,
    update_settings,
    list_prompt_templates,
    get_prompt_template,
)
from api.utils import validate_identifier

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings/{user_id}", response_model=UserSettings)
def get_settings(request: Request, user_id: str):
    """Fetch persisted settings for ``user_id``."""
    _require_current_user(request, user_id)
    return load_settings(user_id)


@router.patch("/settings/{user_id}", response_model=UserSettings)
def patch_settings(request: Request, user_id: str, patch: Dict[str, Any]):
    """Apply a partial update to a user's settings."""
    _require_current_user(request, user_id)
    try:
        return update_settings(user_id, patch)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/prompt-templates")
def list_prompts():
    """Return metadata for all available prompt templates."""
    return [p.model_dump() for p in list_prompt_templates()]


@router.get("/prompt-templates/{tid}")
def get_prompt(tid: str):
    """Return a single prompt template by identifier."""
    _validate_prompt_id(tid)
    p = get_prompt_template(tid)
    if not p:
        raise HTTPException(status_code=404, detail="template not found")
    return p.model_dump()


@router.put("/prompt-templates/{tid}")
def put_prompt(tid: str, payload: Dict[str, Any]):
    """Create or replace a prompt template on disk."""
    _validate_prompt_id(tid)
    for f in ["id", "name", "user_format", "system"]:
        if f not in payload:
            raise HTTPException(status_code=400, detail=f"missing {f}")
    if payload["id"] != tid:
        raise HTTPException(status_code=400, detail="id mismatch")
    prompts_dir = BASE_DIR / "prompts"
    prompts_dir.mkdir(exist_ok=True)
    backup_dir = prompts_dir / ".backup"
    backup_dir.mkdir(exist_ok=True)
    target = prompts_dir / f"{tid}.json"
    tmp = prompts_dir / f"{tid}.json.tmp"
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    if target.exists():
        shutil.copy(target, backup_dir / f"{tid}.{int(time.time())}.json")
    tmp.replace(target)
    return {"status": "ok"}


@router.delete("/prompt-templates/{tid}")
def delete_prompt_template(tid: str):
    """Delete a user-made prompt template JSON file."""

    protected = {
        "default",
        "rag_chat",
        "tech_helper",
        "title_summarizer",
    }

    if tid in protected:
        raise HTTPException(
            status_code=400,
            detail=f"Refusing to delete protected built-in template: {tid}",
        )

    prompts_dir = BASE_DIR / "prompts"
    target = prompts_dir / f"{tid}.json"

    if not target.exists():
        raise HTTPException(status_code=404, detail="Prompt template not found.")

    backup_dir = prompts_dir / ".backup"
    backup_dir.mkdir(exist_ok=True)

    shutil.copy(target, backup_dir / f"{tid}.{int(time.time())}.deleted.json")
    target.unlink()

    return {
        "status": "deleted",
        "id": tid,
    }


def _current_user_id(request: Request) -> str:
    return getattr(request.state, "user_id", "default")


def _require_current_user(request: Request, user_id: str) -> None:
    try:
        validate_identifier(user_id, "user id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if user_id != _current_user_id(request):
        raise HTTPException(status_code=403, detail="Cannot access another user's settings")


def _validate_prompt_id(tid: str) -> None:
    try:
        validate_identifier(tid, "prompt template id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
