# Binly — Selenium Worker (the binnovator)

This is the engine that goes out to council websites, finds the bin schedule, and writes it back into the Binly cache. We call it **the binnovator**.

It runs **outside** the main Binly app (which is a Vite + Express webapp) on its own schedule. It uses [UKBinCollectionData](https://github.com/robbrad/UKBinCollectionData)-style adapters where one is available, falling back to bespoke Selenium scrapes for the rest.

## What it does

1. Reads a list of `(council_id, postcode, uprn)` jobs from `bindicator_council_freshness` (rows whose `last_refreshed_at` is older than the council's TTL — default 24h).
2. Looks up the right adapter for the council.
3. Drives a headless Chrome / Firefox session (or a direct HTTP request when the council has a public JSON endpoint).
4. Parses the result into a normalised `[{ collection_date, bin_type }]` array.
5. Writes the result into `bindicator_schedule_cache` and bumps `bindicator_council_freshness.last_refreshed_at`.

The Express app reads from that cache via `server/lookup.ts`. The worker doesn't need to talk to the Express app at all — they share state through Supabase.

## Project layout

```
selenium-worker/
├── README.md
├── requirements.txt
├── worker.py              # main loop / job dispatcher
├── supa.py                # tiny Supabase REST client
├── adapters/
│   ├── __init__.py        # registry: council_id → adapter class
│   ├── base.py            # Adapter base class
│   ├── gateshead.py
│   ├── newcastle.py
│   ├── sunderland.py
│   ├── north_tyneside.py
│   └── south_tyneside.py
├── Dockerfile
└── render.yaml
```

## Run locally

```bash
cd selenium-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SUPABASE_URL=https://kgxvomfyvirkqhgabjel.supabase.co
export SUPABASE_SERVICE_KEY=...        # service_role key, server-side only
python worker.py --once                # one pass, then exit
python worker.py                       # loop forever, refreshing stale councils
```

## Deploy on Render

```bash
# Push this directory to its own GitHub repo, then on Render:
#   New → Background Worker → connect repo → render.yaml is auto-detected
```

Set environment variables in the Render dashboard:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `WORKER_INTERVAL_SECONDS` (default `1800`)
- `WORKER_BATCH_SIZE` (default `10`)

## Adding a new council

1. Find the council's bin lookup page (often `councilname.gov.uk/bins` or `/check-bin-day`).
2. Create `adapters/<slug>.py` extending `BaseAdapter`.
3. Implement `fetch(self, postcode: str, uprn: str | None) -> list[Collection]`.
4. Register it in `adapters/__init__.py`.

That's it. The worker handles scheduling, retries, and caching.

## Adapter notes

The pilot adapters (Gateshead, Newcastle, Sunderland, North & South Tyneside) ship as **stubs with the URL and selectors documented**. They are intentionally simple — when a council provides a public API or a stable HTML structure, we use that. When they don't, the stubs are scaffolding the full crawler can fill in once we have UPRN samples to test against.

The worker treats any adapter that raises `AdapterUnavailable` as soft-failed: it writes a `status='stale'` record so the app can fall back to the seeded schedule and try again next cycle.

## The voice rule

If you write user-facing copy in this worker (e.g. an admin dashboard), use the binfluencer voice. Bin-themed humour, dry British wit, occasional ALL CAPS. Every joke grounded in helping. The engine is **the binnovator**, the buzzword is **Binnovation**.
