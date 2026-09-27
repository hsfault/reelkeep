"""
Reelkeep - Instagram login (cookies.txt) management.

Validates uploaded cookies, keeps only the Instagram lines, and resets
cached Instagram sessions so the next fetch uses the new login.
"""

import logging
import threading
import time
from datetime import datetime, timezone

import ig

log = logging.getLogger("reelkeep.cookies")

MAX_BYTES = 200_000
HEADER = "# Netscape HTTP Cookie File\n# Saved by Reelkeep (Instagram cookies only)\n"

_lock = threading.Lock()


class CookieError(Exception):
    """Error with a code + friendly message the frontend can show."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _parse(text):
    """Returns ({name: {value, expires}}, [kept raw lines]) for instagram.com cookies."""
    cookies = {}
    kept = []
    for raw in text.splitlines():
        line = raw.strip()
        body = line[len("#HttpOnly_"):] if line.startswith("#HttpOnly_") else line
        if not body or (body.startswith("#") and not line.startswith("#HttpOnly_")):
            continue
        parts = body.split("\t")
        if len(parts) < 7:
            continue
        domain, _flag, _path, _secure, expires, name, value = parts[:7]
        if "instagram.com" not in domain:
            continue
        try:
            exp = int(float(expires))
        except ValueError:
            exp = 0
        cookies[name] = {"value": value, "expires": exp}
        kept.append(line)
    return cookies, kept


def _summary(cookies):
    session = cookies.get("sessionid")
    exp = session["expires"] if session else 0
    return {
        "present": True,
        "count": len(cookies),
        "logged_in": bool(session and session["value"]),
        "account_id": (cookies.get("ds_user_id") or {}).get("value") or None,
        "expires": datetime.fromtimestamp(exp, tz=timezone.utc).isoformat() if exp else None,
        "expired": bool(exp and exp < time.time()),
    }


def _empty():
    return {
        "present": False,
        "count": 0,
        "logged_in": False,
        "account_id": None,
        "expires": None,
        "expired": False,
    }


def _reset_ig_sessions():
    # Drop cached per-profile sessions so the next fetch builds a fresh
    # gallery-dl extractor with the new cookies.
    with ig._sessions_lock:
        ig._sessions.clear()


def status():
    if not ig.COOKIES_FILE.exists():
        return _empty()
    text = ig.COOKIES_FILE.read_text(encoding="utf-8", errors="ignore")
    cookies, _ = _parse(text)
    return _summary(cookies) if cookies else {**_empty(), "present": True}


def save(text):
    if not isinstance(text, str) or not text.strip():
        raise CookieError("empty", "That file is empty.")
    if len(text.encode("utf-8", errors="ignore")) > MAX_BYTES:
        raise CookieError("too_large", "That file is too large to be a cookies.txt.")

    cookies, kept = _parse(text.replace("\r\n", "\n"))
    if not cookies:
        raise CookieError(
            "invalid",
            "No Instagram cookies found. Export them while you're on instagram.com, "
            "in Netscape (cookies.txt) format.",
        )
    if "sessionid" not in cookies or not cookies["sessionid"]["value"]:
        raise CookieError(
            "not_logged_in",
            "These cookies aren't logged in. Log into instagram.com first, then export again.",
        )

    info = _summary(cookies)
    if info["expired"]:
        raise CookieError("expired", "This login has expired. Log in again and export fresh cookies.")

    with _lock:
        tmp = ig.COOKIES_FILE.with_suffix(".tmp")
        tmp.write_text(HEADER + "\n".join(kept) + "\n", encoding="utf-8")
        tmp.replace(ig.COOKIES_FILE)
        _reset_ig_sessions()

    log.info("Saved %d Instagram cookies (account %s)", info["count"], info["account_id"])
    return info


def delete():
    with _lock:
        ig.COOKIES_FILE.unlink(missing_ok=True)
        _reset_ig_sessions()
    log.info("Instagram cookies removed")
    return _empty()