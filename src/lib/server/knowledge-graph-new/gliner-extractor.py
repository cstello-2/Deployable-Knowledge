from __future__ import annotations

import json
import os
import sys


def evidence(text: str, head: dict, tail: dict) -> str:
    start = min(int(head.get("start", 0)), int(tail.get("start", 0)))
    end = max(int(head.get("end", start)), int(tail.get("end", start)))
    left = max(text.rfind(".", 0, start), text.rfind("\n", 0, start)) + 1
    stops = [position for position in (text.find(".", end), text.find("\n", end)) if position >= 0]
    right = min(stops) + 1 if stops else len(text)
    return text[left:right].strip()


def main() -> None:
    os.environ.setdefault("USE_TF", "0")
    import pyarrow as pa

    pa.PyExtensionType = getattr(pa, "PyExtensionType", pa.ExtensionType)
    try:
        from gliner import GLiNER
    except ImportError as error:
        raise SystemExit(
            f"GLiNER could not start: {error}. Install or repair it with: pip install gliner"
        )

    payload = json.load(sys.stdin)
    chunks = payload.get("chunks", [])
    texts = [str(chunk.get("content", "")) for chunk in chunks]
    entity_types = payload.get("entityTypes", [])
    relation_types = payload.get("relationTypes", [])
    model_name = os.getenv(
        "KNOWLEDGE_GRAPH_GLINER_MODEL",
        "knowledgator/gliner-relex-base-v1.0",
    )
    model = GLiNER.from_pretrained(model_name)
    entities_by_text, relations_by_text = model.inference(
        texts,
        labels=entity_types,
        relations=relation_types,
        threshold=float(os.getenv("KNOWLEDGE_GRAPH_GLINER_THRESHOLD", "0.5")),
        relation_threshold=float(
            os.getenv("KNOWLEDGE_GRAPH_GLINER_RELATION_THRESHOLD", "0.5")
        ),
        batch_size=int(os.getenv("KNOWLEDGE_GRAPH_GLINER_BATCH_SIZE", "4")),
    )

    output = []
    for chunk, text, entities, relations in zip(
        chunks, texts, entities_by_text, relations_by_text
    ):
        output.append(
            {
                "chunkId": chunk.get("chunkId"),
                "entities": [
                    {
                        "mention": item.get("text", ""),
                        "type": item.get("label", "unknown"),
                        "start": item.get("start", -1),
                        "end": item.get("end", -1),
                    }
                    for item in entities
                ],
                "assertions": [
                    {
                        "subject": item.get("head", {}).get("text", ""),
                        "subjectType": item.get("head", {}).get("type", "unknown"),
                        "rawPredicate": item.get("relation", ""),
                        "object": item.get("tail", {}).get("text", ""),
                        "objectType": item.get("tail", {}).get("type", "unknown"),
                        "evidence": evidence(
                            text, item.get("head", {}), item.get("tail", {})
                        ),
                        "startDate": None,
                        "endDate": None,
                        "status": "asserted",
                    }
                    for item in relations
                ],
            }
        )

    json.dump(output, sys.stdout)


if __name__ == "__main__":
    main()
