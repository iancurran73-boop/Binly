#!/usr/bin/env python3
"""Add a 'Food caddy' bin (weekly, brown) to every council that doesn't already have one.

By 31 March 2026 every English household must have weekly food waste collection
under DEFRA's Simpler Recycling regime. We pre-emptively add the food caddy
across all 361 councils so the schedule generator returns it.
"""
import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://kgxvomfyvirkqhgabjel.supabase.co"
ANON_KEY = None
with open("/home/user/workspace/bindicator/.env") as f:
    for line in f:
        if line.startswith("SUPABASE_ANON_KEY="):
            ANON_KEY = line.split("=", 1)[1].strip()
            break

HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
}

FOOD_BIN = {
    "type": "Food caddy",
    "color": "#7A5C3F",
    "frequency": "weekly",
}

# Fetch all councils
url = f"{SUPABASE_URL}/rest/v1/bindicator_councils?select=id,name,bin_types"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=60) as resp:
    councils = json.loads(resp.read())

print(f"Fetched {len(councils)} councils")

updated = 0
already = 0
errors = 0
for c in councils:
    bin_types = c.get("bin_types") or []
    has_food = any(
        ("food" in (b.get("type", "").lower()) or "caddy" in (b.get("type", "").lower())
         or "kitchen waste" in (b.get("type", "").lower()))
        for b in bin_types
    )
    if has_food:
        already += 1
        continue

    new_bin_types = bin_types + [FOOD_BIN]
    patch_url = f"{SUPABASE_URL}/rest/v1/bindicator_councils?id=eq.{c['id']}"
    body = json.dumps({"bin_types": new_bin_types}).encode("utf-8")
    req = urllib.request.Request(patch_url, data=body, headers={**HEADERS, "Prefer": "return=minimal"}, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            updated += 1
            if updated % 50 == 0:
                print(f"  updated {updated}...")
    except urllib.error.HTTPError as e:
        errors += 1
        body = e.read().decode("utf-8", errors="replace")
        print(f"ERROR {c['name']}: {e.code} {body[:200]}")
        if errors > 5:
            import sys
            sys.exit(1)

print(f"DONE: updated={updated}, already had food={already}, errors={errors}")
