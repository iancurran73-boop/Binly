"""
Build the canonical Bindicator council list.
- Source 1: ONS local authority districts (361 UK councils)
- Source 2: UKBinCollectionData supported councils (334 with real scrapers)
We slugify both, fuzzy-match them, and emit a SQL seed.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path("/home/user/workspace/bindicator/scripts")

with open(ROOT / "ons_councils.json") as f:
    ons = json.load(f)
with open(ROOT / "ukbcd_councils.json") as f:
    ukbcd = json.load(f)


def slugify(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def normalise_class_name(cls: str) -> str:
    # e.g. "GatesheadCouncil" -> "gateshead", "BarkingDagenham" -> "barking-dagenham"
    # split on caps
    parts = re.findall(r"[A-Z][a-z]*|[A-Z]+(?=[A-Z][a-z])|[A-Z0-9]+", cls)
    s = "-".join(p.lower() for p in parts if p)
    # strip trailing council/borough/district/etc
    suffixes = ["council", "borough", "district", "city", "county", "metropolitan", "mb", "mbc", "mdc", "dc", "bc", "cc"]
    parts2 = s.split("-")
    while parts2 and parts2[-1] in suffixes:
        parts2.pop()
    # also remove "of" "and" "the"
    parts2 = [p for p in parts2 if p not in ("of", "and", "the")]
    return "-".join(parts2)


# Build slug -> ukbcd class lookup
ukbcd_by_slug: dict[str, str] = {}
for cls in ukbcd:
    slug = normalise_class_name(cls)
    if slug:
        ukbcd_by_slug[slug] = cls

# Region map for top-level grouping
REGION_HINTS = {
    "London Borough": "London",
    "London": "London",
    "Westminster": "London",
    "Camden": "London",
    "Southwark": "London",
    "Tower Hamlets": "London",
    "Hackney": "London",
    "Islington": "London",
    "Greenwich": "London",
    "Lambeth": "London",
    "Wandsworth": "London",
    "Hammersmith": "London",
    "Kensington": "London",
    "Brent": "London",
    "Ealing": "London",
    "Hounslow": "London",
    "Harrow": "London",
    "Barnet": "London",
    "Enfield": "London",
    "Haringey": "London",
    "Waltham Forest": "London",
    "Redbridge": "London",
    "Newham": "London",
    "Barking": "London",
    "Havering": "London",
    "Bexley": "London",
    "Bromley": "London",
    "Croydon": "London",
    "Sutton": "London",
    "Merton": "London",
    "Kingston upon Thames": "London",
    "Richmond upon Thames": "London",
    "Lewisham": "London",
    "City of London": "London",
}

# Map ONS code prefix to country
def country_from_code(code: str) -> str:
    if code.startswith("E"): return "England"
    if code.startswith("W"): return "Wales"
    if code.startswith("S"): return "Scotland"
    if code.startswith("N"): return "Northern Ireland"
    return "UK"


def slug_for_ons(name: str) -> str:
    # e.g. "Newcastle upon Tyne" -> "newcastle-upon-tyne"
    s = slugify(name)
    return s


def matched_ukbcd(name: str, code: str) -> str | None:
    s = slug_for_ons(name)
    # Try: full name slug, parts of name, "city/borough" stripped
    candidates = [s]
    # Drop trailing -city, -borough, -district, etc
    tokens = s.split("-")
    if tokens[-1] in ("city", "borough", "district", "county"):
        candidates.append("-".join(tokens[:-1]))
    # "city of x" -> "x"
    if tokens[:2] == ["city", "of"]:
        candidates.append("-".join(tokens[2:]))
    if tokens[:2] == ["borough", "of"]:
        candidates.append("-".join(tokens[2:]))
    # Hardcoded aliases
    aliases = {
        "newcastle-upon-tyne": "newcastle",
        "kingston-upon-hull-city-of": "hull-city",
        "city-of-edinburgh": "edinburgh",
        "bristol-city-of": "bristol-city",
        "bournemouth-christchurch-and-poole": "bcp",
        "barking-and-dagenham": "barking-dagenham",
        "richmond-upon-thames": "of-richmond-upon-thames",
        "hammersmith-and-fulham": "hammersmith-fulham",
        "armagh-city-banbridge-and-craigavon": "armagh-banbridge-craigavon",
        "durham": "durham",  # County Durham
        "county-durham": "durham",
        "herefordshire-county-of": "herefordshire",
        "east-riding-of-yorkshire": "east-riding",
        "redcar-and-cleveland": "redcar-cleveland",
        "blackburn-with-darwen": "blackburn",
        "north-east-lincolnshire": "north-east-lincolnshire",
        "isle-of-wight": "isle-wight",
        "isles-of-scilly": "isles-scilly",
        "central-bedfordshire": "central-bedfordshire",
        "westmorland-and-furness": "westmorland-furness",
        "southend-on-sea": "southend",
        "brighton-and-hove": "brighton-hove",
        "city-of-london": "city-london",
        "st-helens": "st-helens",
        "stockton-on-tees": "stockton-tees",
        "telford-and-wrekin": "telford-wrekin",
        "epsom-and-ewell": "epsom-ewell",
        "newark-and-sherwood": "newark-sherwood",
        "south-cambridgeshire": "south-cambridgeshire",
    }
    if s in aliases: candidates.append(aliases[s])
    # 'and' -> drop, ', city of' -> drop, 'city of' -> drop
    candidates.append(s.replace("-and-", "-"))
    candidates.append(s.replace("-of-", "-"))
    candidates.append(s.replace("-city-of", ""))
    candidates.append(s.replace("-county-of", ""))
    candidates.append(s.replace(",-", "-").replace(",", ""))
    # 'on'/'upon' simplify
    candidates.append(s.replace("-upon-", "-on-"))
    candidates.append(s.replace("-on-", "-"))
    candidates.append(s.replace("-upon-", "-"))
    # remove 'with'
    candidates.append(s.replace("-with-", "-"))
    for c in candidates:
        if c in ukbcd_by_slug:
            return ukbcd_by_slug[c]
        # also try without trailing -s
        if c + "s" in ukbcd_by_slug:
            return ukbcd_by_slug[c + "s"]
    # Fallback: substring/fuzzy match on the slug tokens (safe matches only)
    stop_tokens = {"of", "and", "city", "borough", "district", "county", "the", "upon", "on", "with", "central"}
    main_tokens = [t for t in s.split("-") if t not in stop_tokens]
    if len(main_tokens) >= 2:
        # require ALL distinctive tokens to appear in the ukbcd slug for a safe match
        for ukslug, cls in ukbcd_by_slug.items():
            uk_tokens = set(ukslug.split("-"))
            if all(t in uk_tokens for t in main_tokens):
                return cls
    return None


def detect_region(name: str, code: str) -> str:
    country = country_from_code(code)
    for hint, region in REGION_HINTS.items():
        if hint in name:
            return region
    return country


# Build the seed
councils = []
for c in ons:
    name = c["name"]
    code = c["code"]
    slug = slug_for_ons(name)
    matched = matched_ukbcd(name, code)
    region = detect_region(name, code)
    councils.append({
        "id": slug,
        "code": code,
        "name": name,
        "region": region,
        "country": country_from_code(code),
        "ukbcd_class": matched,
        "data_strategy": "real" if matched else "waitlist",
    })

# Stats
real = sum(1 for c in councils if c["data_strategy"] == "real")
print(f"Total councils: {len(councils)}")
print(f"With real scraper (UKBCD): {real}")
print(f"Waitlist only: {len(councils) - real}")

with open(ROOT / "councils_merged.json", "w") as f:
    json.dump(councils, f, indent=2)

# Show some unmatched ones for sanity check
print("\nFirst 20 waitlisted:")
for c in [x for x in councils if x["data_strategy"] == "waitlist"][:20]:
    print(f"  {c['name']} ({c['code']})")

print("\nFirst 20 matched:")
for c in [x for x in councils if x["data_strategy"] == "real"][:20]:
    print(f"  {c['name']} -> {c['ukbcd_class']}")
