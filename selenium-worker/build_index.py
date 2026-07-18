"""
Build council_id -> upstream module index.

Reads our council list (from Supabase) and the upstream module list
(upstream_map.json), and produces upstream_index.json keyed by our
council slug.

Strategy:
  1. Slug each upstream module name
  2. Match against our council slugs using normalized string equality
  3. Apply a manual override map for known mismatches
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

HERE = Path(__file__).parent
MAP_PATH = HERE / "upstream_map.json"
OUT_PATH = HERE / "upstream_index.json"

# Migrated off Supabase's REST API — this now goes straight at Neon via
# supa.py (see MIGRATION_RUNBOOK.md). DATABASE_URL replaces SUPABASE_URL/KEY.
import supa  # noqa: E402

# Manual overrides for cases where slugify(module) != council_id.
OVERRIDES = {
    # council_id : upstream module name
    "county-durham": "DurhamCouncil",
    "city-of-edinburgh": "EdinburghCityCouncil",
    "bristol-city-of": "BristolCityCouncil",
    "herefordshire-county-of": "HerefordshireCouncil",
    "armagh-city-banbridge-and-craigavon": "ArmaghBanbridgeCraigavonCouncil",
    "ards-and-north-down": "ArdsAndNorthDownCouncil",
    "lisburn-and-castlereagh": "LisburnCastlereaghCityCouncil",
    "fermanagh-and-omagh": "FermanaghOmaghDistrictCouncil",
    "mid-and-east-antrim": "MidAndEastAntrimCouncil",
    "newcastle-upon-tyne": "NewcastleCityCouncil",
    "newcastle-under-lyme": "NewcastleUnderLymeCouncil",
    "kingston-upon-thames": "KingstonUponThamesCouncil",
    "richmond-upon-thames": "RichmondUponThamesCouncil",
    "stoke-on-trent": "StokeOnTrentCityCouncil",
    "stockton-on-tees": "StocktonOnTeesCouncil",
    "stratford-on-avon": "StratfordUponAvonCouncil",
    "barking-and-dagenham": "BarkingDagenham",
    "telford-and-wrekin": "TelfordAndWrekinCouncil",
    "hammersmith-and-fulham": "HammersmithAndFulhamCouncil",
    "kensington-and-chelsea": "KensingtonAndChelseaCouncil",
    "blackburn-with-darwen": "BlackburnCouncil",
    "milton-keynes": "MiltonKeynesCityCouncil",
    "buckinghamshire": "BuckinghamshireCouncil",
    "tonbridge-and-malling": "TonbridgeAndMallingBoroughCouncil",
    "windsor-and-maidenhead": "WindsorAndMaidenheadCouncil",
    "north-east-derbyshire": "NorthEastDerbyshireDistrictCouncil",
    "isle-of-anglesey": "IsleOfAngleseyCouncil",
    "neath-port-talbot": "NeathPortTalbotCouncil",
    "perth-and-kinross": "PerthAndKinrossCouncil",
    "south-gloucestershire": "SouthGloucestershireCouncil",
    "kingston-upon-hull-city-of": "HullCityCouncil",
    "st-helens": "StHelensCouncil",
    "st-albans": "StAlbansCityAndDistrictCouncil",
    "south-cambridgeshire": "SouthCambridgeshireCouncil",
    "east-cambridgeshire": "EastCambridgeshireCouncil",
    "east-riding-of-yorkshire": "EastRidingCouncil",
    "north-yorkshire": "NorthYorkshire",
    "bath-and-north-east-somerset": "BathAndNorthEastSomersetCouncil",
    "east-devon": "EastDevonDC",
    "tonbridge-and-malling": "TonbridgeAndMallingBC",
    "newark-and-sherwood": "NewarkAndSherwoodDC",
    "nuneaton-and-bedworth": "NuneatonBedworthBoroughCouncil",
    "mid-and-east-antrim": "MidAndEastAntrimBoroughCouncil",
    "malvern-hills": "MalvernHillsDC",
    "st-helens": "StHelensBC",
    "richmond-upon-thames": "LondonBoroughOfRichmondUponThames",
    "conwy": "ConwyCountyBorough",
    "aberdeen-city": "AberdeenCityCouncil",
    "dundee-city": "DundeeCityCouncil",
    "glasgow-city": "GlasgowCityCouncil",
}


SUFFIXES = (
    "CountyBoroughCouncil", "CountyBorough",
    "BoroughCouncil", "DistrictCouncil", "CityCouncil", "CountyCouncil",
    "CityAndDistrictCouncil", "MetropolitanBoroughCouncil", "MBCouncil",
    "MetroBoroughCouncil", "Councils", "Council", "BC", "DC",
)

def slugify(name: str) -> str:
    """Convert 'AberdeenCityCouncil' -> 'aberdeen-city'."""
    s = name
    for suf in SUFFIXES:
        if s.endswith(suf):
            s = s[: -len(suf)]
            break
    # CamelCase -> kebab
    s = re.sub(r"([a-z])([A-Z])", r"\1-\2", s).lower()
    s = s.replace("--", "-").strip("-")
    return s


def load_full_inputs() -> dict:
    import importlib.util
    p = Path("/usr/local/lib/python3.12/site-packages/uk_bin_collection/tests/input.json")
    return json.loads(p.read_text())


def fetch_councils() -> list[dict]:
    return supa.select(
        "bindicator_councils",
        {"select": "id,name", "data_strategy": "eq.real"},
    )


def main() -> None:
    upstream = json.loads(MAP_PATH.read_text())
    inputs = load_full_inputs()
    upstream_by_module: dict[str, dict] = {}
    for c in upstream:
        mod = c["module"]
        full = inputs.get(mod, {})
        upstream_by_module[mod] = {
            **c,
            "needs_house_number": "house_number" in full or "paon" in full,
            "requires_selenium": "web_driver" in full,
        }

    councils = fetch_councils()
    index: dict[str, dict] = {}
    unmatched: list[str] = []

    for council in councils:
        cid = council["id"]
        # 1. Override
        if cid in OVERRIDES:
            module = OVERRIDES[cid]
            if module in upstream_by_module:
                index[cid] = {**upstream_by_module[module], "council_id": cid}
                continue
            unmatched.append(f"{cid} (override {module} not in upstream)")
            continue

        # 2. Slug-based match
        candidate_slugs = [slugify(m) for m in upstream_by_module]
        slug_to_module = dict(zip(candidate_slugs, upstream_by_module.keys()))
        if cid in slug_to_module:
            module = slug_to_module[cid]
            index[cid] = {**upstream_by_module[module], "council_id": cid}
            continue

        unmatched.append(cid)

    OUT_PATH.write_text(json.dumps(index, indent=2, sort_keys=True))
    print(f"Wrote {len(index)} entries to {OUT_PATH.name}")
    print(f"Unmatched: {len(unmatched)}")
    for u in unmatched[:50]:
        print(f"  - {u}")
    if len(unmatched) > 50:
        print(f"  ... and {len(unmatched) - 50} more")

    # Coverage breakdown
    pure = sum(1 for v in index.values() if v.get("pure_http"))
    print(f"\nMatched councils — pure-HTTP: {pure}, Selenium: {len(index) - pure}")


if __name__ == "__main__":
    main()
