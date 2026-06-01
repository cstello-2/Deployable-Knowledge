from __future__ import annotations
import base64
import hashlib
import hmac
import json
from pathlib import Path
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, Set

from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlmodel import Session as DBSession
from starlette.middleware.base import BaseHTTPMiddleware

from core.database import engine, init_db
from core.database.models import AuthSessionRecord, utc_now

UTC = timezone.utc
SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

def _now() -> datetime:
    return datetime.now(UTC)

def _rand_b64(n_bytes: int = 32) -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(n_bytes)).decode().rstrip("=")

def _hash(s: str) -> str:
    return hashlib.sha256((s or "").encode()).hexdigest()

def _ip_prefix(remote: str, cidr: Optional[int]) -> Optional[str]:
    if not remote or not cidr or "/" in (remote or ""):
        return None
    parts = remote.split(".")
    if len(parts) != 4:
        return None
    keep = cidr // 8
    rest = 4 - keep
    prefix = ".".join(parts[:keep]) + (".0" * rest)
    return f"{prefix}/{cidr}"

class SessionSettings(BaseModel):
    idle_timeout_minutes: int = 15
    absolute_ttl_hours: int = 8
    refresh_on_activity: bool = True

    cookie_name: str = "session_id"
    csrf_cookie_name: str = "csrf_token"
    samesite: str = "Strict"
    secure_cookies: bool = True
    dev_allow_insecure_on_localhost: bool = True

    bind_user_agent: bool = True
    bind_ip_prefix_cidr: Optional[int] = None

    allow_paths: Set[str] = {"/", "/begin", "/logout", "/docs", "/openapi.json", "/healthz", "/favicon.ico"}
    allow_path_prefixes: Set[str] = {"/static", "/documents"}

    legacy_session_dir: Optional[str] = "user_sessions"

    class Config:
        arbitrary_types_allowed = True

def load_settings_from_config() -> "SessionSettings":
    try:
        import app.auth.config as auth_config
        return SessionSettings(
            idle_timeout_minutes=getattr(auth_config, "SESSION_IDLE_TIMEOUT_MINUTES", 15),
            absolute_ttl_hours=getattr(auth_config, "SESSION_ABSOLUTE_TTL_HOURS", 8),
            refresh_on_activity=getattr(auth_config, "SESSION_REFRESH_ON_ACTIVITY", True),
            cookie_name=getattr(auth_config, "SESSION_COOKIE_NAME", "session_id"),
            csrf_cookie_name=getattr(auth_config, "CSRF_COOKIE_NAME", "csrf_token"),
            samesite=getattr(auth_config, "SESSION_COOKIE_SAMESITE", "Strict"),
            secure_cookies=getattr(auth_config, "SESSION_SECURE_COOKIES", True),
            dev_allow_insecure_on_localhost=getattr(auth_config, "DEV_ALLOW_INSECURE_COOKIES", True),
            bind_user_agent=getattr(auth_config, "SESSION_BIND_USER_AGENT", True),
            bind_ip_prefix_cidr=getattr(auth_config, "SESSION_BIND_IP_PREFIX_CIDR", None),
            allow_paths=set(getattr(auth_config, "AUTH_ALLOW_PATHS", {"/", "/begin", "/logout", "/docs", "/openapi.json", "/healthz", "/favicon.ico"})),
            allow_path_prefixes=set(getattr(auth_config, "AUTH_ALLOW_PATH_PREFIXES", {"/static", "/documents"})),
            legacy_session_dir=getattr(
                auth_config,
                "LEGACY_SESSION_DIR",
                getattr(auth_config, "SESSION_DIR", "user_sessions"),
            ),
        )
    except Exception:
        return SessionSettings()

class Session(BaseModel):
    session_id: str
    user_id: str
    issued_at: datetime
    expires_at: datetime
    last_seen: datetime
    ua_hash: Optional[str] = None
    ip_net: Optional[str] = None
    attrs: Dict[str, Any] = Field(default_factory=dict)
    def is_expired(self, now: datetime) -> bool:
        return now >= self.expires_at

class SessionStore:
    def get(self, sid: str) -> Optional["Session"]: ...
    def put(self, sess: "Session") -> None: ...
    def delete(self, sid: str) -> None: ...

