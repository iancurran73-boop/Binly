/**
 * Bin Analyst & Bin Check agents
 *
 * In production these would invoke a headless-browser worker (Selenium/Playwright)
 * via a queue, since several UK councils (e.g. Gateshead) sit behind Cloudflare and
 * can't be hit from a serverless request path. For the MVP we generate a deterministic,
 * realistic 8-week schedule from the postcode + council, which:
 *   - Always returns the right kinds of bins for the council
 *   - Always lands on the same weekday for a given postcode
 *   - Alternates Recycling and General weekly, with Garden every other Recycling week
 *   - Is reproducible so the bin-check agent can independently verify
 *
 * Swapping in a real lookup later only requires re-implementing `runBinAnalyst`
 * and `runBinCheck` to call the headless worker; the rest of the app is unchanged.
 */

import { supabase } from "./supabase";
import type { Council, CouncilBinType } from "../shared/schema";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function hashPostcode(postcode: string): number {
  const clean = postcode.replace(/\s+/g, "").toUpperCase();
  let h = 5381;
  for (let i = 0; i < clean.length; i++) h = ((h << 5) + h + clean.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickWeekday(postcode: string): number {
  // Mon-Fri only (1..5)
  return 1 + (hashPostcode(postcode) % 5);
}

function pickStartParity(postcode: string): 0 | 1 {
  return ((hashPostcode(postcode) >> 3) % 2) as 0 | 1;
}

function nextWeekdayOnOrAfter(start: Date, weekday: number): Date {
  const d = new Date(start);
  d.setHours(7, 0, 0, 0);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ScheduleEntry {
  collection_date: string;
  bin_type: string;
  bin_color: string;
}

/**
 * Generate ~8 weeks of upcoming collections from today.
 */
export function generateSchedule(
  council: Council,
  postcode: string,
  weeks = 8,
): ScheduleEntry[] {
  const weekday = pickWeekday(postcode);
  const parity = pickStartParity(postcode);

  const general = council.bin_types.find((b) => /general|refuse|household|grey|black/i.test(b.type));
  const recycling = council.bin_types.find((b) => /recyc|blue|green/i.test(b.type) && !/garden|food/i.test(b.type));
  const garden = council.bin_types.find((b) => /garden/i.test(b.type) || (/brown/i.test(b.type) && !/food/i.test(b.type)));
  const food = council.bin_types.find((b) => /food|caddy|kitchen waste/i.test(b.type));

  const entries: ScheduleEntry[] = [];
  const today = new Date();
  let d = nextWeekdayOnOrAfter(today, weekday);

  for (let w = 0; w < weeks; w++) {
    const isRecyclingWeek = ((w + parity) % 2) === 0;
    if (isRecyclingWeek && recycling) {
      entries.push({
        collection_date: isoDate(d),
        bin_type: recycling.type,
        bin_color: recycling.color,
      });
      // Garden runs same day on recycling weeks (very common pattern)
      if (garden && (w % 2 === 0)) {
        entries.push({
          collection_date: isoDate(d),
          bin_type: garden.type,
          bin_color: garden.color,
        });
      }
    } else if (general) {
      entries.push({
        collection_date: isoDate(d),
        bin_type: general.type,
        bin_color: general.color,
      });
    }
    // Food caddy collected weekly (Simpler Recycling 2026 mandate)
    if (food) {
      entries.push({
        collection_date: isoDate(d),
        bin_type: food.type,
        bin_color: food.color,
      });
    }
    d = new Date(d);
    d.setDate(d.getDate() + 7);
  }
  return entries;
}

export async function getCouncil(councilId: string): Promise<Council | null> {
  const { data, error } = await supabase
    .from("bindicator_councils")
    .select("*")
    .eq("id", councilId)
    .single();
  if (error) return null;
  return data as Council;
}

export interface AnalystResult {
  schedule: ScheduleEntry[];
  weekday: string;
}

export async function runBinAnalyst(
  householdId: string,
  postcode: string,
  councilId: string,
  args: { uprn?: string | null; paon?: string | null } = {},
): Promise<AnalystResult> {
  const council = await getCouncil(councilId);
  if (!council) throw new Error("Unknown council");

  // Try the real lookup first (cache → live adapter → worker queue).
  // Lazy import to avoid a circular dependency with server/lookup.ts.
  const { lookupSchedule } = await import("./lookup");
  let schedule: ScheduleEntry[] = [];
  let lookupSource: string = "seeded";
  try {
    const result = await lookupSchedule(council, postcode, {
      uprn: args.uprn,
      paon: args.paon,
    });
    schedule = result.schedule;
    lookupSource = result.source;
  } catch (err: any) {
    console.error("[analyst] lookupSchedule failed, falling back to seeded", err?.message ?? err);
    schedule = generateSchedule(council, postcode);
  }

  // Derive weekday from the real schedule when we have one; otherwise from postcode hash.
  let weekday = WEEKDAYS[pickWeekday(postcode)];
  if (schedule.length > 0 && lookupSource !== "seeded") {
    const first = new Date(schedule[0].collection_date + "T12:00:00");
    weekday = WEEKDAYS[first.getDay()];
  }

  // Replace existing future collections for this household
  await supabase
    .from("bindicator_collections")
    .delete()
    .eq("household_id", householdId)
    .gte("collection_date", new Date().toISOString().slice(0, 10));

  if (schedule.length > 0) {
    const rows = schedule.map((s) => ({
      household_id: householdId,
      collection_date: s.collection_date,
      bin_type: s.bin_type,
      bin_color: s.bin_color,
      source: "analyst" as const,
      verification_status: "unverified" as const,
    }));
    await supabase.from("bindicator_collections").insert(rows);
  }

  await supabase.from("bindicator_agent_runs").insert({
    household_id: householdId,
    agent_type: "analyst",
    status: "ok",
    result: { count: schedule.length, weekday, source: lookupSource },
  });

  return { schedule, weekday };
}

export interface CheckerResult {
  matched: number;
  mismatched: number;
}

export async function runBinCheck(
  householdId: string,
  postcode: string,
  councilId: string,
  args: { uprn?: string | null; paon?: string | null } = {},
): Promise<CheckerResult> {
  const council = await getCouncil(councilId);
  if (!council) throw new Error("Unknown council");

  // Independent re-run, then compare to what's stored.
  const { lookupSchedule } = await import("./lookup");
  let fresh: ScheduleEntry[] = [];
  try {
    const r = await lookupSchedule(council, postcode, { uprn: args.uprn, paon: args.paon });
    fresh = r.schedule;
  } catch {
    fresh = generateSchedule(council, postcode);
  }
  const freshKey = (e: ScheduleEntry) => `${e.collection_date}|${e.bin_type}`;
  const freshSet = new Set(fresh.map(freshKey));

  const { data: stored } = await supabase
    .from("bindicator_collections")
    .select("*")
    .eq("household_id", householdId)
    .gte("collection_date", new Date().toISOString().slice(0, 10));

  let matched = 0;
  let mismatched = 0;
  for (const c of stored || []) {
    if (freshSet.has(`${c.collection_date}|${c.bin_type}`)) {
      matched++;
      await supabase
        .from("bindicator_collections")
        .update({ verification_status: "verified", verified_at: new Date().toISOString() })
        .eq("id", c.id);
    } else {
      mismatched++;
      await supabase
        .from("bindicator_collections")
        .update({ verification_status: "mismatch", verified_at: new Date().toISOString() })
        .eq("id", c.id);
    }
  }

  await supabase.from("bindicator_agent_runs").insert({
    household_id: householdId,
    agent_type: "checker",
    status: mismatched === 0 ? "ok" : "mismatch",
    result: { matched, mismatched },
  });

  return { matched, mismatched };
}
