from __future__ import annotations
from functools import lru_cache
from pathlib import Path
from sentence_transformers import SentenceTransformer

try:
    from huggingface_hub import snapshot_download  # optional
except Exception:
    snapshot_download = None

from config import EMBEDDING_MODEL_ID, EMBEDDINGS_DEVICE, EMBEDDINGS_OFFLINE_ONLY, MODEL_DIR


def _local_model_present(model_dir: Path) -> bool:
    """Return ``True`` if ``model_dir`` appears to contain a model."""

    return model_dir.exists() and any(model_dir.iterdir())


def fetch_model_if_needed(model_id: str = EMBEDDING_MODEL_ID, model_dir: Path = MODEL_DIR) -> Path:
    """Ensure the embedding model exists locally and return its directory."""

    if _local_model_present(model_dir):
        return model_dir
    if EMBEDDINGS_OFFLINE_ONLY:
        raise RuntimeError(f"Offline-only mode set, but model not found at {model_dir}")
    if snapshot_download is None:
        raise RuntimeError("huggingface_hub not available to fetch model.")
    try:
        snapshot_download(
            repo_id=model_id,
            local_dir=str(model_dir),
            local_dir_use_symlinks=False,
            allow_patterns=None,
            ignore_patterns=["*.safetensors.index.json"],
        )
    except Exception as e:
        msg = str(e).lower()
        if "ssl" in msg or "certificate" in msg or "cert_verify" in msg:
            raise RuntimeError(
                "Embedding model download failed due to SSL certificate verification "
                "(common on corporate networks). Options: (1) set environment variable "
                "HF_HUB_DISABLE_SSL_VERIFICATION=1 for this session only, (2) set "
                "SSL_CERT_FILE to your organization root CA bundle, or (3) copy a "
                f"pre-downloaded model folder into {model_dir}."
            ) from e
        raise
    return model_dir


@lru_cache(maxsize=1)
def load_embedding_model(force_fetch: bool = False) -> SentenceTransformer:
    """Load the sentence-transformer embedding model, caching the instance."""

    model_dir = Path(MODEL_DIR)
    if force_fetch:
        fetch_model_if_needed()
    elif not _local_model_present(model_dir):
        if EMBEDDINGS_OFFLINE_ONLY:
            raise RuntimeError(f"Model cache missing at {model_dir} and offline-only is enabled.")
        fetch_model_if_needed()
    if not _local_model_present(model_dir):
        raise RuntimeError(
            f"No embedding model files found under {model_dir}. "
            "Run the launcher once with network access, or copy a cached model into that folder."
        )
    return SentenceTransformer(str(model_dir), device=EMBEDDINGS_DEVICE)
