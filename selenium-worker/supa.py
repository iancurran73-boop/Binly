"""
Tiny Supabase REST client. We don't pull in the official supabase-py because
this worker only needs select/upsert/update and we want a fast cold start on Render.
"""
from __future__ import annotations

import os
from typing import Any
import requests

def _clean_env(name: str, default: str | None = None) -> str:
    """Read an env var and strip whitespace including invisible Unicode spaces.

    Render's dashboard sometimes captures stray characters when you paste
    (thin space U+2009, NBSP U+00A0, zero-width space U+200B). Those break
    URL parsing in opaque ways, so we scrub them here.
    """
    raw = os.environ.get(name, default)
    if raw is None:
        raise KeyError(name)
    # Strip ASCII + common Unicode whitespace.
    for ch in ("\u2009", "\u00a0", "\u200b", "\u202f", "\ufeff"):
        raw = raw.replace(ch, "")
    return raw.strip()


SUPABASE_URL = _clean_env("SUPABASE_URL").rstrip("/")
SUPABASE_KEY = _clean_env("SUPABASE_SERVICE_KEY", os.environ.get("SUPABASE_ANON_KEY", ""))
if not SUPABASE_KEY:
    raise KeyError("SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY must be set")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def select(table: str, query: dict[str, str] | None = None) -> list[dict[str, Any]]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    res = requests.get(url, headers=HEADERS, params=query or {}, timeout=30)
    res.raise_for_status()
    return res.json()


def upsert(table: str, rows: list[dict[str, Any]], on_conflict: str | None = None) -> Any:
    if not rows:
        return []
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
    params = {"on_conflict": on_conflict} if on_conflict else {}
    res = requests.post(url, headers=headers, params=params, json=rows, timeout=30)
    res.raise_for_status()
    return res.json()


def update(table: str, query: dict[str, str], patch: dict[str, Any]) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    res = requests.patch(url, headers=HEADERS, params=query, json=patch, timeout=30)
    res.raise_for_status()
    return res.json() if res.text else []


def insert(table: str, rows: list[dict[str, Any]]) -> Any:
    if not rows:
        return []
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    res = requests.post(url, headers=HEADERS, json=rows, timeout=30)
    res.raise_for_status()
    return res.json()


def rpc_or_select_then_update_pending(limit: int, wants=None) -> list[dict]:
    """Claim up to `limit` pending jobs.

    No real atomicity (we'd need a Postgres function for that), but this is
    fine for our small worker fleet: PATCH the next N pending rows to
    'running' and return the resulting representation.

    `wants`, if given, is a predicate(job) -> bool used to let this worker
    instance only claim jobs it's actually capable of running (e.g. the
    free lite worker skips Selenium-only councils so they stay pending for
    the Selenium runner, instead of racing to claim and reject them).
    When filtering, we over-fetch so filtering out ineligible rows still
    leaves enough real candidates.
    """
    # Step 1: pick pending ids (over-fetch when we'll filter client-side)
    fetch_limit = limit * 8 if wants else limit
    rows = select(
        "bindicator_lookup_jobs",
        {
            "select": "id,council_id,postcode,uprn",
            "status": "eq.pending",
            "order": "enqueued_at.asc",
            "limit": str(fetch_limit),
        },
    )
    if not rows:
        return []

    if wants:
        rows = [r for r in rows if wants(r)][:limit]
        if not rows:
            return []

    ids = [r["id"] for r in rows]
    # Step 2: PATCH them to running, only if still pending (best-effort).
    in_clause = "(" + ",".join(ids) + ")"
    patched = update(
        "bindicator_lookup_jobs",
        {"id": f"in.{in_clause}", "status": "eq.pending"},
        {"status": "running", "started_at": __import__("datetime").datetime.utcnow().isoformat() + "Z"},
    )
    return patched if isinstance(patched, list) else rows
