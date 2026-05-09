/**
 * Daily cron tasks.
 *
 * Designed to be invoked hourly by an external scheduler (GitHub Actions).
 * The endpoint at /api/cron/daily authenticates with the CRON_SECRET header
 * and runs three jobs:
 *
 *   1. tomorrow_nudge — fires only for households whose notify_time matches
 *      the current UTC hour. Sends "your X bin goes out tomorrow" pushes.
 *   2. morning_nudge  — runs only when the current UTC hour is 7 (07:00 UTC ≈
 *      08:00 BST). Same rules as above for collections happening today.
 *   3. weekly_refresh — runs only when the current UTC hour is 3, then enqueues
 *      refresh jobs for any council whose schedule hasn't been refreshed in >7 days.
 */
import { supabase } from "./supabase";
import { sendPushToHousehold } from "./push";
import { runBinAnalyst, runBinCheck } from "./agents";

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function binCharacterLine(bin: string): string {
  const b = bin.toLowerCase();
  if (/recyc/.test(b)) return "The recycling bin wants its 15 minutes.";
  if (/garden/.test(b)) return "Garden bin, in clog. You know the drill.";
  if (/food|caddy/.test(b)) return "Food caddy out. Banana skins are counting on you.";
  if (/general|refuse|household/.test(b)) return "General waste, marching orders.";
  return "Bin out, head high.";
}

function notifyHourMatches(notify_time: string | null | undefined, currentHour: number): boolean {
  // notify_time stored as TIME, e.g. "20:00:00" or "20:00". Parse the hour.
  if (!notify_time) return currentHour === 20; // default 8pm
  const m = /^(\d{1,2}):/.exec(notify_time);
  if (!m) return currentHour === 20;
  return parseInt(m[1], 10) === currentHour;
}

export interface CronResult {
  tomorrow_pushed: number;
  morning_pushed: number;
  schedules_refreshed: number;
  errors: string[];
  current_hour_utc: number;
}

export async function runDailyCron(): Promise<CronResult> {
  const currentHour = new Date().getUTCHours();
  const result: CronResult = {
    tomorrow_pushed: 0,
    morning_pushed: 0,
    schedules_refreshed: 0,
    errors: [],
    current_hour_utc: currentHour,
  };

  // ---- 1. Tomorrow nudge — fire only when notify_time hour matches
  try {
    const tomorrow = todayISO(1);
    const { data: tomorrowCols } = await supabase
      .from("bindicator_collections")
      .select("household_id, bin_type")
      .eq("collection_date", tomorrow);

    const grouped = new Map<string, string[]>();
    for (const c of tomorrowCols || []) {
      const arr = grouped.get(c.household_id) || [];
      arr.push(c.bin_type);
      grouped.set(c.household_id, arr);
    }

    for (const [hid, bins] of grouped.entries()) {
      const { data: prefs } = await supabase
        .from("bindicator_notification_prefs")
        .select("push_enabled, notify_day_before, notify_time")
        .eq("household_id", hid)
        .maybeSingle();
      if (prefs && prefs.push_enabled === false) continue;
      if (prefs && prefs.notify_day_before === false) continue;
      if (!notifyHourMatches(prefs?.notify_time, currentHour)) continue;

      const headline = bins.length === 1 ? `${bins[0]} bin out tomorrow` : `${bins.length} bins out tomorrow`;
      const body = bins.length === 1 ? binCharacterLine(bins[0]) : `Tomorrow: ${bins.join(", ")}.`;
      const { sent } = await sendPushToHousehold(hid, {
        title: headline,
        body,
        url: "/#/dashboard",
        tag: `tomorrow-${tomorrow}`,
      });
      result.tomorrow_pushed += sent;
    }
  } catch (e: any) {
    result.errors.push(`tomorrow: ${e.message}`);
  }

  // ---- 2. Morning-of nudge — once per day at 07:00 UTC (~08:00 BST)
  if (currentHour === 7) {
    try {
      const today = todayISO(0);
      const { data: todayCols } = await supabase
        .from("bindicator_collections")
        .select("household_id, bin_type")
        .eq("collection_date", today);

      const grouped = new Map<string, string[]>();
      for (const c of todayCols || []) {
        const arr = grouped.get(c.household_id) || [];
        arr.push(c.bin_type);
        grouped.set(c.household_id, arr);
      }

      for (const [hid, bins] of grouped.entries()) {
        const { data: prefs } = await supabase
          .from("bindicator_notification_prefs")
          .select("push_enabled, notify_morning_of")
          .eq("household_id", hid)
          .maybeSingle();
        if (prefs && prefs.push_enabled === false) continue;
        if (prefs && prefs.notify_morning_of === false) continue;

        const headline = bins.length === 1 ? `Today: ${bins[0]} bin` : `Today: ${bins.length} bins`;
        const { sent } = await sendPushToHousehold(hid, {
          title: headline,
          body: "Lid up. Wheels out. Smugness on standby.",
          url: "/#/dashboard",
          tag: `morning-${today}`,
        });
        result.morning_pushed += sent;
      }
    } catch (e: any) {
      result.errors.push(`morning: ${e.message}`);
    }
  }

  // ---- 3. Weekly schedule refresh — once per day at 03:00 UTC
  if (currentHour === 3) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: stale } = await supabase
        .from("bindicator_households")
        .select("id, postcode, council_id, updated_at")
        .lt("updated_at", sevenDaysAgo)
        .limit(50); // safety cap per cron run

      for (const h of stale || []) {
        try {
          await runBinAnalyst(h.id, h.postcode, h.council_id);
          await runBinCheck(h.id, h.postcode, h.council_id);
          await supabase
            .from("bindicator_households")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", h.id);
          result.schedules_refreshed++;
        } catch (e: any) {
          result.errors.push(`refresh ${h.id}: ${e.message}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`refresh: ${e.message}`);
    }
  }

  return result;
}
