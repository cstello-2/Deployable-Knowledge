from collections.abc import Generator
from pathlib import Path

from sqlmodel import SQLModel, Session, create_engine

from config import DATABASE_ECHO, DATABASE_URL


def _is_sqlite_url(database_url: str) -> bool:
    return database_url.startswith("sqlite")


def _connect_args(database_url: str) -> dict[str, object]:
    if _is_sqlite_url(database_url):
        return {"check_same_thread": False}
    return {}


def _ensure_sqlite_parent(database_url: str) -> None:
    if not database_url.startswith("sqlite:///"):
        return

    database_path = database_url.removeprefix("sqlite:///")
    if database_path in {"", ":memory:"}:
        return

    Path(database_path).expanduser().parent.mkdir(parents=True, exist_ok=True)


_ensure_sqlite_parent(DATABASE_URL)
engine = create_engine(
    DATABASE_URL,
    echo=DATABASE_ECHO,
    connect_args=_connect_args(DATABASE_URL),
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
