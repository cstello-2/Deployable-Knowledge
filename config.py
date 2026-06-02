from pathlib import Path
import os

# === Base Paths ===
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "documents"
PDF_DIR = BASE_DIR / "pdfs"
MODEL_DIR = BASE_DIR / "tmp_model"

# === ChromaDB ===
CHROMA_DB_DIR = BASE_DIR / "chroma_db"
COLLECTION_NAME = "default_collection"

# === SQL Database ===
_database_path = os.getenv("DATABASE_PATH")
DATABASE_PATH = Path(_database_path).expanduser() if _database_path else BASE_DIR / "app.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATABASE_PATH}")
DATABASE_ECHO = os.getenv("DATABASE_ECHO", "0") == "1"

# === Embedding Model ===
# Always point to a local directory for offline model loading
EMBEDDING_MODEL_ID = os.getenv("EMBEDDING_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDINGS_DEVICE = os.getenv("EMBEDDINGS_DEVICE", "cpu")
EMBEDDINGS_OFFLINE_ONLY = os.getenv("EMBEDDINGS_OFFLINE_ONLY", "0") == "1"

# === Security ===
ALLOWED_DOCUMENT_EXTENSIONS = {".txt", ".pdf", ".md", ".html"}
MIN_TOP_K = 1
MAX_TOP_K = 20

# === Ollama ===
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")
# Backwards compatibility for legacy code expecting OLLAMA_URL
OLLAMA_URL = f"{OLLAMA_BASE_URL}/api/generate"

# === OpenAI ===
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")

# === Anthropic ===
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
ANTHROPIC_VERSION = os.getenv("ANTHROPIC_VERSION", "2023-06-01")

# === Gemini ===
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# === GitHub Models ===
GITHUB_MODELS_TOKEN = os.getenv("GITHUB_MODELS_TOKEN", "")
GITHUB_MODELS_BASE_URL = os.getenv("GITHUB_MODELS_BASE_URL", "https://models.github.ai")
GITHUB_MODELS_MODEL = os.getenv("GITHUB_MODELS_MODEL", "openai/gpt-4.1")
GITHUB_MODELS_API_VERSION = os.getenv("GITHUB_MODELS_API_VERSION", "2026-03-10")
GITHUB_MODELS_ORG = os.getenv("GITHUB_MODELS_ORG", "")

# === Prompt Templates ===
PROMPTS_DIR = BASE_DIR / "prompts"
