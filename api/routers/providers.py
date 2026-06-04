from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from core.llm import list_provider_models
from core.providers import (
    ProviderUnavailableError,
    UnknownProviderError,
    clear_provider_api_key,
    get_provider_record,
    list_provider_records,
    provider_public_dict,
    provider_available,
    update_provider_record,
)

router = APIRouter(tags=["providers"])


class ProviderPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str | None = None


def _provider_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, UnknownProviderError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ProviderUnavailableError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


def _models_for_provider(provider_id: str, refresh: bool) -> list[dict[str, str]]:
    record = get_provider_record(provider_id)
    if not provider_available(record):
        return []
    return [model.as_dict() for model in list_provider_models(provider_id, refresh=refresh)]


@router.get("/providers")
def list_providers(
    include_unavailable: bool = Query(False),
    refresh: bool = Query(False),
) -> dict[str, list[dict[str, Any]]]:
    providers = []
    for record in list_provider_records(include_unavailable=include_unavailable):
        models = _models_for_provider(record.id, refresh=refresh)
        providers.append(provider_public_dict(record, models=models))
    return {"providers": providers}


@router.patch("/providers/{provider_id}")
def patch_provider(provider_id: str, patch: ProviderPatch) -> dict[str, Any]:
    try:
        record = update_provider_record(provider_id, patch.model_dump(exclude_unset=True))
        return provider_public_dict(record, models=_models_for_provider(record.id, refresh=False))
    except Exception as exc:
        raise _provider_http_error(exc) from exc


@router.delete("/providers/{provider_id}/api-key")
def delete_provider_api_key(provider_id: str) -> dict[str, Any]:
    try:
        record = clear_provider_api_key(provider_id)
        return provider_public_dict(record, models=_models_for_provider(record.id, refresh=False))
    except Exception as exc:
        raise _provider_http_error(exc) from exc


@router.get("/{provider_id}/models")
def list_models(provider_id: str, refresh: bool = Query(False)) -> dict[str, Any]:
    try:
        record = get_provider_record(provider_id)
        if not provider_available(record):
            raise ProviderUnavailableError(
                f"{provider_public_dict(record)['label']} API key is not configured"
            )
        return {
            "provider": provider_public_dict(
                record,
                models=_models_for_provider(provider_id, refresh=refresh),
            )
        }
    except Exception as exc:
        raise _provider_http_error(exc) from exc
