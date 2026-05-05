"""
Binly binnovator — Web Service wrapper.

Render's free tier doesn't support Background Workers, only Web Services.
So we run the worker loop in a background thread and expose a tiny HTTP
server on $PORT for health checks and manual triggers. This gives us:

  GET /          -> "Binly binnovator running" (used as keep-warm ping target)
  GET /health    -> JSON with last poll info
  POST /tick     -> force one poll cycle right now (handy for cron-style nudge)

Render free web services spin down after 15 min idle. To keep the worker
processing, point an external pinger (UptimeRobot, cron-job.org, or even a
Supabase cron) at https://<service>.onrender.com/ every 10 minutes.
"""
from __future__ import annotations

import json
import os
import threading
import time
import traceback
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import worker  # noqa: F401  (imports run module-level config)

PORT = int(os.environ.get("PORT", "10000"))
INTERVAL = int(os.environ.get("WORKER_INTERVAL_SECONDS", "5"))
BATCH = int(os.environ.get("WORKER_BATCH_SIZE", "5"))

STATE: dict[str, Any] = {
    "started_at": datetime.now(timezone.utc).isoformat(),
    "last_poll_at": None,
    "last_poll_count": 0,
    "last_error": None,
    "total_polls": 0,
    "total_jobs_processed": 0,
}
STATE_LOCK = threading.Lock()


def poll_once() -> int:
    """Run a single poll cycle. Returns number of jobs processed."""
    try:
        jobs = worker.claim_jobs(BATCH)
    except Exception as e:
        traceback.print_exc()
        with STATE_LOCK:
            STATE["last_error"] = f"claim: {type(e).__name__}: {e}"
            STATE["last_poll_at"] = datetime.now(timezone.utc).isoformat()
        return 0

    count = 0
    for job in jobs:
        try:
            worker.process_job(job)
            count += 1
        except Exception as e:
            traceback.print_exc()
            with STATE_LOCK:
                STATE["last_error"] = f"process {job.get('id')}: {type(e).__name__}: {e}"

    with STATE_LOCK:
        STATE["last_poll_at"] = datetime.now(timezone.utc).isoformat()
        STATE["last_poll_count"] = count
        STATE["total_polls"] += 1
        STATE["total_jobs_processed"] += count
        if count or not jobs:
            STATE["last_error"] = None
    return count


def background_loop() -> None:
    print(f"[binnovator] background loop started, interval={INTERVAL}s, batch={BATCH}", flush=True)
    while True:
        try:
            poll_once()
        except Exception:
            traceback.print_exc()
        time.sleep(INTERVAL)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:  # quieter logs
        print(f"[http] {self.address_string()} {fmt % args}", flush=True)

    def _json(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/" or self.path == "":
            msg = b"Binly binnovator running."
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        if self.path == "/health":
            with STATE_LOCK:
                self._json(200, dict(STATE))
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/tick":
            count = poll_once()
            self._json(200, {"processed": count})
            return
        self._json(404, {"error": "not found"})


def main() -> None:
    # Start background poller before HTTP so we don't miss jobs while binding port.
    t = threading.Thread(target=background_loop, daemon=True, name="binnovator-poll")
    t.start()

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[binnovator] HTTP listening on :{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
