"""
Binly worker — the binnovator.

Polls bindicator_lookup_jobs for pending lookups. For each job:
  1. Resolves the council to an upstream uk_bin_collection module via upstream_map.json
  2. Runs the adapter (pure-HTTP only in Phase A; Selenium adapters return 'unsupported')
  3. Writes the schedule to bindicator_schedule_cache (council_id, postcode, uprn)
  4. Marks the job as done / error

Run:
    python worker.py            # loop forever
    python worker.py --once     # one pass, then exit
    python worker.py --job <id> # process one specific job, then exit (debugging)
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import supa

# ---------- config ----------

INTERVAL = int(os.environ.get("WORKER_INTERVAL_SECONDS", "5"))
BATCH = int(os.environ.get("WORKER_BATCH_SIZE", "5"))
MAX_ATTEMPTS = int(os.environ.get("WORKER_MAX_ATTEMPTS", "3"))

UPSTREAM_MAP_PATH = Path(__file__).parent / "upstream_map.json"
UPSTREAM_MAP: list[dict[str, Any]] = json.loads(UPSTREAM_MAP_PATH.read_text())
COUNCIL_TO_MODULE: dict[str, dict[str, Any]] = {
    # We map by council_id (slug). The map keys upstream by Python class name,
    # so we also load a council_id -> module map from upstream_index.json if present.
}

INDEX_PATH = Path(__file__).parent / "upstream_index.json"
if INDEX_PATH.exists():
    COUNCIL_TO_MODULE = json.loads(INDEX_PATH.read_text())
else:
    # Fall back to building it from upstream_map.json when each entry has a
    # `council_id` field. (We add this field below in the mapper script.)
    for entry in UPSTREAM_MAP:
        cid = entry.get("council_id")
        if cid:
            COUNCIL_TO_MODULE[cid] = entry


# ---------- bin-type mapping ----------

# uk_bin_collection adapters return free-form bin labels like "Mixed Recycling
# Bin", "General Waste", "Garden Waste". We normalise to our four canonical
# keys so the dashboard renders consistent colour coding.
def normalise_bin_type(raw: str) -> str:
    s = (raw or "").lower()
    if any(k in s for k in ("recycl", "blue", "mixed dry", "paper", "card", "glass", "plastic", "cans")):
        return "recycling"
    if any(k in s for k in ("food", "caddy", "kitchen")):
        return "food"
    if any(k in s for k in ("garden", "green", "organic")):
        return "garden"
    # default: general waste
    return "general"


# ---------- date parsing ----------

DATE_FORMATS = [
    "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y",
    "%A %d %B %Y", "%a %d %B %Y", "%a %d %b %Y", "%A %d %b %Y",
    "%d %B %Y", "%d %b %Y",
]

def parse_date(s: str) -> str | None:
    if not s:
        return None
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ---------- adapter runner ----------

class AdapterUnsupported(Exception):
    pass


def run_adapter(module_name: str, url: str, uprn: str | None, postcode: str | None,
                paon: str | None, skip_get_url: bool, headless: bool = True) -> list[dict[str, str]]:
    """Import the upstream council module and execute its adapter.

    Returns a list of {collection_date: 'YYYY-MM-DD', bin_type: 'recycling'|...}.
    Raises AdapterUnsupported if the adapter requires Selenium and we don't
    have chromedriver available (Phase B).
    """
    full_module = f"uk_bin_collection.uk_bin_collection.councils.{module_name}"
    mod = importlib.import_module(full_module)
    klass = getattr(mod, "CouncilClass")
    instance = klass()

    # If adapter source imports selenium, treat as unsupported in Phase A.
    src = sys.modules[full_module].__file__
    if src and "from selenium" in Path(src).read_text(errors="ignore"):
        raise AdapterUnsupported(f"{module_name} requires selenium (Phase B)")

    kwargs: dict[str, Any] = {}
    if uprn:
        kwargs["uprn"] = uprn
    if postcode:
        kwargs["postcode"] = postcode
    if paon:
        kwargs["paon"] = paon
    kwargs["skip_get_url"] = skip_get_url

    # Mirror what `template_method` does for the pure-HTTP path:
    if not skip_get_url:
        # Some adapters interpolate UPRN into the URL.
        target_url = url.replace("{uprn}", uprn or "").replace("{postcode}", postcode or "")
        if target_url and "?uprn=" in target_url and uprn and not target_url.endswith(uprn):
            # Durham-style url ending in '?uprn=' — append.
            if target_url.endswith("="):
                target_url = target_url + uprn
        page = instance.get_data(target_url) if target_url else ""
        bin_data = instance.parse_data(page, url=target_url, **kwargs)
    else:
        bin_data = instance.parse_data("", url=url, **kwargs)

    bins = bin_data.get("bins", []) if isinstance(bin_data, dict) else []

    out: list[dict[str, str]] = []
    today = datetime.now(timezone.utc).date()
    for b in bins:
        raw_date = b.get("collectionDate") or b.get("collection_date")
        raw_type = b.get("type") or b.get("binType") or b.get("bin_type") or ""
        iso = parse_date(raw_date) if isinstance(raw_date, str) else None
        if not iso:
            continue
        # Only keep collections from today onward, up to 8 weeks out.
        d = datetime.fromisoformat(iso).date()
        if d < today:
            continue
        if (d - today).days > 70:
            continue
        out.append({"collection_date": iso, "bin_type": normalise_bin_type(raw_type)})

    # Dedupe + sort
    seen = set()
    deduped = []
    for r in sorted(out, key=lambda x: (x["collection_date"], x["bin_type"])):
        key = (r["collection_date"], r["bin_type"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped


# ---------- job loop ----------

def claim_jobs(limit: int) -> list[dict]:
    """Atomically claim up to `limit` pending jobs by setting status='running'."""
    return supa.rpc_or_select_then_update_pending(limit)


def process_job(job: dict) -> None:
    job_id = job["id"]
    council_id = job["council_id"]
    postcode = (job.get("postcode") or "").replace(" ", "").upper()
    uprn = job.get("uprn")
    paon = (job.get("result") or {}).get("paon") if isinstance(job.get("result"), dict) else None
    # Also accept paon directly
    if not paon:
        paon = job.get("paon")

    entry = COUNCIL_TO_MODULE.get(council_id)
    if not entry:
        finalise(job_id, status="error", error=f"No upstream module for {council_id}")
        return

    module_name = entry["module"]
    url = entry.get("url_template", "")
    skip_get = bool(entry.get("skip_get_url"))

    print(f"[job {job_id}] {council_id} -> {module_name} (uprn={uprn or '-'}, postcode={postcode or '-'}, paon={paon or '-'})", flush=True)

    try:
        schedule = run_adapter(module_name, url, uprn, postcode, paon=paon, skip_get_url=skip_get)
    except AdapterUnsupported as e:
        finalise(job_id, status="unsupported", error=str(e))
        return
    except Exception as e:
        traceback.print_exc()
        finalise(job_id, status="error", error=f"{type(e).__name__}: {e}")
        return

    if not schedule:
        finalise(job_id, status="empty", error=None)
        return

    # Write to schedule cache.
    supa.upsert(
        "bindicator_schedule_cache",
        [{
            "council_id": council_id,
            "postcode": postcode,
            "uprn": uprn,
            "schedule": schedule,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source": "live",
        }],
        on_conflict="council_id,postcode,uprn",
    )

    # Mark freshness.
    supa.upsert(
        "bindicator_council_freshness",
        [{
            "council_id": council_id,
            "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
            "last_status": "ok",
            "last_error": None,
            "refresh_method": "worker",
        }],
        on_conflict="council_id",
    )

    finalise(job_id, status="done", error=None, count=len(schedule))
    print(f"[job {job_id}] OK — {len(schedule)} collections", flush=True)


def finalise(job_id: str, status: str, error: str | None, count: int = 0) -> None:
    supa.update(
        "bindicator_lookup_jobs",
        {"id": f"eq.{job_id}"},
        {
            "status": status,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "last_error": error,
            "result": {"count": count} if count else None,
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="One pass, then exit")
    parser.add_argument("--job", help="Process a single job id, then exit")
    args = parser.parse_args()

    if args.job:
        # Manual debugging: claim that one job.
        rows = supa.select("bindicator_lookup_jobs", {"id": f"eq.{args.job}", "select": "*", "limit": "1"})
        if not rows:
            print("No such job", file=sys.stderr)
            sys.exit(1)
        process_job(rows[0])
        return

    while True:
        try:
            jobs = claim_jobs(BATCH)
        except Exception:
            print("[claim] error", flush=True)
            traceback.print_exc()
            jobs = []

        if not jobs:
            if args.once:
                return
            time.sleep(INTERVAL)
            continue

        for job in jobs:
            process_job(job)

        if args.once:
            return


if __name__ == "__main__":
    main()
