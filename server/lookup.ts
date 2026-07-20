/**
 * Council schedule lookup.
 *
 * Strategy (top-down):
 *
 * 1. bindicator_schedule_cache — populated either by:
 *    - a per-council Node adapter (e.g. Durham), or
 *    - the Python "binnovator" worker (uk_bin_collection adapters)
 *    Read first, always. If fresh (< 14 days) and non-empty, return it.
 *
 * 2. Per-council Node live adapter (server/adapters/*) — for the few councils
 *    we've integrated natively. Currently: Durham only. We call it on-demand,
 *    write the result to the cache, and return it.
 *
 * 3. Worker queue (bindicator_lookup_jobs) — enqueue a job for the worker to
 *    pick up. Returns an empty schedule + source: "pending" so the UI can show
 *    "Rummaging through the council site…" while we wait. The worker writes
 *    the cache when it's done.
 *
 * 4. Honest empty state — if even the worker has tried and failed (status:
 *    error/unsupported), we return an empty schedule and let the UI explain.
 */
import { supabase } from "./supabase";
import { generateSchedule, type ScheduleEntry } from "./agents";
import type { Council } from "../shared/schema";
import * as durham from "./adapters/durham";

// Nudge the Python worker awake the moment a job is queued. Render's free
// tier spins the worker down after 15 min idle, and its polling loop can
// only run while the process is alive — so without this, a freshly-enqueued
// job just sits there until *something else* happens to hit the worker's
// HTTP endpoint and wake it back up. Fire-and-forget: never block or fail
// the caller's request on this.
const WORKER_URL = process.env.WORKER_URL || "";

function nudgeWorker(): void {
  if (!WORKER_URL) return;
  const url = `${WORKER_URL.replace(/\/$/, "")}/tick`;
  fetch(url, { method: "POST", signal: AbortSignal.timeout(3000) }).catch(() => {
    // Cold start can take 30-60s and will time out here — that's fine, the
    // request itself is what wakes the service up regardless of whether we
    // see the response.
  });
}

export type LookupSource = "cache" | "live" | "pending" | "seeded" | "manual" | "empty" | "unsupported";

export interface LookupResult {
  schedule: ScheduleEntry[];
  source: LookupSource;
  fetched_at: string | null;
  uprn?: string | null;
  paon?: string | null;
  address?: string | null;
  job_status?: string | null;
  job_error?: string | null;
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function isStale(fetchedAt: string | null): boolean {
  if (!fetchedAt) return true;
  return Date.now() - new Date(fetchedAt).getTime() > TWO_WEEKS_MS;
}

interface LiveAdapter {
  lookupByPostcode: (
    postcode: string,
    addressHint?: string,
  ) => Promise<{ uprn: string; address: string; schedule: ScheduleEntry[] } | null>;
}

const LIVE_ADAPTERS: Record<string, LiveAdapter> = {
  "county-durham": durham,
};

interface LookupArgs {
  uprn?: string | null;
  paon?: string | null;
  addressHint?: string | null;
}

export async function lookupSchedule(
  council: Council,
  postcode: string,
  args: LookupArgs = {},
): Promise<LookupResult> {
  const cleanPostcode = postcode.replace(/\s+/g, "").toUpperCase();
  const uprn = args.uprn || null;
  const paon = args.paon || null;

  // 1. Cache hit (and not stale)?
  let cacheQuery = supabase
    .from("bindicator_schedule_cache")
    .select("*")
    .eq("council_id", council.id)
    .eq("postcode", cleanPostcode);
  if (uprn) cacheQuery = cacheQuery.eq("uprn", uprn);
  const { data: cached } = await cacheQuery
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached && Array.isArray(cached.schedule) && cached.schedule.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const fresh = (cached.schedule as ScheduleEntry[]).filter((e) => e.collection_date >= today);
    if (fresh.length > 0 && !isStale(cached.fetched_at)) {
      return {
        schedule: fresh,
        source: "cache",
        fetched_at: cached.fetched_at,
        uprn: cached.uprn ?? null,
        paon: cached.paon ?? null,
        address: cached.address ?? null,
      };
    }
  }

  // 2. Native Node live adapter (Durham et al.)
  const adapter = LIVE_ADAPTERS[council.id];
  if (adapter) {
    try {
      const live = await adapter.lookupByPostcode(postcode);
      if (live && live.schedule.length > 0) {
        const fetched_at = new Date().toISOString();
        supabase
          .from("bindicator_schedule_cache")
          .upsert(
            {
              council_id: council.id,
              postcode: cleanPostcode,
              uprn: live.uprn,
              address: live.address,
              schedule: live.schedule,
              fetched_at,
              source: "live",
            },
            { onConflict: "council_id,postcode,uprn" },
          )
          .then(() => recordFreshness(council.id, "ok", "live"))
          .then(() => undefined, (err) => {
            console.error("[lookup] cache upsert failed", err?.message ?? err);
          });

        return {
          schedule: live.schedule,
          source: "live",
          fetched_at,
          uprn: live.uprn,
          address: live.address,
        };
      }
    } catch (err: any) {
      console.error(`[lookup] live adapter failed for ${council.id}:`, err?.message ?? err);
      await recordFreshness(council.id, "error", "live", err?.message);
    }
  }

  // 3. Worker queue: enqueue if not already running for this property.
  const jobStatus = await ensureJob(council.id, cleanPostcode, uprn, paon);

