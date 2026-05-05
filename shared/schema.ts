import { z } from "zod";

// ---- Domain types (Supabase-backed; manually defined to avoid SQLite drizzle wiring) ----

export type BinTypeKey = "general" | "recycling" | "garden" | "food";

export interface CouncilBinType {
  type: string;
  color: string;
  frequency: "weekly" | "fortnightly" | "monthly";
}

export interface CouncilRequirements {
  needs_uprn: boolean;
  needs_house_number: boolean;
  requires_selenium: boolean;
  // Phase A only ships pure-HTTP adapters. `supported: false` means we know
  // about this council but can't query it yet — onboarding shows the honest
  // "rolling out" copy and offers the waitlist.
  supported: boolean;
}

export interface Council {
  id: string;
  name: string;
  region: string | null;
  bin_types: CouncilBinType[];
  missed_collection_url: string | null;
  source_url: string | null;
  data_strategy: string;
  notes: string | null;
  requirements?: CouncilRequirements;
}

export interface Household {
  id: string;
  user_id: string;
  name: string | null;
  postcode: string;
  address_line: string | null;
  uprn: string | null;
  paon: string | null;
  council_id: string;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  household_id: string;
  collection_date: string; // ISO date
  bin_type: string;
  bin_color: string | null;
  source: "analyst" | "checker" | "manual";
  verified_at: string | null;
  verification_status: "unverified" | "verified" | "mismatch";
  created_at: string;
}

export interface ItemEntry {
  id: string;
  council_id: string;
  item_name: string;
  bin_type: string;
  notes: string | null;
  tip: string | null;
  fun_fact: string | null;
  category: string | null;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string | null;
  rarity: "common" | "rare" | "epic" | "legendary";
  trigger_type: string;
  trigger_value: number | null;
}

export interface EarnedAchievement {
  id: string;
  household_id: string;
  achievement_id: string;
  earned_at: string;
  achievement?: Achievement;
}

export type CardColor = "green" | "yellow" | "red";

export interface BinCard {
  id: string;
  household_id: string;
  card_color: CardColor;
  reason: string | null;
  bin_type: string | null;
  item_name: string | null;
  issued_at: string;
}

export interface BinCardSummary {
  current: CardColor;
  yellow_count: number;
  red_count: number;
  recent: BinCard[];
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  email: string;
  display_name: string | null;
  role: "owner" | "member";
  invited_at: string;
  accepted_at: string | null;
}

export interface Streak {
  household_id: string;
  current_streak: number;
  longest_streak: number;
  last_marked_date: string | null;
  badges: string[];
  updated_at: string;
}

export interface NotificationPrefs {
  household_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  notify_day_before: boolean;
  notify_morning_of: boolean;
  notify_time: string;
  email_address: string | null;
}

export interface AgentRun {
  id: string;
  household_id: string | null;
  agent_type: "analyst" | "checker";
  status: "ok" | "mismatch" | "error";
  result: any;
  error: string | null;
  ran_at: string;
}

// ---- API request schemas ----

export const onboardSchema = z.object({
  postcode: z
    .string()
    .min(5)
    .max(8)
    .regex(/^[A-Z]{1,2}[0-9R][0-9A-Z]?\s?[0-9][A-Z]{2}$/i, "That doesn't look like a UK postcode"),
  address_line: z.string().min(1).max(200).optional(),
  council_id: z.string().min(1),
  email: z.string().email(),
  household_name: z.string().max(80).optional(),
  uprn: z.string().regex(/^\d{8,12}$/).optional(),
  paon: z.string().min(1).max(40).optional(),
  // Explicit opt-in for the Binly Bulletin newsletter. Separate consent from
  // the operational email used for reminders — GDPR-correct and easier to
  // defend in front of the ICO.
  bulletin_opt_in: z.boolean().optional().default(false),
});
export type OnboardInput = z.infer<typeof onboardSchema>;

export const itemSearchSchema = z.object({
  query: z.string().min(1).max(80),
});

export const markBinOutSchema = z.object({
  collection_date: z.string(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  display_name: z.string().max(60).optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
