from __future__ import annotations
from pathlib import Path
from typing import List, Dict, Optional, Any, Callable
import re

from config import CHROMA_DB_DIR, COLLECTION_NAME
from core.corpus_registry import get_inactive_sources
from .chunking import pagerank_chunk_text
from .chunking import parse_pdf

import uuid

ProgressCallback = Callable[[int, int, str], None]


def sanitize_metadata_for_chroma(metadata: dict) -> dict:
    """
    Chroma metadata values must be str, int, float, or bool.
    This removes None values and converts unsupported values to strings.
    """
    clean = {}

    for key, value in metadata.items():
        if value is None:
            continue

        if isinstance(value, (str, int, float, bool)):
            clean[key] = value
            continue

        if isinstance(value, (list, tuple, dict)):
            clean[key] = str(value)
            continue

        clean[key] = str(value)

    return clean


def _load_embedding_model():
    from .embeddings import load_embedding_model

    return load_embedding_model()


def _extract_pdf_image_segments(file_path: Path) -> List[Dict[str, Any]]:
    from core.ocr.pdf_image_ocr import extract_pdf_image_segments

    return extract_pdf_image_segments(file_path)


class DBManager:
    """Minimal wrapper around ChromaDB providing embedding utilities."""

    def __init__(self, persist_dir: str, collection_name: str, model=None):
        import chromadb
        from chromadb.config import Settings

        self.client = chromadb.PersistentClient(
            path=str(persist_dir), settings=Settings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(collection_name)
        self.model = model

    def clear_collection(self, batch_size: int = 500) -> None:
        """Remove all records from the collection in batches."""

        all_ids = self.collection.get()["ids"]
        total = len(all_ids)
        for i in range(0, total, batch_size):
            batch = all_ids[i : i + batch_size]
            self.collection.delete(ids=batch)

    def embed(self, docs: List[str], max_batch_tokens: int = 5120):
        """Embed ``docs`` using the stored sentence-transformer model."""

        embeddings: List[List[float]] = []
        current_batch: List[str] = []
        current_tokens = 0
        if self.model is None:
            self.model = _load_embedding_model()
        tokenizer = self.model.tokenizer
        for doc in docs:
            tokens = tokenizer.encode(doc, truncation=True, max_length=512)
            truncated_doc = tokenizer.decode(tokens, skip_special_tokens=True)
            num_tokens = len(tokens)
            if num_tokens > max_batch_tokens:
                embeddings.append(self.model.encode(truncated_doc))
                continue
            if current_tokens + num_tokens > max_batch_tokens:
                embeddings.extend(self.model.encode(current_batch))
                current_batch = [truncated_doc]
                current_tokens = num_tokens
            else:
                current_batch.append(truncated_doc)
                current_tokens += num_tokens
        if current_batch:
            embeddings.extend(self.model.encode(current_batch))
        return embeddings

    def build_entry(
        self,
        segment_text: str,
        segment_index: int,
        source: str,
        tags: Optional[List[str]] = None,
        start: Optional[int] = None,
        end: Optional[int] = None,
        extra_metadata: Optional[Dict[str, Any]] = None,
    ):
        """Build the ID, document and metadata tuple for a segment."""

        segment_uuid = str(uuid.uuid4())
        metadata = {
            "uuid": segment_uuid,
            "source": source,
            "metadata_tags": ", ".join(tags) if tags else "Placeholder",
            "segment_index": segment_index,
            "priority": "medium",
        }
        if start is not None and end is not None:
            metadata["start_char"] = start
            metadata["end_char"] = end

        if extra_metadata:
            metadata.update(extra_metadata)

        metadata = sanitize_metadata_for_chroma(metadata)
        return segment_uuid, segment_text, metadata

    def add_segments(
        self,
        segments: List[str],
        source: str,
        tags: Optional[List[str]] = None,
        positions: Optional[List[tuple]] = None,
        page: Optional[List[Optional[int]]] = None,
        metadata: Optional[List[Dict[str, Any]]] = None,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> None:
        """Add many text ``segments`` to the collection."""

        ids: List[str] = []
        docs: List[str] = []
        metas: List[dict] = []
        total_segments = len(segments)

        for i, segment in enumerate(segments):
            start, end = positions[i] if positions else (-1, -1)
            p = page[i] if page else None
            extra_meta = metadata[i] if metadata and i < len(metadata) else {}
            if p is not None:
                extra_meta = dict(extra_meta)
                extra_meta["page"] = p
            _id, doc, meta = self.build_entry(
                segment_text=segment,
                segment_index=i,
                source=source,
                tags=tags,
                start=start,
                end=end,
                extra_metadata=extra_meta,
            )

            ids.append(_id)
            docs.append(doc)
            metas.append(meta)
        batch_size = 1000
        completed = 0
        for i in range(0, len(docs), batch_size):
            batch_ids = ids[i : i + batch_size]
            batch_docs = docs[i : i + batch_size]
            batch_metas = metas[i : i + batch_size]
            if progress_callback:
                progress_callback(
                    completed,
                    total_segments,
                    f"Embedding chunks for {source}",
                )
            batch_embeddings = self.embed(batch_docs)
            self.collection.add(
                ids=batch_ids,
                documents=batch_docs,
                metadatas=batch_metas,
                embeddings=batch_embeddings,
            )

            completed += len(batch_docs)
            if progress_callback:
                progress_callback(
                    completed,
                    total_segments,
                    f"Embedded {completed}/{total_segments} chunks from {source}",
                )

    def delete_by_source(self, source_name: str, batch_size: int = 500) -> None:
        """Remove all segments originating from ``source_name``."""

        all_data = self.collection.get(include=["metadatas"])
        to_delete = [
            id_
            for id_, meta in zip(all_data["ids"], all_data["metadatas"])
            if meta.get("source") == source_name
        ]
        for i in range(0, len(to_delete), batch_size):
            batch = to_delete[i : i + batch_size]
            self.collection.delete(ids=batch)


# --- Lazy loader ---
_db: Optional[DBManager] = None


def get_db() -> DBManager:
    """Return a singleton instance of :class:`DBManager`."""

    global _db
    if _db is None:
        _db = DBManager(persist_dir=CHROMA_DB_DIR, collection_name=COLLECTION_NAME)
    return _db


class LazyDB:
    """Proxy object lazily instantiating :class:`DBManager` on access."""

    def __getattr__(self, name):
        return getattr(get_db(), name)


db = LazyDB()

# --- Chunking helpers from embedding_and_storing ---


def chunk_text(text: str) -> List[Any]:
    """Split ``text`` into ranked chunks for ingestion."""

    return pagerank_chunk_text(text, model=get_db().model, sim_threshold=0.7)


def is_table_chunk(text: str) -> bool:
    return text.lstrip().startswith("[Table:")


def extract_table_chunks(text: str) -> List[Any]:
    """Return inline table markers as standalone chunks."""

    chunks = []
    for idx, match in enumerate(re.finditer(r"\[Table: .*?\]", text, flags=re.DOTALL)):
        chunks.append(
            (
                match.group(0),
                {
                    "chunk_idx": idx,
                    "char_range": match.span(),
                    "num_sentences": 1,
                    "table": True,
                },
            )
        )
    return chunks


def is_all_caps(text: str, threshold: float = 0.8) -> bool:
    """Heuristic to filter shouty text segments."""

    cleaned = re.sub(r"[\W\d_]+", "", text)
    if not cleaned:
        return False
    upper_count = sum(1 for c in cleaned if c.isupper())
    return (upper_count / len(cleaned)) >= threshold


def has_repeated_substring(text: str, patterns: Optional[List[str]] = None) -> bool:
    """Detect visually noisy substrings such as ellipses or dashes."""

    chars = re.sub(r"\s+", "", text)
    patterns = patterns or [r"\.{3,}", r"-{3,}", r"_{3,}"]
    return any(re.search(p, chars) for p in patterns)


def keep_chunk(chunk: str, filter_chunks: bool) -> bool:
    if is_table_chunk(chunk):
        return True
    if filter_chunks and (is_all_caps(chunk) or has_repeated_substring(chunk)):
        return False
    return len(chunk.split()) >= 5


def extract_text(file_path: Path) -> List[Dict[str, Any]]:
    """Extract raw text and page numbers from ``file_path``."""

    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        parsed = parse_pdf(str(file_path))
        if not isinstance(parsed, list):
            raise TypeError(f"parse_pdf returned unexpected type: {type(parsed)}")
        return parsed
    if suffix == ".txt":
        text = file_path.read_text(encoding="utf-8")
        return [{"page": 1, "text": text}]
    raise ValueError(f"Unsupported file type: {file_path.suffix}")


def embed_file(
    file_path: Path,
    source_name: Optional[str] = None,
    tags: Optional[List[str]] = None,
    filter_chunks: bool = True,
    include_image_ocr: bool = True,
    progress_callback: Optional[ProgressCallback] = None,
) -> None:
    """Embed a single file into the vector store."""

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    source = source_name or file_path.name
    if progress_callback:
        progress_callback(0, 100, f"Extracting text from {source}")
    pages_dicts = extract_text(file_path)
    if progress_callback:
        progress_callback(10, 100, f"Chunking text from {source}")
    all_chunks: List[Any] = []

    # Normal text and table chunks.
    for page in pages_dicts:
        page_num = page.get("page") or 1
        page_text = page.get("text", "")
        chunks_with_meta = chunk_text(page_text) + extract_table_chunks(page_text)
        seen_page_chunks = set()
        for chunk_text_, meta in chunks_with_meta:
            if chunk_text_ in seen_page_chunks:
                continue
            seen_page_chunks.add(chunk_text_)
            meta["page"] = page_num
            meta["content_type"] = "table" if meta.get("table") else "text"
            all_chunks.append((chunk_text_, meta))

    all_chunks = [
        (chunk, meta) for chunk, meta in all_chunks if keep_chunk(chunk, filter_chunks)
    ]

    # Separate image OCR chunks.
    if include_image_ocr and file_path.suffix.lower() == ".pdf":
        try:
            if progress_callback:
                progress_callback(35, 100, f"Running image OCR for {source}")

            image_segments = _extract_pdf_image_segments(file_path)
            for image_segment in image_segments:
                image_text = image_segment.get("text", "")
                if not image_text.strip():
                    continue

                image_meta = {
                    "page": image_segment.get("page"),
                    "content_type": image_segment.get("content_type", "image_ocr"),
                    "image_index": image_segment.get("image_index"),
                    "source_file": image_segment.get("source_file"),
                }
                all_chunks.append((image_text, image_meta))
        except Exception as e:
            print(f"[WARN] Image OCR failed for {file_path}: {e}")

    segments = [chunk for chunk, _ in all_chunks]
    positions = []
    for _, meta in all_chunks:
        char_range = meta.get("char_range")

        if isinstance(char_range, tuple) and len(char_range) == 2:
            positions.append(char_range)
        else:
            positions.append((-1, -1))

    pages = [meta.get("page") for _, meta in all_chunks]
    metadata = []
    for _, meta in all_chunks:
        item = {
            "content_type": meta.get("content_type", "text"),
        }
        if meta.get("page") is not None:
            item["page"] = meta.get("page")
        if meta.get("image_index") is not None:
            item["image_index"] = meta.get("image_index")
        if meta.get("source_file") is not None:
            item["source_file"] = meta.get("source_file")
        if meta.get("table") is not None:
            item["table"] = meta.get("table")

        char_range = meta.get("char_range")

        if isinstance(char_range, tuple) and len(char_range) == 2:
            start_char, end_char = char_range
            if start_char is not None:
                item["start_char"] = start_char
            if end_char is not None:
                item["end_char"] = end_char

        metadata.append(item)

    if not segments:
        if progress_callback:
            progress_callback(100, 100, f"No usable chunks found in {source}")
        return

    if progress_callback:
        progress_callback(45, 100, f"Preparing {len(segments)} chunks from {source}")

    get_db().add_segments(
        segments=segments,
        source=source,
        tags=tags or ["embedded"],
        positions=positions,
        page=pages,
        metadata=metadata,
        progress_callback=progress_callback,
    )

    if progress_callback:
        progress_callback(100, 100, f"Finished embedding {source}")


def embed_directory(
    data_dir: str,
    clear_collection: bool = False,
    default_tags: Optional[List[str]] = None,
    filter_chunks: bool = False,
) -> None:
    """Embed all supported files under ``data_dir``."""

    data_path = Path(data_dir)
    if not data_path.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")
    if clear_collection:
        get_db().clear_collection()
    for file_path in data_path.iterdir():
        if file_path.suffix.lower() not in {".txt", ".pdf"}:
            continue
        embed_file(
            file_path=file_path,
            source_name=file_path.name,
            tags=default_tags or ["embedded"],
            filter_chunks=filter_chunks,
            include_image_ocr=True,
        )


def search(
    query: str, top_k: int = 5, exclude_sources: Optional[set] = None
) -> List[Dict]:
    """Perform a vector similarity search over embedded segments."""

    if top_k <= 0:
        return []

    embedding = get_db().embed([query])[0]
    results = get_db().collection.query(query_embeddings=[embedding], n_results=top_k)
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    scores = results.get("distances", [[]])[0]
    ids = list(results.get("ids", [[]])[0] or [])
    if len(ids) < len(documents):
        ids.extend([None] * (len(documents) - len(ids)))
    ids = ids[: len(documents)]
    merged_exclude = set(exclude_sources or [])
    merged_exclude.update(get_inactive_sources())

    # Chroma returns ascending distance (best match first). Keep that order and
    # expose score as a higher-is-better similarity so the UI matches user expectations.
    rows: List[tuple[float, Dict]] = []
    for doc, meta, dist, seg_id in zip(documents, metadatas, scores, ids):
        src = meta.get("source", "unknown")
        if src in merged_exclude:
            continue
        d = float(dist) if dist is not None else float("inf")
        sim = None if d == float("inf") else 1.0 / (1.0 + d)
        rows.append(
            (
                d,
                {
                    "text": doc.strip().replace("\n", " "),
                    "source": src,
                    "score": sim,
                    "page": meta.get("page", None),
                    "segment_id": seg_id,
                },
            )
        )
    rows.sort(key=lambda t: t[0])
    return [item for _, item in rows]
