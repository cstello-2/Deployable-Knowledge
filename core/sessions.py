"""Chat session models and SQL-backed persistence."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from typing import Dict, List, Optional
import uuid

from sqlmodel import Session, select

from core.database import engine, init_db
from core.database.models import ChatExchangeRecord, ChatSessionRecord, utc_now


@dataclass
class ChatExchange:
    """Single turn of chat history."""

    user: str
    context_used: List[Dict]
    rag_prompt: str
    assistant: str
    html_response: str

    def to_dict(self) -> Dict:
        """Serialise the exchange to a dictionary."""

        return {
            "user": self.user,
            "context_used": self.context_used,
            "rag_prompt": self.rag_prompt,
            "assistant": self.assistant,
            "html_response": self.html_response,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "ChatExchange":
        """Construct an exchange from stored data."""

        return cls(
            user=data.get("user", ""),
            context_used=data.get("context_used", []),
            rag_prompt=data.get("rag_prompt", ""),
            assistant=data.get("assistant") or data.get("llm_response", ""),
            html_response=data.get("html_response", ""),
        )


@dataclass
class ChatSession:
    """Mutable container for a user's conversation history."""

    session_id: str
    user_id: str = "default"
    history: List[ChatExchange] = field(default_factory=list)
    summary: str = ""
    title: str = ""
    inactive_sources: List[str] = field(default_factory=list)
    persona: Optional[str] = None

    @classmethod
    def new(
        cls, session_id: Optional[str] = None, user_id: str = "default"
    ) -> "ChatSession":
        """Create a new session with a unique identifier."""

        return cls(session_id=session_id or str(uuid.uuid4()), user_id=user_id)

    def add_exchange(
        self,
        user: str,
        context_used: List[Dict],
        rag_prompt: str,
        assistant: str,
        html_response: str,
    ) -> None:
        """Append a chat exchange to the history."""

        self.history.append(
            ChatExchange(user, context_used, rag_prompt, assistant, html_response)
        )

    def trim_history(self, max_length: int) -> None:
        """Limit history length to ``max_length`` items."""

        if len(self.history) > max_length:
            self.history = self.history[-max_length:]

    def to_dict(self) -> Dict:
        """Serialise the session for storage."""

        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "summary": self.summary,
            "title": self.title,
            "history": [h.to_dict() for h in self.history],
            "inactive_sources": self.inactive_sources,
            "persona": self.persona,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "ChatSession":
        """Rehydrate a session from stored data."""

        session = cls(
            session_id=data.get("session_id", ""),
            user_id=data.get("user_id", "default"),
            summary=data.get("summary", ""),
            title=data.get("title", ""),
            inactive_sources=data.get("inactive_sources", []),
            persona=data.get("persona"),
        )
        session.history = [ChatExchange.from_dict(e) for e in data.get("history", [])]
        return session


def _loads_list(value: str) -> List[Dict]:
    try:
        data = json.loads(value or "[]")
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def _json_list(value: List) -> str:
    return json.dumps(value or [])


class SessionStore:
    """SQL-backed persistence for :class:`ChatSession` objects."""

    def __init__(self, storage_path=None):
        self.storage_path = storage_path
        init_db()

    def save(self, session: ChatSession) -> None:
        """Persist ``session`` to SQL."""

        now = utc_now()
        with Session(engine) as db_session:
            record = db_session.get(ChatSessionRecord, session.session_id)
            if record is None:
                record = ChatSessionRecord(
                    session_id=session.session_id,
                    created_at=now,
                )

            record.user_id = session.user_id
            record.summary = session.summary
            record.title = session.title
            record.inactive_sources_json = _json_list(session.inactive_sources)
            record.persona = session.persona
            record.updated_at = now
            db_session.add(record)
            db_session.flush()

            existing = db_session.exec(
                select(ChatExchangeRecord).where(
                    ChatExchangeRecord.session_id == session.session_id
                )
            ).all()
            for exchange in existing:
                db_session.delete(exchange)
            db_session.flush()

            for position, exchange in enumerate(session.history):
                db_session.add(
                    ChatExchangeRecord(
                        session_id=session.session_id,
                        position=position,
                        user=exchange.user,
                        context_used_json=_json_list(exchange.context_used),
                        rag_prompt=exchange.rag_prompt,
                        assistant=exchange.assistant,
                        html_response=exchange.html_response,
                    )
                )

            db_session.commit()

    def load(self, session_id: str) -> Optional[ChatSession]:
        """Load a session from SQL or return ``None`` if missing."""

        with Session(engine) as db_session:
            record = db_session.get(ChatSessionRecord, session_id)
            if record is None:
                return None

            exchanges = db_session.exec(
                select(ChatExchangeRecord)
                .where(ChatExchangeRecord.session_id == session_id)
                .order_by(ChatExchangeRecord.position, ChatExchangeRecord.id)
            ).all()

            session = ChatSession(
                session_id=record.session_id,
                user_id=record.user_id,
                summary=record.summary,
                title=record.title,
                inactive_sources=_loads_list(record.inactive_sources_json),
                persona=record.persona,
            )
            session.history = [
                ChatExchange(
                    user=exchange.user,
                    context_used=_loads_list(exchange.context_used_json),
                    rag_prompt=exchange.rag_prompt,
                    assistant=exchange.assistant,
                    html_response=exchange.html_response,
                )
                for exchange in exchanges
            ]
            return session

    def list_sessions(self) -> List[Dict]:
        """Return metadata for all stored sessions."""

        with Session(engine) as db_session:
            rows = db_session.exec(
                select(ChatSessionRecord).order_by(ChatSessionRecord.updated_at.desc())
            ).all()
            return [
                {
                    "id": row.session_id,
                    "created": row.created_at.timestamp(),
                    "modified": row.updated_at.timestamp(),
                }
                for row in rows
            ]

    def delete(self, session_id: str) -> None:
        """Remove a stored session and its exchanges."""

        with Session(engine) as db_session:
            for exchange in db_session.exec(
                select(ChatExchangeRecord).where(
                    ChatExchangeRecord.session_id == session_id
                )
            ).all():
                db_session.delete(exchange)

            record = db_session.get(ChatSessionRecord, session_id)
            if record is not None:
                db_session.delete(record)

            db_session.commit()

    def exists(self, session_id: str) -> bool:
        """Return ``True`` if a session exists."""

        with Session(engine) as db_session:
            return db_session.get(ChatSessionRecord, session_id) is not None

    def prune_empty(self) -> None:
        """Delete any sessions that contain no history."""

        for entry in list(self.list_sessions()):
            session = self.load(entry["id"])
            if session and not session.history:
                self.delete(entry["id"])
