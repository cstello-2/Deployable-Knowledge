from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Dict

_jobs: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()
_COMPLETED_JOB_TTL_SECONDS = 60 * 30
_MAX_JOBS = 200


def _now() -> float:
    return time.time()


def _cleanup_locked(now: float | None = None) -> None:
    now = _now() if now is None else now
    expired = [
        job_id
        for job_id, job in _jobs.items()
        if job.get("status") in {"done", "error"}
        and now - float(job.get("updated_at") or 0) > _COMPLETED_JOB_TTL_SECONDS
    ]

    for job_id in expired:
        _jobs.pop(job_id, None)

    if len(_jobs) <= _MAX_JOBS:
        return

    oldest = sorted(
        _jobs.items(),
        key=lambda item: float(item[1].get("updated_at") or item[1].get("created_at") or 0),
    )
    for job_id, _job in oldest[: len(_jobs) - _MAX_JOBS]:
        _jobs.pop(job_id, None)


def create_job(label: str = "Working") -> str:
    job_id = str(uuid.uuid4())
    now = _now()

    with _lock:
        _cleanup_locked(now)
        _jobs[job_id] = {
            "job_id": job_id,
            "label": label,
            "status": "running",
            "phase": label.lower(),
            "current": 0,
            "total": 0,
            "message": "",
            "result": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }

    return job_id


def update_job(
    job_id: str,
    *,
    label: str | None = None,
    phase: str | None = None,
    current: int | None = None,
    total: int | None = None,
    message: str | None = None,
    status: str | None = None,
    result: Any | None = None,
    error: str | None = None,
) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return

        if label is not None:
            job["label"] = label
        if phase is not None:
            job["phase"] = phase
        if current is not None:
            job["current"] = max(0, int(current))
        if total is not None:
            job["total"] = max(0, int(total))
        if message is not None:
            job["message"] = message
        if status is not None:
            job["status"] = status
        if result is not None:
            job["result"] = result
        if error is not None:
            job["error"] = error

        job["updated_at"] = _now()


def get_job(job_id: str) -> Dict[str, Any] | None:
    with _lock:
        _cleanup_locked()
        job = _jobs.get(job_id)
        return dict(job) if job else None


def finish_job(job_id: str, result: Any = None) -> None:
    update_job(
        job_id,
        label="Complete",
        phase="complete",
        status="done",
        result=result,
        message="Complete",
    )


def fail_job(job_id: str, error: str) -> None:
    update_job(
        job_id,
        label="Error",
        phase="error",
        status="error",
        error=error,
        message=error,
    )
