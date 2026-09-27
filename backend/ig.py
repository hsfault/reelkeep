"""
Reelkeep - Instagram fetching layer (built on gallery-dl 1.32.14).

gallery-dl's Instagram code handles what Instagram insists on: Chrome
browser emulation, cookies, the fb_dtsg/lsd page tokens and GraphQL doc_id
discovery. We use only its page-level GraphQL listings and skip the
per-video /media/info/ lookups that made the plain CLI take ~12 s per video.
"""

import itertools
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from gallery_dl import config, exception, extractor

log = logging.getLogger("reelkeep.ig")
# Show gallery-dl's own debug lines (token extraction, sleeps) while we tune things
logging.getLogger("instagram").setLevel(logging.DEBUG)

BASE_DIR = Path(__file__).resolve().parent
# The Android app passes its private storage folder; on PC it's backend/data
DATA_DIR = Path(os.environ.get("REELKEEP_DATA_DIR") or (BASE_DIR / "data"))
COOKIES_FILE = DATA_DIR / "cookies.txt"
DATA_DIR.mkdir(parents=True, exist_ok=True)

BATCH_SIZE = 50                       # videos per "Load more"
SLEEP_BETWEEN_REQUESTS = [2.0, 4.0]   # gallery-dl default is 6-12 s
MAX_EMPTY_RUN = 60                    # posts in a row without a video before giving up
SESSION_TTL = 30 * 60                 # forget idle profiles after 30 minutes

IG_BASE = "https://www.instagram.com"

RESERVED_PATHS = {
    "p", "reel", "reels", "stories", "explore", "accounts",
    "tv", "direct", "about", "legal", "developer",
}
USERNAME_RE = re.compile(r"^[a-z0-9._]{1,30}$")

LOGIN_MESSAGE = "Instagram wants a login. Add cookies in Settings."
RATE_MESSAGE = "Instagram slowed us down. Try again in a few minutes."
CHECKPOINT_MESSAGE = (
    "Instagram wants you to verify your account. Open instagram.com in your "
    "browser, complete the check, then export fresh cookies."
)
REJECTED_MESSAGE = (
    "Instagram rejected this login session. Wait a while before retrying; "
    "if it keeps happening, export fresh cookies."
)


