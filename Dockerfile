# 🐋 the docker image 🖼️ for Deployable Knowledge — I think it's tidiest to bake the
# model 🔮 + the chroma 🗃️ corpus 🏺 + the built graph 🕸️ right in, so the container 📦
# boots fully offline 📴 on Cloud Run ☁️ (or anywhere) with no setup ⚒️ at run ▶️ time ⏰.
#
# ⚠️ note 📝: the build 🔨 needs the data present locally first (it's gitignored), so run:
#   make setup && make embed-dir DATA_DIR=documents && make graph
FROM python:3.12-slim

# offline 📴 flags + a writable sqlite path (Cloud Run safely writes only under /tmp).
ENV PYTHONUNBUFFERED=1 \
    CHROMA_TELEMETRY_ENABLED=false \
    EMBEDDINGS_OFFLINE_ONLY=1 \
    TOKENIZERS_PARALLELISM=false \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    DATABASE_PATH=/tmp/app.db \
    PORT=8080

WORKDIR /app

# a couple of system libs 📦 the wheels (pymupdf, onnxruntime) like to have around.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# install 📦 the python 🐲 deps first, so this layer caches between code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# the app 🪧 + the baked data (model 🔮, chroma 🗃️, graph 🕸️, documents 📄).
COPY . .

# Cloud Run hands us $PORT; the server 🗄️ listens on it for the whole internet 🌐.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
