# === Offline-friendly env ===
export CHROMA_TELEMETRY_ENABLED=false

# === Config (override with: make VAR=...) ===
VENV_NAME ?= venv
PYTHON    ?= python3
PIP       := $(VENV_NAME)/bin/pip
PY        := $(VENV_NAME)/bin/python
UVICORN   := $(VENV_NAME)/bin/uvicorn
APP_MODULE?= app.main:app
MODEL_ID  ?= sentence-transformers/all-MiniLM-L6-v2


.PHONY: setup ensure-venv venv install fetch-model verify-offline run dev embed-dir graph graph-stats neo4j-up graph-neo4j neo4j-down deploy-gcp clean test seed-prompts

# ---------- ONLINE SETUP ----------
setup: export TRANSFORMERS_OFFLINE=0
setup: export HF_DATASETS_OFFLINE=0
setup: export HF_HUB_OFFLINE=0
setup: ensure-venv install fetch-model

ensure-venv:
	@if [ ! -x "$(PY)" ] || ! "$(PY)" -c "import sys" >/dev/null 2>&1; then \
	  echo "Creating Python virtualenv with $(PYTHON)..."; \
	  rm -rf "$(VENV_NAME)"; \
	  "$(PYTHON)" -m venv "$(VENV_NAME)"; \
	fi
	$(PIP) install --upgrade pip "setuptools<82" wheel

venv: ensure-venv

install: ensure-venv
	$(PIP) install -r requirements.txt

# Cache the embedding model into config.MODEL_DIR
fetch-model: export TRANSFORMERS_OFFLINE=0
fetch-model: export HF_DATASETS_OFFLINE=0
fetch-model: export HF_HUB_OFFLINE=0
fetch-model: export EMBEDDINGS_OFFLINE_ONLY=0
fetch-model: ensure-venv
	@echo "📥 Caching embedding model ($(MODEL_ID))..."
	@PYTHONPATH=. $(PY) -c "from core.rag.embeddings import load_embedding_model; load_embedding_model(True); print('✓ cached via embeddings')" || \
	( echo 'model_utils failed; falling back to huggingface_hub…' && \
	  PYTHONPATH=. $(PY) -c "from huggingface_hub import snapshot_download; from config import MODEL_DIR as MD; snapshot_download(repo_id='$(MODEL_ID)', local_dir=str(MD), local_dir_use_symlinks=False); print('✓ cached under', MD)" )

# ---------- OFFLINE CHECK ----------
verify-offline: export TRANSFORMERS_OFFLINE=1
verify-offline: export HF_DATASETS_OFFLINE=1
verify-offline: export HF_HUB_OFFLINE=1
verify-offline: export EMBEDDINGS_OFFLINE_ONLY=1
verify-offline:
	@if [ -x "$(PY)" ]; then PYBIN="$(PY)"; else echo "⚠️  $(PY) missing; falling back to $(PYTHON)"; PYBIN="$(PYTHON)"; fi; \
	PYTHONPATH=. $$PYBIN -c "from core.rag.embeddings import load_embedding_model as L; m=L(); print('offline OK:', m.get_sentence_embedding_dimension())" || \
	PYTHONPATH=. $$PYBIN -c "from sentence_transformers import SentenceTransformer; from config import MODEL_DIR as MD; SentenceTransformer(str(MD)); print('offline OK via direct local model path ✓')"

# ---------- RUN ----------
run: fetch-model
	@if [ -x "$(UVICORN)" ]; then \
	  $(UVICORN) $(APP_MODULE) --host 127.0.0.1 --port 8000; \
	else \
	  echo "❌ $(UVICORN) not found. Run 'make setup' (online) first."; \
	  exit 127; \
	fi

dev:
	$(UVICORN) $(APP_MODULE) --host 127.0.0.1 --port 8000 --reload

# ---------- OPTIONAL: batch embed without API ----------
embed-dir:
	@echo "Embedding from documents/ (override with: make embed-dir DATA_DIR=path)"
	@PYTHONPATH=. $(PY) -c "from core.rag.retriever import embed_directory; embed_directory(data_dir='$${DATA_DIR:-documents}')"

# ---------- KNOWLEDGE 🎓 GRAPH 🕸️ ----------
# build 🔨 the knowledge graph from chunks 🧱 already embedded 🧮 in ChromaDB 🗃️.
graph:
	@PYTHONPATH=. $(PY) -m core.rag.graph build

graph-stats:
	@PYTHONPATH=. $(PY) -m core.rag.graph stats

# ---------- NEO4J 🔷 (interactive 🕹️ graph 🕸️ viewer 🖼️) ----------
# bring up the neo4j service 🛎️ (docker 🐋), load the built graph, then tear it down.
neo4j-up:
	docker compose up -d neo4j
	@echo "⏳ neo4j starting on bolt://localhost:7687 (give it ~15s), browser at http://localhost:7474"

graph-neo4j:
	@PYTHONPATH=. $(PY) -m core.rag.graph neo4j

neo4j-down:
	docker compose down

# ---------- DEPLOY ☁️ (Google Cloud Run) ----------
# put it on the internet 🌐. needs (once): `gcloud auth login`, a project 🏗️ with
# billing 💳, and the run + cloudbuild APIs enabled. then this 1️⃣ command builds 🔨
# the image 🖼️ from the baked data and hands you a public https url 🔗.
GCP_REGION  ?= us-central1
GCP_SERVICE ?= deployable-knowledge
deploy-gcp:
	gcloud run deploy $(GCP_SERVICE) --source . --region $(GCP_REGION) \
	  --allow-unauthenticated --memory 4Gi --cpu 2 --timeout 600 --port 8080

# ---------- housekeeping ----------
clean:
	rm -rf $(VENV_NAME)
	rm -rf chroma_db/
	rm -rf graph_store/
	rm -rf app.db

test:
	pytest -q

seed-prompts:
	@$(PYTHON) -c "from core.settings import list_prompt_templates as L; t=L(); assert t, 'no prompt templates found'; print('templates:', [x.id for x in t])"
