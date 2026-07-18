"""
Tiny Postgres client — drop-in replacement for the old Supabase REST client.

worker.py calls select()/upsert()/update()/insert()/rpc_or_select_then_update_pending()
with PostgREST-style filter dicts (e.g. {"status": "eq.pending"}). Those call
sites are unchanged; this module just parses that same filter syntax and runs
parameterised SQL against Neon directly via psycopg2 instead of going through
Supabase's hosted REST API. See MIGRATION_RUNBOOK.md for why.
"""
from __future__ import annotations

import os
import re
from typing import Any

import psycopg2
import psycopg2.extras


def _clean_env(name: str, default: str | None = None) -> str:
    """Read an env var and strip whitespace including invisible Unicode spaces.

    Render's dashboard sometimes captures stray characters when you paste
    (thin space U+2009, NBSP U+00A0, zero-width space U+200B). Those break
    connection-string parsing in opaque ways, so we scrub them here.
    """
    raw = os.environ.get(name, default)
    if raw is None:
        raise KeyError(name)
    for ch in ("\u2009", "\u00a0", "\u200b", "\u202f", "\ufeff"):
        raw = raw.replace(ch, "")
    return raw.strip()


DATABASE_URL = _clean_env("DATABASE_URL")

_IDENT_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _quote_ident(name: str) -> str:
    if not _IDENT_RE.match(name):
        raise ValueError(f"Unsafe identifier: {name}")
    return f'"{name}"'


def _get_conn():
    # A fresh connection per call keeps this worker simple (it already polls
    # on a slow interval — this isn't a hot path) and avoids holding an idle
    # connection open against Neon's pooler between polls.
    return psycopg2.connect(DATABASE_URL, connect_timeout=10)


# ---- PostgREST-style filter parsing ----------------------------------------
# worker.py passes filter dicts like {"status": "eq.pending", "id": "in.(a,b)"}.
# We only need to support the operators this worker actually sends.
_OP_RE = re.compile(r"^(eq|neq|gte|lte|gt|lt|in)\.(.*)$", re.DOTALL)

_RESERVED_PARAMS = {"select", "order", "limit"}


def _build_where(query: dict[str, str]) -> tuple[str, list[Any]]:
    parts: list[str] = []
    params: list[Any] = []
    for key, raw in query.items():
        if key in _RESERVED_PARAMS:
            continue
        m = _OP_RE.match(raw)
        if not m:
            raise ValueError(f"Unsupported filter value: {key}={raw}")
        op, val = m.group(1), m.group(2)
        col = _quote_ident(key)
        if op == "eq":
            parts.append(f"{col} = %s")
            params.append(val)
        elif op == "neq":
            parts.append(f"{col} <> %s")
            params.append(val)
        elif op in ("gte", "lte", "gt", "lt"):
            sym = {"gte": ">=", "lte": "<=", "gt": ">", "lt": "<"}[op]
            parts.append(f"{col} {sym} %s")
            params.append(val)
        elif op == "in":
            # PostgREST shape: in.(a,b,c)
            inner = val.strip()
            if inner.startswith("(") and inner.endswith(")"):
                inner = inner[1:-1]
            ids = [v for v in inner.split(",") if v]
            if not ids:
                parts.append("false")
            else:
                placeholders = ", ".join(["%s"] * len(ids))
                parts.append(f"{col} IN ({placeholders})")
                params.extend(ids)
    where = f"WHERE {' AND '.join(parts)}" if parts else ""
    return where, params


