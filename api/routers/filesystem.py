from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
from typing import Any

# Because a requested feature was file sync on folders, to get the path we need a custom
# file dialog to get a path on the computer.
router = APIRouter(tags=["filesystem"])


def filesystem_root() -> Path:
    return Path.home() / "Documents" / "DeployableKnowledge"


def resolve_directory(rel_path: str = "") -> Path:
    root = filesystem_root().resolve()
    root.mkdir(parents=True, exist_ok=True)

    path = (root / rel_path).resolve()
    if path != root and root not in path.parents:
        raise HTTPException(
            status_code=400, detail="Directory path is outside the filesystem root."
        )
    if not path.exists():
        raise HTTPException(status_code=404, detail="Directory not found.")
    if not path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory.")
    return path


@router.get("/directory")
@router.get("/directory/{rel_path:path}")
async def list_directory(rel_path: str = ""):
    """Get data for a directory under the DeployableKnowledge filesystem root."""
    try:
        path = resolve_directory(rel_path)
        current_path = rel_path.strip("/")
        parent_path = None
        if current_path:
            parent_path = str(Path(current_path).parent).replace("\\", "/")
            if parent_path == ".":
                parent_path = ""

        items: list[dict[str, Any]] = []
        for entry in path.iterdir():
            entry_path = "/".join(part for part in [current_path, entry.name] if part)
            items.append(
                {
                    "name": entry.name,
                    "path": entry_path,
                    "kind": "folder" if entry.is_dir() else "file",
                }
            )

        items.sort(key=lambda item: (item["kind"] != "folder", item["name"].lower()))
        return JSONResponse(
            {
                "path": current_path,
                "parent": parent_path,
                "items": items,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