class SQLSessionStore(SessionStore):
    def __init__(self, legacy_dir: Optional[str] = None):
        self.legacy_dir = Path(legacy_dir) if legacy_dir else None
        init_db()

    def _legacy_path(self, sid: str) -> Optional[Path]:
        if self.legacy_dir is None:
            return None
        safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", sid)
        return self.legacy_dir / f"{safe}.json"

    def import_legacy_sessions(self) -> None:
        if self.legacy_dir is None or not self.legacy_dir.exists():
            return
        for path in self.legacy_dir.glob("*.json"):
            try:
                session = self._load_legacy_path(path)
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                continue
            self.put(session)

    def get(self, sid: str) -> Optional["Session"]:
        with DBSession(engine) as db_session:
            record = db_session.get(AuthSessionRecord, sid)
            if record is not None:
                return _session_from_record(record)

        legacy_path = self._legacy_path(sid)
        if legacy_path is None or not legacy_path.exists():
            return None

        session = self._load_legacy_path(legacy_path)
        self.put(session)
        return session

    def put(self, sess: "Session") -> None:
        now = utc_now()
        with DBSession(engine) as db_session:
            record = db_session.get(AuthSessionRecord, sess.session_id)
            if record is None:
                record = AuthSessionRecord(
                    session_id=sess.session_id,
                    user_id=sess.user_id,
                    issued_at=sess.issued_at,
                    expires_at=sess.expires_at,
                    last_seen=sess.last_seen,
                    created_at=now,
                )
            record.user_id = sess.user_id
            record.issued_at = sess.issued_at
            record.expires_at = sess.expires_at
            record.last_seen = sess.last_seen
            record.ua_hash = sess.ua_hash
            record.ip_net = sess.ip_net
            record.attrs_json = json.dumps(sess.attrs or {})
            record.updated_at = now
            db_session.add(record)
            db_session.commit()

    def delete(self, sid: str) -> None:
        with DBSession(engine) as db_session:
            record = db_session.get(AuthSessionRecord, sid)
            if record is not None:
                db_session.delete(record)
                db_session.commit()

    def _load_legacy_path(self, path: Path) -> "Session":
        data = json.loads(path.read_text(encoding="utf-8"))
        for key in ("issued_at", "expires_at", "last_seen"):
            data[key] = _ensure_utc(datetime.fromisoformat(data[key]))
        return Session(**data)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _session_from_record(record: AuthSessionRecord) -> Session:
    try:
        attrs = json.loads(record.attrs_json or "{}")
    except json.JSONDecodeError:
        attrs = {}
    if not isinstance(attrs, dict):
        attrs = {}
    return Session(
        session_id=record.session_id,
        user_id=record.user_id,
        issued_at=_ensure_utc(record.issued_at),
        expires_at=_ensure_utc(record.expires_at),
        last_seen=_ensure_utc(record.last_seen),
        ua_hash=record.ua_hash,
        ip_net=record.ip_net,
        attrs=attrs,
    )

