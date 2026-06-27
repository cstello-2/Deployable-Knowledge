from __future__ import annotations
from typing import Iterator, List
import json

from .models import ChatRequest, ChatResponse, ChatChunk, Source
from .prompts import renderer
from .rag import retriever
from .rag import graph as kg
from config import GRAPH_ENABLED


def _retrieve(req: ChatRequest) -> List[dict]:
    """fetch the context 📜 for one chat 🗨️ turn 🔄.

    uses graph‑augmented retrieval when ``GRAPH_ENABLED`` is set and a graph 🕸️ is built;
    otherwise it falls back to plain vector ↗️ search 🔎. ``graph_search`` itself degrades 📉
    to vector search when there's no graph file 🖇️ around.
    """
    exclude = set(req.inactive_sources or [])
    if GRAPH_ENABLED:
        return kg.graph_search(req.message, top_k=req.top_k, exclude_sources=exclude)
    return retriever.search(req.message, top_k=req.top_k, exclude_sources=exclude)


def _to_sources(blocks: List[dict]) -> List[Source]:
    """Convert raw retrieval blocks into :class:`Source` objects."""

    out: List[Source] = []
    for i, b in enumerate(blocks):
        seg = b.get("segment_id")
        out.append(
            Source(
                id=str(seg) if seg is not None else str(i),
                title=b.get("source"),
                filepath=b.get("source"),
                page=b.get("page"),
                score=b.get("score"),
                text=b.get("text"),
            )
        )
    return out


def chat_once(req: ChatRequest) -> ChatResponse:
    """Execute a full chat turn and return the complete response."""

    context = _retrieve(req)
    prompt = renderer.build_prompt(
        summary="",
        history=[],
        user_message=req.message,
        context_blocks=context,
        persona=req.persona,
        template_id=req.template_id,
    )
    llm_kwargs = {"user_id": req.user_id, "template_id": req.template_id}
    if req.provider_id:
        llm_kwargs["provider_id"] = req.provider_id
    if req.model_id:
        llm_kwargs["model_id"] = req.model_id
    text = renderer.ask_llm(prompt, **llm_kwargs)
    return ChatResponse(text=text, sources=_to_sources(context), usage={})


def chat_stream(req: ChatRequest) -> Iterator[ChatChunk]:
    """Yield chat response chunks as they are produced by the LLM."""

    context = _retrieve(req)
    meta = json.dumps({"top_k": req.top_k, "template": req.template_id, "context": context})
    yield ChatChunk(type="meta", text=meta)
    
    prompt = renderer.build_prompt(
        summary="",
        history=[],
        user_message=req.message,
        context_blocks=context,
        persona=req.persona,
        template_id=req.template_id,
    )

    llm_kwargs = {"user_id": req.user_id, "template_id": req.template_id}
    if req.provider_id:
        llm_kwargs["provider_id"] = req.provider_id
    if req.model_id:
        llm_kwargs["model_id"] = req.model_id
    for token in renderer.stream_llm(prompt, **llm_kwargs):
        yield ChatChunk(type="delta", text=token)
    yield ChatChunk(type="done", sources=_to_sources(context), usage={})
