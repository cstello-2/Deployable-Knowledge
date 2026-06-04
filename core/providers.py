from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, select

from core.database import engine, init_db
from core.database.models import ProviderRecord, utc_now
from core.validation import validate_identifier


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    label: str
    api_key_required: bool


DEFAULT_PROVIDER_SPECS: dict[str, ProviderSpec] = {
    "ollama": ProviderSpec(
        id="ollama",
        label="Ollama",
        api_key_required=False,
    ),
    "openai": ProviderSpec(
        id="openai",
        label="OpenAI",
        api_key_required=True,
    ),
    "anthropic": ProviderSpec(
        id="anthropic",
        label="Anthropic",
        api_key_required=True,
    ),
    "gemini": ProviderSpec(
        id="gemini",
        label="Gemini",
        api_key_required=True,
    ),
    "github": ProviderSpec(
        id="github",
        label="GitHub Models",
        api_key_required=True,
    ),
}


class UnknownProviderError(ValueError):
    pass


class ProviderUnavailableError(ValueError):
    pass


def provider_available(record: ProviderRecord) -> bool:
    return not provider_api_key_required(record.id) or bool(record.api_key.strip())


def seed_default_providers(session: Session) -> None:
    """Retained for compatibility; default providers are no longer persisted."""

    return None


def _provider_spec(provider_id: str) -> ProviderSpec:
    spec = DEFAULT_PROVIDER_SPECS.get(provider_id)
    if spec is None:
        raise UnknownProviderError(f"Unknown provider: {provider_id}")
    return spec


def _provider_record_from_spec(spec: ProviderSpec) -> ProviderRecord:
    return ProviderRecord(id=spec.id, api_key="")


def provider_label(provider_id: str) -> str:
    spec = DEFAULT_PROVIDER_SPECS.get(provider_id)
    return spec.label if spec else provider_id


def provider_api_key_required(provider_id: str) -> bool:
    spec = DEFAULT_PROVIDER_SPECS.get(provider_id)
    return spec.api_key_required if spec else True


def list_provider_records(include_unavailable: bool = False) -> list[ProviderRecord]:
    init_db()
    with Session(engine) as session:
        stored_records = {
            record.id: record
            for record in session.exec(select(ProviderRecord)).all()
            if record.id in DEFAULT_PROVIDER_SPECS
        }

    records = [
        stored_records.get(spec.id) or _provider_record_from_spec(spec)
        for spec in DEFAULT_PROVIDER_SPECS.values()
    ]
    if not include_unavailable:
        records = [record for record in records if provider_available(record)]
    return records


def get_provider_record(provider_id: str) -> ProviderRecord:
    provider_id = validate_identifier(provider_id, "provider id")
    spec = _provider_spec(provider_id)
    init_db()
    with Session(engine) as session:
        record = session.get(ProviderRecord, provider_id)
        return record or _provider_record_from_spec(spec)


def get_available_provider_record(provider_id: str) -> ProviderRecord:
    record = get_provider_record(provider_id)
    if not provider_available(record):
        raise ProviderUnavailableError(f"{provider_label(provider_id)} API key is not configured")
    return record


def update_provider_record(provider_id: str, patch: dict[str, Any]) -> ProviderRecord:
    provider_id = validate_identifier(provider_id, "provider id")
    spec = _provider_spec(provider_id)
    init_db()
    with Session(engine) as session:
        record = session.get(ProviderRecord, provider_id)

        if "api_key" in patch:
            api_key = str(patch.get("api_key") or "").strip()
            if api_key:
                if record is None:
                    record = ProviderRecord(id=spec.id)
                record.api_key = api_key
                record.updated_at = utc_now()
                session.add(record)
                session.commit()
                session.refresh(record)
                return record

        return record or _provider_record_from_spec(spec)


def clear_provider_api_key(provider_id: str) -> ProviderRecord:
    provider_id = validate_identifier(provider_id, "provider id")
    spec = _provider_spec(provider_id)
    init_db()
    with Session(engine) as session:
        record = session.get(ProviderRecord, provider_id)
        if record is not None:
            session.delete(record)
            session.commit()
        return _provider_record_from_spec(spec)


def provider_public_dict(
    record: ProviderRecord,
    *,
    models: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": record.id,
        "label": provider_label(record.id),
        "api_key_required": provider_api_key_required(record.id),
        "has_api_key": bool(record.api_key.strip()),
        "available": provider_available(record),
    }
    if models is not None:
        data["models"] = models
    return data