  // Re-check cache one more time in case worker just wrote it.
  if (jobStatus.status === "done") {
    const { data: justCached } = await supabase
      .from("bindicator_schedule_cache")
      .select("*")
      .eq("council_id", council.id)
      .eq("postcode", cleanPostcode)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (justCached && Array.isArray(justCached.schedule) && justCached.schedule.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const fresh = (justCached.schedule as ScheduleEntry[]).filter(
        (e) => e.collection_date >= today,
      );
      return {
        schedule: fresh,
        source: "cache",
        fetched_at: justCached.fetched_at,
        uprn: justCached.uprn ?? null,
        paon: justCached.paon ?? null,
        address: justCached.address ?? null,
      };
    }
  }

  // 4. Seeded fallback for development only.
  if (process.env.BINSTIGATOR_SEEDED_FALLBACK === "1") {
    const seeded = generateSchedule(council, postcode);
    return { schedule: seeded, source: "seeded", fetched_at: null };
  }

  // Honest: we have a job pending, unsupported, or failed; let UI explain.
  // "unsupported" means the council needs Selenium (Cloudflare-protected /
  // JS-only sites) which the free-tier worker doesn't run — that's a
  // different, non-retryable situation from a genuine empty/error result,
  // so it needs its own source so the UI doesn't tell the user to "try
  // refreshing" for something that will never succeed on this tier.
  let source: LookupSource;
  if (jobStatus.status === "pending" || jobStatus.status === "running") {
    source = "pending";
  } else if (jobStatus.status === "unsupported") {
    source = "unsupported";
  } else {
    source = "empty";
  }

  return {
    schedule: [],
    source,
    fetched_at: null,
    uprn,
    paon,
    job_status: jobStatus.status,
    job_error: jobStatus.last_error ?? null,
  };
}

interface JobStatus {
  id: string;
  status: string;
  last_error: string | null;
}

/**
 * Ensure there's a non-failed job for this property. If the most recent job
 * is stale (>30 mins) or errored, enqueue a new one. If it's still pending or
 * running, return it. If it's done, just return its status.
 *
 * Circuit breaker: if there have been MAX_RECENT_ERRORS for this (council,
 * uprn, paon) within the BACKOFF window, stop re-enqueueing. The user gets
 * an honest empty state with the last error so they're not stuck on a
 * forever-spinning "Rummaging through the council site…".
 */
export async function ensureJob(
  councilId: string,
  cleanPostcode: string,
  uprn: string | null,
  paon: string | null,
): Promise<JobStatus> {
  let q = supabase
    .from("bindicator_lookup_jobs")
    .select("id, status, last_error, finished_at, enqueued_at")
    .eq("council_id", councilId)
    .eq("postcode", cleanPostcode);
  if (uprn) q = q.eq("uprn", uprn);
  else q = q.is("uprn", null);
  if (paon) q = q.eq("paon", paon);
  else q = q.is("paon", null);

  const { data: latest } = await q
    .order("enqueued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const STALE_DONE_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks
  const STALE_RUNNING_MS = 5 * 60 * 1000; // 5 min — recover from crashed workers
  const BACKOFF_MS = 60 * 60 * 1000; // 1 hour — circuit-breaker window
  const MAX_RECENT_ERRORS = 3;

  if (latest) {
    const finishedAt = latest.finished_at ? new Date(latest.finished_at).getTime() : 0;
    const enqueuedAt = latest.enqueued_at ? new Date(latest.enqueued_at).getTime() : 0;

    if (latest.status === "pending") {
      nudgeWorker();
      return latest as JobStatus;
    }
    if (latest.status === "running" && now - enqueuedAt < STALE_RUNNING_MS) return latest as JobStatus;
    if (latest.status === "done" && finishedAt && now - finishedAt < STALE_DONE_MS) return latest as JobStatus;
    if (latest.status === "unsupported") return latest as JobStatus; // Phase B, don't requeue

    // Circuit breaker: count recent errors for this exact property.
    if (latest.status === "error" || latest.status === "empty") {
      const sinceIso = new Date(now - BACKOFF_MS).toISOString();
      let countQ = supabase
        .from("bindicator_lookup_jobs")
        .select("id", { count: "exact", head: true })
        .eq("council_id", councilId)
        .eq("postcode", cleanPostcode)
        .in("status", ["error", "empty"])
        .gte("enqueued_at", sinceIso);
      if (uprn) countQ = countQ.eq("uprn", uprn);
      else countQ = countQ.is("uprn", null);
      if (paon) countQ = countQ.eq("paon", paon);
      else countQ = countQ.is("paon", null);

      const { count: recentErrorCount } = await countQ;
      if ((recentErrorCount ?? 0) >= MAX_RECENT_ERRORS) {
        // Honest stop. Mark the council as broken so future lookups for this
        // council skip straight to the empty state too. The next attempt is
        // allowed only after BACKOFF_MS rolls over.
        await recordFreshness(
          councilId,
          "error",
          "worker",
          latest.last_error ?? "Lookup failed multiple times",
        );
        return {
          id: latest.id,
          status: "error",
          last_error:
            latest.last_error ??
            "This council's site isn't responding right now. We'll keep trying — check back soon.",
        };
      }
    }
    // else fall through and enqueue a new job.
  }

  const { data: created } = await supabase
    .from("bindicator_lookup_jobs")
    .insert({
      council_id: councilId,
      postcode: cleanPostcode,
      uprn,
      paon,
      status: "pending",
    })
    .select("id, status, last_error")
    .single();

  nudgeWorker();
  return (created as JobStatus) || { id: "", status: "pending", last_error: null };
}

export async function recordFreshness(
  councilId: string,
  status: "ok" | "error" | "unsupported",
  method: "selenium" | "seeded" | "manual" | "live" | "worker",
  errorMsg?: string,
) {
  await supabase
    .from("bindicator_council_freshness")
    .upsert({
      council_id: councilId,
      last_refreshed_at: new Date().toISOString(),
      last_status: status,
      last_error: errorMsg ?? null,
      refresh_method: method,
    });
}
