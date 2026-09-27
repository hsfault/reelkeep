"""
Reelkeep backend
Serves the built React app plus the API: health, fetch, thumbnails, ZIP jobs, cookies.
"""

import logging
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Route

import cookie_store
import ig
import zipper

# Windows sometimes maps .js to text/plain, which browsers refuse to run
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/manifest+json", ".webmanifest")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("reelkeep")

APP_VERSION = "1.0.0"
THUMB_HOSTS = ("cdninstagram.com", "fbcdn.net")
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
INDEX_FILE = FRONTEND_DIST / "index.html"
NO_CACHE = {"Cache-Control": "no-cache"}
IMMUTABLE = {"Cache-Control": "public, max-age=31536000, immutable"}
DAY_CACHE = {"Cache-Control": "public, max-age=86400"}


def error_response(code, message, status):
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


async def read_json(request):
    try:
        body = await request.json()
    except Exception:
        return None
    return body if isinstance(body, dict) else None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

async def health(request):
    return JSONResponse({
        "ok": True,
        "version": APP_VERSION,
        "cookies": ig.COOKIES_FILE.exists(),
        "downloads": str(zipper.downloads_dir()),
    })


# ---------------------------------------------------------------------------
# Fetch + thumbnails
# ---------------------------------------------------------------------------

async def fetch(request):
    if request.method == "POST":
        body = await read_json(request)
        if body is None:
            return error_response("bad_request", "Request body must be a JSON object.", 400)
        url = body.get("url", "")
        offset = body.get("offset", 0)
    else:
        url = request.query_params.get("url", "")
        offset = request.query_params.get("offset", "0")

    try:
        offset = int(offset)
    except (TypeError, ValueError):
        return error_response("bad_request", "Offset must be a number.", 400)

    try:
        result = await run_in_threadpool(ig.fetch_batch, str(url), offset)
    except ig.FetchError as err:
        return error_response(err.code, err.message, err.status)

    return JSONResponse(result)


def _allowed_thumb(src):
    parsed = urlparse(src)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(
        host == h or host.endswith("." + h) for h in THUMB_HOSTS
    )


async def thumb(request):
    src = request.query_params.get("src", "")
    if not _allowed_thumb(src):
        return error_response("bad_request", "Thumbnail source not allowed.", 400)

    try:
        upstream = await request.app.state.http.get(src)
    except httpx.HTTPError:
        return error_response("thumb_failed", "Couldn't load thumbnail.", 502)

    if upstream.status_code != 200:
        return error_response("thumb_failed", "Couldn't load thumbnail.", 502)

    return Response(
        upstream.content,
        media_type=upstream.headers.get("content-type", "image/jpeg"),
        headers=DAY_CACHE,
    )


# ---------------------------------------------------------------------------
# ZIP jobs
# ---------------------------------------------------------------------------

async def zip_start(request):
    body = await read_json(request)
    if body is None:
        return error_response("bad_request", "Request body must be a JSON object.", 400)
    try:
        job = await run_in_threadpool(zipper.start_job, body.get("username"), body.get("items"))
    except zipper.ZipError as err:
        return error_response(err.code, err.message, err.status)
    return JSONResponse(job, status_code=202)


async def zip_job(request):
    job_id = request.path_params["job_id"]
    try:
        if request.method == "DELETE":
            job = zipper.cancel_job(job_id)
        else:
            job = zipper.get_job(job_id)
    except zipper.ZipError as err:
        return error_response(err.code, err.message, err.status)
    return JSONResponse(job)


async def zip_file(request):
    try:
        path, filename = zipper.job_file(request.path_params["job_id"])
    except zipper.ZipError as err:
        return error_response(err.code, err.message, err.status)
    return FileResponse(path, media_type="application/zip", filename=filename)


# ---------------------------------------------------------------------------
# Cookies (Instagram login)
# ---------------------------------------------------------------------------

async def cookies_route(request):
    try:
        if request.method == "POST":
            body = await read_json(request)
            if body is None:
                return error_response("bad_request", "Request body must be a JSON object.", 400)
            info = await run_in_threadpool(cookie_store.save, body.get("content"))
        elif request.method == "DELETE":
            info = await run_in_threadpool(cookie_store.delete)
        else:
            info = await run_in_threadpool(cookie_store.status)
    except cookie_store.CookieError as err:
        return error_response(err.code, err.message, err.status)
    return JSONResponse(info)


# ---------------------------------------------------------------------------
# Frontend (built React app, single-page routing)
# ---------------------------------------------------------------------------

async def spa(request):
    path = request.path_params.get("path", "")

    if path == "api" or path.startswith("api/"):
        return error_response("not_found", "Unknown API route.", 404)

    if not INDEX_FILE.exists():
        return JSONResponse({
            "app": "reelkeep",
            "version": APP_VERSION,
            "note": "Frontend not built yet. Run 'npm run build' in the frontend folder.",
        })

    if path:
        root = FRONTEND_DIST.resolve()
        candidate = (FRONTEND_DIST / path).resolve()
        if candidate.is_file() and root in candidate.parents:
            if path.startswith("assets/"):
                headers = IMMUTABLE  # hashed filenames never change
            elif candidate.name in ("sw.js", "manifest.webmanifest"):
                headers = NO_CACHE
            else:
                headers = DAY_CACHE
            return FileResponse(candidate, headers=headers)

    # Any other path (/, /u/name, /settings) is a React route
    return FileResponse(INDEX_FILE, headers=NO_CACHE)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app):
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(20.0),
        follow_redirects=False,
    ) as client:
        app.state.http = client
        log.info("Reelkeep %s ready (ZIPs go to %s)", APP_VERSION, zipper.downloads_dir())
        if not INDEX_FILE.exists():
            log.warning("Frontend not built: %s is missing", INDEX_FILE)
        yield


routes = [
    Route("/api/health", health),
    Route("/api/fetch", fetch, methods=["GET", "POST"]),
    Route("/api/thumb", thumb),
    Route("/api/zip", zip_start, methods=["POST"]),
    Route("/api/zip/{job_id}", zip_job, methods=["GET", "DELETE"]),
    Route("/api/zip/{job_id}/file", zip_file),
    Route("/api/cookies", cookies_route, methods=["GET", "POST", "DELETE"]),
    # Must stay last: everything else is the React app
    Route("/", spa),
    Route("/{path:path}", spa),
]

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=DEV_ORIGINS,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )
]

app = Starlette(routes=routes, middleware=middleware, lifespan=lifespan)