class SessionManager:
    def __init__(self, store: SessionStore, settings: SessionSettings):
        self.store = store
        self.settings = settings

    def _is_https(self, request: Request) -> bool:
        return request.scope.get("scheme", "http") == "https"

    def _cookie_name(self, request: Request) -> str:
        if self._is_https(request) and self.settings.secure_cookies:
            return "__Host-" + self.settings.cookie_name
        return self.settings.cookie_name

    def _cookie_kwargs(self, request: Request, http_only=True) -> Dict[str, Any]:
        https = self._is_https(request)
        secure = self.settings.secure_cookies and https
        if not https and not self.settings.dev_allow_insecure_on_localhost:
            raise HTTPException(status_code=500, detail="Refusing to set cookies without HTTPS.")
        return {"httponly": http_only, "secure": secure, "samesite": self.settings.samesite, "path": "/"}

    def _binding(self, request: Request) -> Dict[str, Optional[str]]:
        ua_hash = _hash(request.headers.get("user-agent")) if self.settings.bind_user_agent else None
        client_ip = request.client.host if request.client else None
        ip_net = _ip_prefix(client_ip, self.settings.bind_ip_prefix_cidr)
        return {"ua_hash": ua_hash, "ip_net": ip_net}

    def issue(self, response: Response, request: Request, user_id: str) -> "Session":
        now = _now()
        ttl = timedelta(hours=self.settings.absolute_ttl_hours)
        sid = _rand_b64(32)
        csrf = _rand_b64(32)
        b = self._binding(request)
        sess = Session(
            session_id=sid, user_id=user_id,
            issued_at=now, last_seen=now, expires_at=now + ttl,
            ua_hash=b["ua_hash"], ip_net=b["ip_net"],
        )
        sess.attrs["csrf"] = csrf
        self.store.put(sess)
        response.set_cookie(self._cookie_name(request), sid, **self._cookie_kwargs(request, http_only=True))
        response.set_cookie(self.settings.csrf_cookie_name, csrf, **self._cookie_kwargs(request, http_only=False))
        return sess

    def ensure(self, request: Request, response: Response, user_id: str = "local-user") -> "Session":
        try:
            return self.fetch_valid_session(request, require_csrf=False)
        except HTTPException:
            return self.issue(response, request, user_id=user_id)

    def _validate_binding(self, sess: "Session", request: Request) -> None:
        if self.settings.bind_user_agent and sess.ua_hash:
            if not hmac.compare_digest(sess.ua_hash, _hash(request.headers.get("user-agent"))):
                raise HTTPException(status_code=401, detail="Session client binding mismatch.")
        if self.settings.bind_ip_prefix_cidr and sess.ip_net:
            cur = _ip_prefix(request.client.host if request.client else "", self.settings.bind_ip_prefix_cidr)
            if not cur or not hmac.compare_digest(sess.ip_net, cur):
                raise HTTPException(status_code=401, detail="Session network binding mismatch.")

    def _validate_csrf(self, sess: "Session", request: Request) -> None:
        header = request.headers.get("X-CSRF-Token")
        cookie = request.cookies.get(self.settings.csrf_cookie_name)
        expected = sess.attrs.get("csrf")
        supplied = header or cookie
        if not supplied or not expected or not hmac.compare_digest(str(supplied), str(expected)):
            raise HTTPException(status_code=403, detail="CSRF token invalid or missing.")

    def fetch_valid_session(self, request: Request, require_csrf: bool) -> "Session":
        sid = request.cookies.get(self._cookie_name(request))
        if not sid:
            raise HTTPException(status_code=401, detail="Missing session cookie.")
        sess = self.store.get(sid)
        if not sess:
            raise HTTPException(status_code=401, detail="Invalid session.")
        now = _now()
        if now >= sess.expires_at:
            self.store.delete(sess.session_id)
            raise HTTPException(status_code=401, detail="Session expired.")
        idle = timedelta(minutes=self.settings.idle_timeout_minutes)
        if now - sess.last_seen > idle:
            self.store.delete(sess.session_id)
            raise HTTPException(status_code=401, detail="Session idle timeout.")
        self._validate_binding(sess, request)
        if require_csrf and request.method not in SAFE_METHODS:
            self._validate_csrf(sess, request)
        if self.settings.refresh_on_activity:
            sess.last_seen = now
            self.store.put(sess)
        return sess

class SessionValidationMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, manager: SessionManager, settings: SessionSettings):
        super().__init__(app)
        self.manager = manager
        self.settings = settings

    def _is_allowed(self, path: str) -> bool:
        if path in self.settings.allow_paths:
            return True
        return any(path.startswith(p) for p in self.settings.allow_path_prefixes)

    async def dispatch(self, request: Request, call_next):
        if self._is_allowed(request.url.path):
            return await call_next(request)
        try:
            sess = self.manager.fetch_valid_session(request, require_csrf=True)
            request.state.user_id = sess.user_id
            request.state.session = sess
        except HTTPException as e:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": e.detail}, status_code=e.status_code)
        return await call_next(request)

def build_session_router() -> APIRouter:
    r = APIRouter()
    @r.get("/healthz")
    async def healthz():
        return PlainTextResponse("ok")
    return r

def setup_auth(app, settings: Optional[SessionSettings] = None):
    settings = settings or load_settings_from_config()
    store = SQLSessionStore(settings.legacy_session_dir)
    store.import_legacy_sessions()
    manager = SessionManager(store, settings)
    app.add_middleware(SessionValidationMiddleware, manager=manager, settings=settings)
    app.include_router(build_session_router())
    app.state.session_manager = manager
    app.state.session_settings = settings
    return manager, settings
