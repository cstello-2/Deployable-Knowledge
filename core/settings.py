from __future__ import annotations
from pathlib import Path
from typing import Optional, Dict, Any, List
import json
from pydantic import BaseModel, Field, ConfigDict
from sqlmodel import Session

from config import BASE_DIR
from core.database import engine, init_db
from core.database.models import UserSettingsRecord, utc_now
from .validation import validate_identifier
from .prompts import loader as prompt_loader

LEGACY_USERS_DIR = BASE_DIR / "users"


class UserSettings(BaseModel):
    user_id: str
    prompt_template_id: Optional[str] = None
    provider_id: str = "ollama"
    model_id: str = ""
    temperature: float = 0.2
    top_p: float = 0.95
    max_tokens: int = 512
    top_k: int = 40


def _user_path(user_id: str) -> Path:
    """Legacy settings file location for ``user_id``."""

    user_id = validate_identifier(user_id, "user id")
    return LEGACY_USERS_DIR / f"{user_id}.json"


def _to_settings(record: UserSettingsRecord) -> UserSettings:
    return UserSettings(
        user_id=record.user_id,
        prompt_template_id=record.prompt_template_id,
        provider_id=record.provider_id,
        model_id=record.model_id,
        temperature=record.temperature,
        top_p=record.top_p,
        max_tokens=record.max_tokens,
        top_k=record.top_k,
    )


def _record_from_settings(settings: UserSettings) -> UserSettingsRecord:
    return UserSettingsRecord(**settings.model_dump())


def _load_legacy_settings(user_id: str) -> Optional[UserSettings]:
    """Load old JSON settings if present, without recreating the old folder."""

    legacy_path = _user_path(user_id)
    if not legacy_path.exists():
        return None
    data = json.loads(legacy_path.read_text(encoding="utf-8"))
    return UserSettings.model_validate({**data, "user_id": user_id})


def load_settings(user_id: str) -> UserSettings:
    """Load SQL-backed settings for ``user_id`` creating defaults if necessary."""

    user_id = validate_identifier(user_id, "user id")
    init_db()
    with Session(engine) as session:
        record = session.get(UserSettingsRecord, user_id)
        if record is not None:
            return _to_settings(record)

    settings = _load_legacy_settings(user_id) or UserSettings(user_id=user_id)
    save_settings(settings)
    return settings


def save_settings(s: UserSettings) -> None:
    """Persist ``s`` to the SQL database."""

    settings = UserSettings.model_validate(s.model_dump())
    settings.user_id = validate_identifier(settings.user_id, "user id")
    settings.provider_id = validate_identifier(settings.provider_id, "provider id")
    settings.model_id = str(settings.model_id or "").strip()
    init_db()
    with Session(engine) as session:
        record = session.get(UserSettingsRecord, settings.user_id)
        if record is None:
            record = _record_from_settings(settings)
        else:
            for key, value in settings.model_dump().items():
                setattr(record, key, value)
            record.updated_at = utc_now()
        session.add(record)
        session.commit()


def update_settings(user_id: str, patch: Dict[str, Any]) -> UserSettings:
    """Apply ``patch`` to a user's settings and persist the result."""

    s = load_settings(user_id)
    s = UserSettings.model_validate({**s.model_dump(), **patch, "user_id": user_id})
    save_settings(s)
    return s


# Prompt template helpers (same as config.PROMPTS_DIR for consistency)
PROMPTS_DIR = BASE_DIR / "prompts"
PROMPTS_DIR.mkdir(parents=True, exist_ok=True)


class PromptTemplate(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    description: Optional[str] = None
    system: Optional[str] = None
    content: Optional[str] = None
    inputs: List[str] = Field(default_factory=list)
    meta: Dict[str, Any] = Field(default_factory=dict)


def list_prompt_templates() -> List[PromptTemplate]:
    """Return all prompt templates available on disk."""

    templates = []
    for data in prompt_loader.list_templates():
        try:
            templates.append(PromptTemplate(**data))
        except Exception:
            continue
    return templates


def get_prompt_template(tid: str) -> Optional[PromptTemplate]:
    """Return a single prompt template by ``tid`` if present."""

    data = prompt_loader.load_template(tid)
    if not data:
        return None
    return PromptTemplate(**data)
