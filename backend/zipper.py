"""
Reelkeep - ZIP jobs.

Downloads the selected videos one by one into a ZIP in the Downloads folder
(PC: ~/Downloads/Reelkeep, Termux: phone Downloads/Reelkeep) and reports
progress that the frontend polls.
"""

import logging
import re
import threading
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import requests

log = logging.getLogger("reelkeep.zip")

BASE_DIR = Path(__file__).resolve().parent
TMP_DIR = BASE_DIR / "data" / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)

VIDEO_HOSTS = ("cdninstagram.com", "fbcdn.net")
MAX_ITEMS = 1000            # safety cap per ZIP
RETRIES = 2                 # extra attempts per video
CHUNK = 256 * 1024
JOB_TTL = 60 * 60           # forget finished jobs after an hour (files stay)
USER_AGENT = "Mozilla/5.0"  # same header gallery-dl uses for video downloads

# Leftover temp files from a previous crash
for leftover in TMP_DIR.glob("*"):
    try:
        leftover.unlink()
    except OSError:
        pass


class ZipError(Exception):
    """Error with a code + friendly message the frontend can show."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class _Cancelled(Exception):
    pass


def downloads_dir():
    termux = Path.home() / "storage" / "downloads"
    base = termux if termux.exists() else Path.home() / "Downloads"
    out = base / "Reelkeep"
    out.mkdir(parents=True, exist_ok=True)
    return out


def _safe(text, fallback="video"):
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(text or "")).strip("._")
    return cleaned[:60] or fallback


def _allowed(url):
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(
        host == h or host.endswith("." + h) for h in VIDEO_HOSTS
    )


# ---------------------------------------------------------------------------
# Job registry
# ---------------------------------------------------------------------------

_jobs = {}
_jobs_lock = threading.Lock()


def _public(job):
    return {
        "id": job["id"],
        "username": job["username"],
        "status": job["status"],          # running | done | error | cancelled
        "total": job["total"],
        "done": job["done"],
        "bytes": job["bytes"],
        "failed": list(job["failed"]),
        "filename": job["filename"],
        "saved_to": job["path"] if job["status"] == "done" else None,
        "error": job["error"],
    }


def _cleanup_locked():
    now = time.time()
    for job_id, job in list(_jobs.items()):
        if job["finished"] and now - job["finished"] > JOB_TTL:
            del _jobs[job_id]


def _get(job_id):
    with _jobs_lock:
        job = _jobs.get(str(job_id))
    if job is None:
        raise ZipError("not_found", "That download job doesn't exist (the server may have restarted).", 404)
    return job


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_job(username, items):
    if not isinstance(items, list) or not items:
        raise ZipError("bad_request", "Select at least one video.")
    if len(items) > MAX_ITEMS:
        raise ZipError("bad_request", f"Too many videos in one ZIP (max {MAX_ITEMS}).")

    clean = []
    for index, item in enumerate(items, 1):
        if not isinstance(item, dict) or not _allowed(item.get("video_url")):
            raise ZipError("bad_request", f"Video {index} has an invalid link.")
        date = str(item.get("date") or "")[:10] or "undated"
        code = _safe(item.get("shortcode") or item.get("id"), fallback=str(index))
        clean.append({
            "id": str(item.get("id") or index),
            "url": item["video_url"],
            "name": f"{index:03d}_{date}_{code}.mp4",
        })

    user = _safe(username, fallback="instagram")
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    filename = f"{user}_{stamp}.zip"

    job = {
        "id": uuid.uuid4().hex[:12],
        "username": user,
        "status": "running",
        "total": len(clean),
        "done": 0,
        "bytes": 0,
        "failed": [],
        "filename": filename,
        "path": str(downloads_dir() / filename),
        "error": None,
        "cancel": False,
        "started": time.time(),
        "finished": None,
    }

    with _jobs_lock:
        _cleanup_locked()
        _jobs[job["id"]] = job

    log.info("ZIP job %s: %d videos from @%s -> %s", job["id"], len(clean), user, job["path"])
    threading.Thread(target=_run, args=(job, clean), daemon=True).start()
    return _public(job)


def get_job(job_id):
    return _public(_get(job_id))


def cancel_job(job_id):
    job = _get(job_id)
    if job["status"] == "running":
        job["cancel"] = True
        log.info("ZIP job %s: cancel requested", job["id"])
    return _public(job)


def job_file(job_id):
    job = _get(job_id)
    if job["status"] != "done":
        raise ZipError("not_ready", "The ZIP isn't ready yet.", 409)
    path = Path(job["path"])
    if not path.exists():
        raise ZipError("missing", "The ZIP file was moved or deleted.", 410)
    return str(path), job["filename"]


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

def _download(session, url, dest, job):
    last_err = None
    for attempt in range(1, RETRIES + 2):
        written = 0
        try:
            with session.get(url, stream=True, timeout=(10, 60)) as resp:
                resp.raise_for_status()
                with open(dest, "wb") as fh:
                    for chunk in resp.iter_content(CHUNK):
                        if job["cancel"]:
                            raise _Cancelled()
                        fh.write(chunk)
                        written += len(chunk)
                        job["bytes"] += len(chunk)
            return written
        except _Cancelled:
            job["bytes"] -= written
            raise
        except Exception as err:
            job["bytes"] -= written
            last_err = err
            if attempt <= RETRIES:
                time.sleep(1.5 * attempt)
    raise last_err


def _run(job, items):
    final_path = Path(job["path"])
    part_path = final_path.with_name(final_path.name + ".part")
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    saved = 0
    started = time.time()

    try:
        with zipfile.ZipFile(part_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
            for item in items:
                if job["cancel"]:
                    break
                tmp = TMP_DIR / f"{job['id']}_{item['name']}"
                try:
                    _download(session, item["url"], tmp, job)
                    zf.write(tmp, arcname=item["name"])
                    saved += 1
                except _Cancelled:
                    break
                except Exception as err:
                    log.warning("ZIP job %s: failed %s (%s)", job["id"], item["name"], err)
                    job["failed"].append(item["id"])
                finally:
                    try:
                        tmp.unlink()
                    except OSError:
                        pass
                    job["done"] += 1

        if job["cancel"]:
            part_path.unlink(missing_ok=True)
            job["status"] = "cancelled"
        elif saved == 0:
            part_path.unlink(missing_ok=True)
            job["status"] = "error"
            job["error"] = (
                "None of the videos could be downloaded. The links may have expired, "
                "so fetch the profile again and retry."
            )
        else:
            part_path.replace(final_path)
            job["status"] = "done"

    except Exception as err:
        log.exception("ZIP job %s crashed", job["id"])
        part_path.unlink(missing_ok=True)
        job["status"] = "error"
        job["error"] = f"Couldn't create the ZIP: {err}"
    finally:
        job["finished"] = time.time()
        session.close()
        log.info(
            "ZIP job %s: %s, %d saved, %d failed, %.1f MB in %.1fs",
            job["id"], job["status"], saved, len(job["failed"]),
            job["bytes"] / 1_048_576, job["finished"] - started,
        )