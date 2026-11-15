import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import ai_routes, auth, board, db
from app.ai import AIUnavailable
from app.board_service import NotFound

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="PM Kanban", lifespan=lifespan)
# Signed, HttpOnly cookie. Without SESSION_SECRET a random key is used, so sessions end on restart.
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET") or secrets.token_hex(32),
    same_site="lax",
)
app.include_router(auth.router)
app.include_router(board.router)
app.include_router(ai_routes.router)


@app.middleware("http")
async def revalidate_pages(request: Request, call_next):
    """Pages must be revalidated, or browsers keep an old index.html pointing at old JS after a rebuild.
    Hashed files under /_next/static/ never change, so they may stay cached."""
    response = await call_next(request)
    if not request.url.path.startswith(("/api/", "/_next/static/")):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.exception_handler(NotFound)
def not_found(_: Request, exc: NotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": f"Not found: {exc}"})


@app.exception_handler(AIUnavailable)
def ai_unavailable(_: Request, exc: AIUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": f"AI unavailable: {exc}"})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Registered last so /api routes take precedence. The Next.js export is copied here in Docker.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
