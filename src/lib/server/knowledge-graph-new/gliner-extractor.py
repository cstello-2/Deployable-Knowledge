from __future__ import annotations

import json
import os
import sys


def evidence_window(text: str, head: dict, tail: dict) -> str:
    start = min(int(head.get("start", 0)), int(tail.get("start", 0)))
    end = max(int(head.get("end", start)), int(tail.get("end", start)))
    left = max(text.rfind(mark, 0, start) for mark in (".", "!", "?", "\n")) + 1
    stops = [text.find(mark, end) for mark in (".", "!", "?", "\n")]
    stops = [position for position in stops if position >= 0]
    right = min(stops) + 1 if stops else len(text)
    return text[left:right].strip()


def main() -> None:
    os.environ.setdefault("USE_TF", "0")

    # Older pyarrow releases used by some GLiNER environments need this alias.
    import pyarrow as pa

    pa.PyExtensionType = getattr(pa, "PyExtensionType", pa.ExtensionType)
    from gliner import GLiNER

    payload = json.load(sys.stdin)
    chunks = payload["chunks"]
    model = GLiNER.from_pretrained(
        os.getenv(
            "KNOWLEDGE_GRAPH_GLINER_MODEL",
            "knowledgator/gliner-relex-large-v0.5",
        ),
        variant="fp16",
        max_length=512,
    )
    model.model.float()
    model.data_processor.transformer_tokenizer.model_max_length = 512
    checkpoint_size = max(
        1, int(os.getenv("KNOWLEDGE_GRAPH_GLINER_CHECKPOINT_SIZE", "8"))
    )
    for start in range(0, len(chunks), checkpoint_size):
        batch = chunks[start : start + checkpoint_size]
        texts = [str(chunk["content"]) for chunk in batch]
        entities_by_text, relations_by_text = model.inference(
            texts=texts,
            labels=list(payload["entityTypes"]),
            relations=payload["relationTypes"],
            threshold=float(os.getenv("KNOWLEDGE_GRAPH_GLINER_THRESHOLD", "0.4")),
            adjacency_threshold=float(
                os.getenv("KNOWLEDGE_GRAPH_GLINER_ADJACENCY_THRESHOLD", "0.55")
            ),
            relation_threshold=float(
                os.getenv("KNOWLEDGE_GRAPH_GLINER_RELATION_THRESHOLD", "0.75")
            ),
            batch_size=int(os.getenv("KNOWLEDGE_GRAPH_GLINER_BATCH_SIZE", "4")),
            return_relations=True,
            flat_ner=False,
        )

        for chunk, text, _entities, relations in zip(
            batch, texts, entities_by_text, relations_by_text
        ):
            print(
                json.dumps(
                    {
                        "chunkId": chunk["chunkId"],
                        "assertions": [
                            {
                                "subject": item["head"]["text"],
                                "subjectType": item["head"]["type"],
                                "rawPredicate": item["relation"],
                                "object": item["tail"]["text"],
                                "objectType": item["tail"]["type"],
                                "evidence": evidence_window(
                                    text, item["head"], item["tail"]
                                ),
                                "startDate": None,
                                "endDate": None,
                                "status": "asserted",
                                "score": item["score"],
                                "headStart": item["head"]["start"],
                                "headEnd": item["head"]["end"],
                                "tailStart": item["tail"]["start"],
                                "tailEnd": item["tail"]["end"],
                            }
                            for item in relations
                        ],
                    }
                ),
                flush=True,
            )


if __name__ == "__main__":
    main()
