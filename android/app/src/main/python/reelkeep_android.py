"""
Reelkeep Android entry point.

Runs the normal Starlette backend inside the app on a fixed local port,
so the WebView can load it exactly like the browser version.
"""

import os
import socket
import threading
from pathlib import Path

HOST = "127.0.0.1"
# A fixed port keeps the same web origin, so saved data (recent profiles) survives restarts
PREFERRED_PORTS = range(47821, 47831)

_state = {"port": None}
_lock = threading.Lock()


def _pick_port():
    for port in PREFERRED_PORTS:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


def start(data_dir, downloads_dir):
    """Starts the server once and returns its port."""
    with _lock:
        if _state["port"]:
            return _state["port"]

        # Tell the backend where it may write (must happen before importing it)
        os.environ["REELKEEP_DATA_DIR"] = data_dir
        os.environ["REELKEEP_DOWNLOADS_DIR"] = downloads_dir
        os.environ["REELKEEP_WEB_DIR"] = str(Path(__file__).resolve().parent / "web")

        import uvicorn
        import main

        port = _pick_port()
        config = uvicorn.Config(
            main.app,
            host=HOST,
            port=port,
            loop="asyncio",
            http="h11",
            ws="none",
            lifespan="on",
            log_level="info",
            access_log=False,
        )
        server = uvicorn.Server(config)
        threading.Thread(target=server.run, name="reelkeep-server", daemon=True).start()

        _state["port"] = port
        return port