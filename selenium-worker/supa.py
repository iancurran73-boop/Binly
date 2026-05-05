"""
Tiny Supabase REST client. We don't pull in the official supabase-py because
this worker only needs select/upsert/update and we want a fast cold start on Render.
"""
from __future__ import annotations

import os
from typing import Any
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_ANON_KEY"]

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


def rpc_or_select_then_update_pending(limit: int) -> list[dict]:
    """Claim up to `limit` pending jobs.

    No real atomicity (we'd need a Postgres function for that), but for our
    single-worker setup this is fine: PATCH the next N pending rows to
    'running' and return the resulting representation.
    """
    # Step 1: pick pending ids
    rows = select(
        "bindicator_lookup_jobs",
        {
            "select": "id,council_id,postcode,uprn",
            "status": "eq.pending",
            "order": "enqueued_at.asc",
            "limit": str(limit),
        },
    )
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
