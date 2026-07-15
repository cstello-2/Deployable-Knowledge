from __future__ import annotations

import json
import sys
from typing import Any

MODEL_NAME = "knowledgator/gliner-relex-base-v1.0"

_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is None:
        from gliner import GLiNER

        _MODEL = GLiNER.from_pretrained(MODEL_NAME)
    return _MODEL


def _coerce_labels(labels: list[str] | None) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for label in labels or []:
        normalized = str(label).strip()
        if normalized and normalized.lower() not in seen:
            seen.add(normalized.lower())
            ordered.append(normalized)
    return ordered


def _fallback_entities(text: str, labels: list[str] | None) -> list[dict[str, Any]]:
    candidates = _coerce_labels(labels)
    found: list[dict[str, Any]] = []
    lowered = text.lower()
    for label in candidates:
        if label.lower() in lowered:
            found.append({"label": label, "kind": "unknown"})
    return found


def _extract_entity_payload(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None

    entity_text = str(
        item.get("text")
        or item.get("entity")
        or item.get("name")
        or item.get("value")
        or item.get("mention")
        or item.get("label")
        or ""
    ).strip()
    if not entity_text:
        return None

    entity_kind = str(
        item.get("kind")
        or item.get("type")
        or item.get("entity_type")
        or item.get("entityType")
        or item.get("label")
        or "unknown"
    ).strip()

    if not entity_kind:
        entity_kind = "unknown"

    return {"label": entity_text, "kind": entity_kind}


def inference(text: str, labels: list[str] | None = None) -> dict[str, Any]:
    if not text or not text.strip():
        return {"entities": [], "relations": []}

    candidate_labels = _coerce_labels(labels)
    if not candidate_labels:
        candidate_labels = [
            "person",
            "organization",
            "location",
            "condition",
            "treatment",
            "protocol",
            "technology",
            "system",
            "concept",
            "event",
            "artifact",
            "date",
            "quantity",
            "unknown",
        ]

    try:
        model = _load_model()
        predictions = model.predict_entities(text, labels=candidate_labels)
        entities: list[dict[str, Any]] = []
        for item in predictions or []:
            payload = _extract_entity_payload(item)
            if payload:
                entities.append(payload)

        relations: list[dict[str, Any]] = []
        for index, source in enumerate(entities):
            for target in entities[index + 1 :]:
                if source.get("label") and target.get("label"):
                    relations.append(
                        {
                            "source": source["label"],
                            "target": target["label"],
                            "relation": "CO_OCCURS_WITH",
                        }
                    )
        return {"entities": entities, "relations": relations}
    except Exception as exc:
        print(f"GLiNER inference failed: {exc}", file=sys.stderr)
        return {"entities": _fallback_entities(text, candidate_labels), "relations": []}


def main() -> None:
    payload = json.load(sys.stdin)
    text = str(payload.get("text", ""))
    labels = payload.get("labels", [])
    result = inference(text, labels if isinstance(labels, list) else [])
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
