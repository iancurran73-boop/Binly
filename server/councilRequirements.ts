// Council-level data requirements loaded from the worker's upstream index.
// The Python worker (selenium-worker/) generates upstream_index.json from
// uk_bin_collection's input.json — here we just consume it so the frontend
// can ask the right question on the onboarding form ("UPRN?", "house number?").
//
// If a council ID isn't in the index it's almost certainly a `waitlist`
// council we haven't mapped to an upstream module yet — return safe defaults
// so the onboarding form still renders.

import { readFileSync } from "fs";
import { join } from "path";

// Bundle the index directly into the JS via esbuild's JSON loader so it
// travels with dist/index.cjs (no separate file copy step needed). The
// fallback readFileSync paths below stay so dev mode still works if the
// import fails for any reason.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JSON import
import bundledIndex from "../selenium-worker/upstream_index.json";

export interface CouncilRequirement {
  council_id: string;
  needs_uprn: boolean;
  needs_house_number: boolean;
  needs_postcode: boolean;
  requires_selenium: boolean;
  pure_http: boolean;
  module: string;
  url_template: string;
}

let cache: Record<string, CouncilRequirement> | null = null;

function loadIndex(): Record<string, CouncilRequirement> {
  if (cache) return cache;
  if (bundledIndex && typeof bundledIndex === "object") {
    cache = bundledIndex as Record<string, CouncilRequirement>;
    return cache;
  }
  const candidates = [
    join(process.cwd(), "selenium-worker", "upstream_index.json"),
    join(process.cwd(), "..", "selenium-worker", "upstream_index.json"),
    join(__dirname, "..", "selenium-worker", "upstream_index.json"),
    join(__dirname, "..", "..", "selenium-worker", "upstream_index.json"),
  ];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      cache = JSON.parse(raw);
      return cache!;
    } catch {
      continue;
    }
  }
  console.warn("[councilRequirements] upstream_index.json not found — UPRN picker will fall back to text inputs");
  cache = {};
  return cache;
}

export function getRequirement(councilId: string): CouncilRequirement | null {
  return loadIndex()[councilId] ?? null;
}

export function getAllRequirements(): Record<string, CouncilRequirement> {
  return loadIndex();
}

// Map an internal record into the slim shape we send to the client.
export function publicShape(councilId: string) {
  const req = getRequirement(councilId);
  if (!req) {
    // Council not mapped yet — onboarding will treat this as waitlist anyway.
    return {
      needs_uprn: false,
      needs_house_number: false,
      requires_selenium: false,
      supported: false,
    };
  }
  return {
    needs_uprn: req.needs_uprn,
    needs_house_number: req.needs_house_number,
    requires_selenium: req.requires_selenium,
    // Phase A only ships pure-HTTP adapters. Selenium adapters will work
    // once the Render worker with Chrome is online — until then we surface
    // an honest "rolling out" state instead of pretending.
    supported: req.pure_http,
  };
}
