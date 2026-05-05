#!/usr/bin/env python3
"""Upload all 361 councils to Supabase via PostgREST."""
import json
import os
import sys
import urllib.request
import urllib.error

# Load env
SUPABASE_URL = "https://kgxvomfyvirkqhgabjel.supabase.co"
ANON_KEY = None
with open("/home/user/workspace/bindicator/.env") as f:
    for line in f:
        if line.startswith("SUPABASE_ANON_KEY="):
            ANON_KEY = line.split("=", 1)[1].strip()
            break

assert ANON_KEY, "no anon key"

with open("/home/user/workspace/bindicator/scripts/councils_merged.json") as f:
    councils = json.load(f)

# Build rows matching the table schema
def to_row(c):
    bin_types = [
        {"type": "General waste", "color": "#28251D", "frequency": "fortnightly"},
        {"type": "Recycling", "color": "#20808D", "frequency": "fortnightly"},
        {"type": "Garden waste", "color": "#5A7C3A", "frequency": "monthly"},
    ]
    name_q = c["name"].replace(" ", "+")
    missed = f"https://www.google.com/search?q={name_q}+council+missed+bin+collection"
    source = None
    notes_parts = []
    if c.get("ukbcd_class"):
        source = f"https://github.com/robbrad/UKBinCollectionData/blob/master/uk_bin_collection/uk_bin_collection/councils/{c['ukbcd_class']}.py"
        notes_parts.append(f"UKBCD: {c['ukbcd_class']}")
    notes_parts.append(f"GSS: {c['code']}")
    notes_parts.append(f"Country: {c['country']}")
    return {
        "id": c["id"],
        "name": c["name"],
        "region": c["region"],
        "bin_types": bin_types,
        "missed_collection_url": missed,
        "source_url": source,
        "data_strategy": c["data_strategy"],
        "notes": "; ".join(notes_parts),
    }

rows = [to_row(c) for c in councils]
print(f"Prepared {len(rows)} rows")

# Upload in batches of 50
url = f"{SUPABASE_URL}/rest/v1/bindicator_councils"
headers = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

batch_size = 50
total = 0
for i in range(0, len(rows), batch_size):
    batch = rows[i : i + batch_size]
    data = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            total += len(batch)
            print(f"  batch {i//batch_size + 1}: inserted {len(batch)} rows (total {total})")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"ERROR batch {i//batch_size + 1}: {e.code} {body[:500]}")
        sys.exit(1)

print(f"DONE: {total} councils uploaded")
