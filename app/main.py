from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from config import BASE_DIR, UPLOAD_DIR
from contextlib import asynccontextmanager

from core.folder_watcher import start_folder_watcher, stop_folder_watcher
from app.routes.ui_routes import router as ui_router
from api.routers.chat import router as chat_router
from api.routers.search import router as search_router
from api.routers.ingest import router as ingest_router
from api.routers.settings import router as settings_router
from api.routers.corpus import router as corpus_router
from api.routers.filesystem import router as filesystem_router
from api.routers.folders import router as folders_router
from app.routes.api_sessions import router as sessions_router
from app.routes.api_segments import router as segments_router
from api.routers.ocr import router as ocr_router
from api.routers.progress import router as progress_router

from app.auth.session import setup_auth, load_settings_from_config


@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_folder_watcher()
    try:
        yield
    finally:
        await stop_folder_watcher()


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/documents", StaticFiles(directory=UPLOAD_DIR), name="documents")
manager, settings = setup_auth(app, load_settings_from_config())

# Register routes
app.include_router(ui_router)
app.include_router(chat_router)
app.include_router(search_router)
app.include_router(ingest_router)
app.include_router(sessions_router)
app.include_router(segments_router)
app.include_router(settings_router)
app.include_router(corpus_router)
app.include_router(filesystem_router)
app.include_router(folders_router)
app.include_router(ocr_router)
app.include_router(progress_router)