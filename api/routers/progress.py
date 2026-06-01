from fastapi import APIRouter, HTTPException

from core.progress import get_job

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/{job_id}")
def read_progress(job_id: str):
    job = get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Progress job not found")

    total = job.get("total") or 0
    current = job.get("current") or 0

    percent = 0
    if total > 0:
        percent = min(100, round((current / total) * 100, 1))

    return {
        **job,
        "percent": percent,
    }
