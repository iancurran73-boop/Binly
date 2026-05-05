"""Apply the seed in chunks via the Supabase MCP — emit chunks to stdout."""
import json
import re

with open("/home/user/workspace/bindicator/scripts/seed_all_councils.sql") as f:
    sql = f.read()

# Split out the wipe and the insert
parts = sql.split("insert into bindicator_councils")
wipe = parts[0]
insert_block = "insert into bindicator_councils" + parts[1]

# Split insert rows
header, rows_blob = insert_block.split(" values\n", 1)
rows_blob = rows_blob.rstrip().rstrip(";")
# Each row starts with "(" — split on "),\n("
raw_rows = rows_blob.split("),\n(")
rows = []
for i, r in enumerate(raw_rows):
    if not r.startswith("("): r = "(" + r
    if not r.endswith(")"): r = r + ")"
    rows.append(r)

print(f"Total rows: {len(rows)}")
# Emit chunks of 60 rows each
CHUNK = 60
chunks = []
for i in range(0, len(rows), CHUNK):
    chunk_rows = rows[i:i+CHUNK]
    chunk_sql = header + " values\n" + ",\n".join(chunk_rows) + ";"
    chunks.append(chunk_sql)
print(f"Chunks: {len(chunks)}")
# Save chunks
import os
os.makedirs("/home/user/workspace/bindicator/scripts/chunks", exist_ok=True)
# Write the wipe as chunk 0
with open("/home/user/workspace/bindicator/scripts/chunks/00_wipe.sql","w") as f:
    f.write(wipe)
for i, c in enumerate(chunks):
    with open(f"/home/user/workspace/bindicator/scripts/chunks/{i+1:02d}_insert.sql","w") as f:
        f.write(c)
print("Written chunks to scripts/chunks/")
