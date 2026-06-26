from __future__ import annotations

import json
import sys

from embeddings import load_embedding_model


def main() -> int:
    sentences = json.loads(sys.stdin.read() or "[]")
    model = load_embedding_model()
    embeddings = model.encode(sentences, convert_to_tensor=False)
    sys.stdout.write(json.dumps(embeddings.tolist()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