def select(table: str, query: dict[str, str] | None = None) -> list[dict[str, Any]]:
    query = query or {}
    table_sql = _quote_ident(table)
    cols = query.get("select", "*")
    if cols != "*":
        cols_sql = ", ".join(_quote_ident(c.strip()) for c in cols.split(","))
    else:
        cols_sql = "*"
    where_sql, params = _build_where(query)

    sql = f"SELECT {cols_sql} FROM {table_sql} {where_sql}"
    if "order" in query:
        # PostgREST shape: "col.asc" / "col.desc"
        col, _, direction = query["order"].partition(".")
        direction_sql = "DESC" if direction.startswith("desc") else "ASC"
        sql += f" ORDER BY {_quote_ident(col)} {direction_sql}"
    if "limit" in query:
        sql += " LIMIT %s"
        params = params + [int(query["limit"])]

    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def upsert(table: str, rows: list[dict[str, Any]], on_conflict: str | None = None) -> Any:
    if not rows:
        return []
    table_sql = _quote_ident(table)
    cols = list(rows[0].keys())
    col_list = ", ".join(_quote_ident(c) for c in cols)
    conflict_cols = [c.strip() for c in on_conflict.split(",")] if on_conflict else ["id"]
    conflict_sql = ", ".join(_quote_ident(c) for c in conflict_cols)
    update_cols = [c for c in cols if c not in conflict_cols]
    if update_cols:
        action = ", ".join(f"{_quote_ident(c)} = EXCLUDED.{_quote_ident(c)}" for c in update_cols)
        action_sql = f"DO UPDATE SET {action}"
    else:
        action_sql = "DO NOTHING"

    value_tuples = []
    params: list[Any] = []
    for row in rows:
        placeholders = []
        for c in cols:
            placeholders.append("%s")
            params.append(psycopg2.extras.Json(row[c]) if isinstance(row[c], (dict, list)) else row[c])
        value_tuples.append(f"({', '.join(placeholders)})")

    sql = (
        f"INSERT INTO {table_sql} ({col_list}) VALUES {', '.join(value_tuples)} "
        f"ON CONFLICT ({conflict_sql}) {action_sql} RETURNING *"
    )
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            result = [dict(r) for r in cur.fetchall()]
            conn.commit()
            return result


def update(table: str, query: dict[str, str], patch: dict[str, Any]) -> Any:
    table_sql = _quote_ident(table)
    set_cols = list(patch.keys())
    set_sql = ", ".join(f"{_quote_ident(c)} = %s" for c in set_cols)
    set_params = [psycopg2.extras.Json(patch[c]) if isinstance(patch[c], (dict, list)) else patch[c] for c in set_cols]
    where_sql, where_params = _build_where(query)
    sql = f"UPDATE {table_sql} SET {set_sql} {where_sql} RETURNING *"
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, set_params + where_params)
            result = [dict(r) for r in cur.fetchall()]
            conn.commit()
            return result


def insert(table: str, rows: list[dict[str, Any]]) -> Any:
    if not rows:
        return []
    table_sql = _quote_ident(table)
    cols = list(rows[0].keys())
    col_list = ", ".join(_quote_ident(c) for c in cols)
    value_tuples = []
    params: list[Any] = []
    for row in rows:
        placeholders = []
        for c in cols:
            placeholders.append("%s")
            params.append(psycopg2.extras.Json(row[c]) if isinstance(row[c], (dict, list)) else row[c])
        value_tuples.append(f"({', '.join(placeholders)})")
    sql = f"INSERT INTO {table_sql} ({col_list}) VALUES {', '.join(value_tuples)} RETURNING *"
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            result = [dict(r) for r in cur.fetchall()]
            conn.commit()
            return result


def rpc_or_select_then_update_pending(limit: int) -> list[dict]:
    """Claim up to `limit` pending jobs atomically.

    The old REST version did this as two separate HTTP calls (select, then a
    best-effort PATCH) with a comment noting "no real atomicity". Now that
    we're on a real Postgres connection we can do it properly in one
    statement with `FOR UPDATE SKIP LOCKED`, which is the standard job-queue
    claiming pattern — actually safe to run more than one worker at once.
    """
    sql = """
        UPDATE bindicator_lookup_jobs
        SET status = 'running', started_at = now()
        WHERE id IN (
            SELECT id FROM bindicator_lookup_jobs
            WHERE status = 'pending'
            ORDER BY enqueued_at ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, council_id, postcode, uprn
    """
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, [limit])
            result = [dict(r) for r in cur.fetchall()]
            conn.commit()
            return result