class FetchError(Exception):
    """Error with a code + friendly message the frontend can show."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# ---------------------------------------------------------------------------
# Link parsing
# ---------------------------------------------------------------------------

def parse_username(raw):
    """Accepts full profile URLs, share links with ?igsh=, @username or username."""
    text = (raw or "").strip()
    if not text:
        raise FetchError("invalid_link", "Paste an Instagram profile link or username.")

    text = text.lstrip("@")

    if "instagram.com" in text.lower():
        path = re.split(r"instagram\.com", text, maxsplit=1, flags=re.IGNORECASE)[1]
        path = path.split("?")[0].split("#")[0]
        parts = [p for p in path.split("/") if p]
        if not parts or parts[0].lower() in RESERVED_PATHS:
            raise FetchError("invalid_link", "That doesn't look like an Instagram profile link.")
        text = parts[0]

    text = text.lower()
    if not USERNAME_RE.match(text):
        raise FetchError("invalid_link", "That doesn't look like an Instagram profile link.")
    return text


# ---------------------------------------------------------------------------
# Error translation (gallery-dl exceptions -> friendly FetchError)
# ---------------------------------------------------------------------------

def _err_text(err):
    msg = getattr(err, "message", None) or str(err)
    return (msg or "").strip()


def _detail(err):
    return f"{type(err).__name__}: {err}"[:300]


def _classify(err):
    name = type(err).__name__
    text = _err_text(err)
    low = text.lower()
    log.warning("gallery-dl %s: %s", name, text or "(no message)")

    if "429" in low or "too many" in low or "rate limit" in low or "wait a few minutes" in low:
        return FetchError("rate_limited", RATE_MESSAGE, 429)
    if "challenge" in low or "checkpoint" in low:
        return FetchError("checkpoint", CHECKPOINT_MESSAGE, 403)
    if "login" in low or name in ("AuthenticationError", "AuthorizationError", "AuthRequired"):
        return FetchError("login_required", LOGIN_MESSAGE, 401)
    if "home page" in low:
        return FetchError("session_rejected", REJECTED_MESSAGE, 401)
    if "private" in low:
        return FetchError("private", "This profile is private.", 403)
    if name == "NotFoundError" or "not found" in low or "404" in low:
        return FetchError("not_found", "Couldn't find that profile.", 404)
    return FetchError("upstream_error", f"Instagram fetch failed: {text or name}", 502)


def _translate(err):
    if isinstance(err, exception.GalleryDLException):
        return _classify(err)
    if isinstance(err, requests.exceptions.RequestException):
        log.warning("Network error: %s", err)
        return FetchError(
            "network_error",
            "Couldn't reach Instagram. Check your connection and try again.",
            502,
        )
    log.error("Unexpected error while reading Instagram", exc_info=err)
    return FetchError(
        "unexpected_error",
        f"Something went wrong while reading Instagram. Details: {_detail(err)}",
        500,
    )


# ---------------------------------------------------------------------------
# gallery-dl extractor setup
# ---------------------------------------------------------------------------

_config_lock = threading.Lock()


def _new_extractor(username):
    if not COOKIES_FILE.exists():
        raise FetchError("login_required", LOGIN_MESSAGE, 401)

    with _config_lock:
        config.clear()
        config.set(("extractor", "instagram"), "cookies", str(COOKIES_FILE))
        config.set(("extractor", "instagram"), "sleep-request", SLEEP_BETWEEN_REQUESTS)

        ex = extractor.find(f"{IG_BASE}/{username}/reels/")
        if ex is None:
            raise FetchError("invalid_link", "Couldn't open that profile.")

        init = getattr(ex, "initialize", None)
        if callable(init):
            init()  # sets up the Chrome-like session, cookies and ex.api

    ex.login()
    if not getattr(ex, "_logged_in", True):
        raise FetchError(
            "login_required",
            "Your cookies.txt has no Instagram login in it. Log into instagram.com, then export cookies again.",
            401,
        )
    return ex


def _is_private_for_viewer(user):
    if not user.get("is_private"):
        return False
    following = user.get("followed_by_viewer")
    if following is None:
        following = (user.get("friendship_status") or {}).get("following")
    return not following


# ---------------------------------------------------------------------------
# Media helpers
# ---------------------------------------------------------------------------

def _thumb_path(url):
    return f"/api/thumb?src={quote(url, safe='')}" if url else ""


def _node_media(node):
    if isinstance(node, dict) and isinstance(node.get("media"), dict):
        return node["media"]
    return node if isinstance(node, dict) else {}


def _pick_video(media):
    versions = [v for v in (media.get("video_versions") or []) if isinstance(v, dict) and v.get("url")]
    if not versions:
        return None
    return max(versions, key=lambda v: (v.get("width") or 0) * (v.get("height") or 0))


def _pick_cover(media):
    candidates = ((media.get("image_versions2") or {}).get("candidates")) or []
    candidates = [c for c in candidates if isinstance(c, dict) and c.get("url")]
    if not candidates:
        return ""
    big_enough = [c for c in candidates if (c.get("width") or 0) >= 360]
    if big_enough:
        return min(big_enough, key=lambda c: c.get("width") or 0)["url"]
    return max(candidates, key=lambda c: c.get("width") or 0)["url"]


def _media_to_item(media):
    if not isinstance(media, dict):
        return None
    video = _pick_video(media)
    if not video:
        return None  # photo, not a video

    code = media.get("code") or ""
    taken = media.get("taken_at")
    caption = media.get("caption")
    caption_text = caption.get("text") if isinstance(caption, dict) else ""

    return {
        "id": str(media.get("pk") or media.get("id") or code),
        "shortcode": code,
        "permalink": f"{IG_BASE}/p/{code}/" if code else "",
        "video_url": video["url"],
        "thumb": _thumb_path(_pick_cover(media)),
        "width": video.get("width") or media.get("original_width") or 0,
        "height": video.get("height") or media.get("original_height") or 0,
        "duration": media.get("video_duration"),
        "date": (
            datetime.fromtimestamp(taken, tz=timezone.utc).isoformat()
            if isinstance(taken, (int, float)) else None
        ),
        "caption": (caption_text or "")[:200],
    }


def _extract_items(media):
    """One post can hold several videos (carousels). Returns a list of video items."""
    if not isinstance(media, dict):
        return []
    children = media.get("carousel_media")
    if isinstance(children, list) and children:
        items = []
        for child in children:
            if not isinstance(child, dict):
                continue
            merged = {
                **child,
                "code": media.get("code"),
                "caption": media.get("caption"),
                "taken_at": media.get("taken_at"),
            }
            item = _media_to_item(merged)
            if item:
                items.append(item)
        return items
    item = _media_to_item(media)
    return [item] if item else []


# ---------------------------------------------------------------------------
# Per-profile session (keeps gallery-dl's page cursor alive for "Load more")
# ---------------------------------------------------------------------------

class ProfileSession:
    def __init__(self, username):
        self.username = username
        self.ex = None
        self.user = None
        self.source = None        # "reels" or "feed"
        self._stream = None       # generator of video items
        self.count = 0            # items handed out (or skipped) so far
        self.exhausted = False
        self.broken = False       # stream died with an error, must be recreated
        self.seen = set()
        self.lock = threading.Lock()
        self.touched = time.time()

    def _start(self):
        self.ex = _new_extractor(self.username)
        api = self.ex.api

        self.user = api.user(self.username) or {}
        if _is_private_for_viewer(self.user):
            raise FetchError("private", "This profile is private.", 403)

        reels = api.user_reels(self.username)
        first = next(reels, None)
        if first is None:
            self.source = "reels"
            self._stream = iter(())
            return

        if _pick_video(_node_media(first)):
            log.info("@%s: reels listing includes video links, using it directly", self.username)
            self.source = "reels"
            nodes = itertools.chain([first], reels)
        else:
            log.info("@%s: reels listing has no video links, using the posts feed instead", self.username)
            reels.close()
            self.source = "feed"
            nodes = api.user_feed(self.username)

        self._stream = self._flatten(nodes)

    def _flatten(self, nodes):
        empty = 0
        for node in nodes:
            items = _extract_items(_node_media(node))
            if not items:
                empty += 1
                if empty >= MAX_EMPTY_RUN:
                    log.warning("@%s: %d posts in a row without a video, stopping", self.username, empty)
                    return
                continue
            empty = 0
            yield from items

    def advance(self, skip, n):
        """Skip `skip` items (used after a restart or error), then return up to `n` new ones."""
        items = []
        try:
            if self._stream is None:
                self._start()
            while not self.exhausted and (skip > 0 or len(items) < n):
                try:
                    item = next(self._stream)
                except StopIteration:
                    self.exhausted = True
                    break
                if item["id"] in self.seen:
                    continue
                self.seen.add(item["id"])
                if skip > 0:
                    skip -= 1
                    self.count += 1
                    continue
                items.append(item)
        except FetchError:
            self.broken = True
            raise
        except Exception as err:
            self.broken = True
            raise _translate(err) from err

        self.count += len(items)
        self.touched = time.time()
        return items


_sessions = {}
_sessions_lock = threading.Lock()


def _get_session(username, offset):
    """Returns (session, skip). A fresh session is made for offset 0,
    after an error, or when the client's offset doesn't match ours."""
    with _sessions_lock:
        now = time.time()
        for name, s in list(_sessions.items()):
            if now - s.touched > SESSION_TTL and not s.lock.locked():
                del _sessions[name]

        s = _sessions.get(username)
        if s is None or s.broken or offset == 0 or offset != s.count:
            s = ProfileSession(username)
            _sessions[username] = s
            return s, offset
        return s, 0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_batch(raw, offset=0):
    username = parse_username(raw)
    if offset < 0:
        raise FetchError("bad_request", "Offset can't be negative.")

    log.info("Fetching @%s from offset %d ...", username, offset)
    started = time.time()

    session, skip = _get_session(username, offset)
    with session.lock:
        items = session.advance(skip, BATCH_SIZE)
        user = session.user or {}
        log.info(
            "@%s: %d videos in %.1fs (source=%s, has_more=%s)",
            username, len(items), time.time() - started, session.source, not session.exhausted,
        )
        avatar = user.get("profile_pic_url_hd") or user.get("profile_pic_url") or ""
        return {
            "profile": {
                "username": user.get("username") or username,
                "full_name": user.get("full_name") or "",
                "avatar": _thumb_path(avatar),
                "is_private": bool(user.get("is_private")),
            },
            "username": username,
            "offset": offset,
            "items": items,
            "next_offset": session.count,
            "has_more": not session.exhausted,
            "source": session.source,
        }