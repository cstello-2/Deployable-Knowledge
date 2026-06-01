from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ApprovedCorpusTag(SQLModel, table=True):
    __tablename__ = "approved_corpus_tags"

    tag: str = Field(primary_key=True)


class CorpusSource(SQLModel, table=True):
    __tablename__ = "corpus_sources"

    name: str = Field(primary_key=True)
    active: bool = True


class CorpusSourceTag(SQLModel, table=True):
    __tablename__ = "corpus_source_tags"

    source_name: str = Field(primary_key=True, foreign_key="corpus_sources.name")
    tag: str = Field(primary_key=True)


class SyncedFolder(SQLModel, table=True):
    __tablename__ = "synced_folders"

    path: str = Field(primary_key=True)
    position: int = 0


class SyncedFile(SQLModel, table=True):
    __tablename__ = "synced_files"

    source_path: str = Field(primary_key=True)
    folder: str
    source_name: str
    has_segments: bool = True
    mtime_ns: Optional[int] = None
    size: Optional[int] = None


class IgnoredSyncedFile(SQLModel, table=True):
    __tablename__ = "ignored_synced_files"

    source_path: str = Field(primary_key=True)
    folder: Optional[str] = None
    source_name: Optional[str] = None
    reason: str = ""


class ChatSessionRecord(SQLModel, table=True):
    __tablename__ = "chat_sessions"

    session_id: str = Field(primary_key=True)
    user_id: str = "default"
    summary: str = ""
    title: str = ""
    inactive_sources_json: str = "[]"
    persona: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ChatExchangeRecord(SQLModel, table=True):
    __tablename__ = "chat_exchanges"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="chat_sessions.session_id", index=True)
    position: int = 0
    user: str = ""
    context_used_json: str = "[]"
    rag_prompt: str = ""
    assistant: str = ""
    html_response: str = ""


class AuthSessionRecord(SQLModel, table=True):
    __tablename__ = "auth_sessions"

    session_id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    issued_at: datetime
    expires_at: datetime = Field(index=True)
    last_seen: datetime
    ua_hash: Optional[str] = None
    ip_net: Optional[str] = None
    attrs_json: str = "{}"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class UserSettingsRecord(SQLModel, table=True):
    __tablename__ = "user_settings"

    user_id: str = Field(primary_key=True)
    llm_provider: str = "ollama"
    llm_model: str = ""
    prompt_template_id: Optional[str] = None
    temperature: float = 0.2
    top_p: float = 0.95
    max_tokens: int = 512
    top_k: int = 40
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
