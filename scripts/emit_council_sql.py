"""Emit SQL to seed all 361 UK councils into Supabase."""
import json

with open("/home/user/workspace/bindicator/scripts/councils_merged.json") as f:
    councils = json.load(f)

# Default UK bin types (3 bins, fortnightly recycling/general, monthly garden)
default_bins = json.dumps([
    {"type": "General waste", "color": "#28251D", "frequency": "fortnightly"},
    {"type": "Recycling", "color": "#20808D", "frequency": "fortnightly"},
    {"type": "Garden waste", "color": "#5A7C3A", "frequency": "monthly"},
])

# Council-website URL pattern guesses (best-effort)
def guess_website(name: str, country: str) -> str:
    slug = name.lower().replace(",", "").replace("'", "").replace("&", "and").replace("(", "").replace(")", "").replace(" ", "")
    return f"https://www.google.com/search?q={name.replace(' ', '+')}+council+missed+bin+collection"

# Helper for SQL escaping
def esc(s):
    if s is None: return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

print("-- Wipe existing council seed and reseed with all 361 UK councils")
print("delete from bindicator_items where council_id not in (select id from bindicator_councils);")
print("delete from bindicator_households where council_id not in (select id from bindicator_councils);")
print("delete from bindicator_councils;")
print()
print("insert into bindicator_councils (id, name, region, bin_types, missed_collection_url, source_url, data_strategy, notes) values")

rows = []
for c in councils:
    notes_parts = []
    if c["ukbcd_class"]:
        notes_parts.append(f"UKBCD: {c['ukbcd_class']}")
    notes_parts.append(f"GSS: {c['code']}")
    notes_parts.append(f"Country: {c['country']}")
    notes = "; ".join(notes_parts)

    src = f"https://github.com/robbrad/UKBinCollectionData/blob/master/uk_bin_collection/uk_bin_collection/councils/{c['ukbcd_class']}.py" if c["ukbcd_class"] else None
    missed = guess_website(c["name"], c["country"])

    rows.append(f"({esc(c['id'])}, {esc(c['name'])}, {esc(c['region'])}, '{default_bins}'::jsonb, {esc(missed)}, {esc(src)}, {esc(c['data_strategy'])}, {esc(notes)})")

print(",\n".join(rows) + ";")
print()
# Reseed items for ALL councils now (use the 33 items we already wrote)
print("-- Items will be reseeded by a separate SQL")
