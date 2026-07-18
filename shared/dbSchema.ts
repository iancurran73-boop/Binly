/**
 * Drizzle ORM schema — Postgres (Neon).
 *
 * Reconstructed from application code (server/*.ts, selenium-worker/worker.py,
 * shared/schema.ts, scripts/seed_*.sql) after the original Supabase project
 * was deleted, so the original `CREATE TABLE` statements were never in this
 * repo to begin with. Column names/types match everywhere the code reads or
 * writes them; a handful of PK/unique-constraint choices are best-effort
 * inference from `.upsert(..., { onConflict })` calls — see MIGRATION_RUNBOOK.md
 * for the specific ones worth double-checking after your first import.
 *
 * This schema is consumed two ways:
 *   1. `drizzle-kit generate` turns it into the CREATE TABLE migration SQL
 *      (see migrations/) that you run once against a fresh Neon database.
 *   2. `server/db.ts` uses it for the raw Postgres connection powering the
 *      Supabase-compatible query shim in `server/supabaseCompat.ts`, so the
 *      ~90 call sites across server/*.ts didn't need to be rewritten.
 */
import {
  pgTable,
  text,
  uuid,
  timestamp,
  date,
  boolean,
  integer,
  jsonb,
  time,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const genId = () => sql`gen_random_uuid()`;

// ---- Councils -------------------------------------------------------------
export const councils = pgTable("bindicator_councils", {
  id: text("id").primaryKey(), // slug, e.g. "county-durham"
  name: text("name").notNull(),
  region: text("region"),
  binTypes: jsonb("bin_types").notNull().default(sql`'[]'::jsonb`),
  missedCollectionUrl: text("missed_collection_url"),
  sourceUrl: text("source_url"),
  dataStrategy: text("data_strategy").notNull().default("waitlist"),
  notes: text("notes"),
});

// ---- Households -------------------------------------------------------------
export const households = pgTable("bindicator_households", {
  id: uuid("id").primaryKey().default(genId()),
  userId: text("user_id").notNull(),
  name: text("name"),
  postcode: text("postcode").notNull(),
  addressLine: text("address_line"),
  uprn: text("uprn"),
  paon: text("paon"),
  councilId: text("council_id").notNull().references(() => councils.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Collections -------------------------------------------------------------
export const collections = pgTable("bindicator_collections", {
  id: uuid("id").primaryKey().default(genId()),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  collectionDate: date("collection_date").notNull(),
  binType: text("bin_type").notNull(),
  binColor: text("bin_color"),
  source: text("source").notNull().default("manual"), // 'analyst' | 'checker' | 'manual'
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Items (bin lookup catalogue) -----------------------------------------
export const items = pgTable("bindicator_items", {
  id: uuid("id").primaryKey().default(genId()),
  councilId: text("council_id").notNull().references(() => councils.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  binType: text("bin_type").notNull(),
  notes: text("notes"),
  tip: text("tip"),
  funFact: text("fun_fact"),
  category: text("category"),
});

// ---- Achievements -------------------------------------------------------------
export const achievements = pgTable("bindicator_achievements", {
  id: text("id").primaryKey(), // e.g. "first_bin", "night_owl" — referenced as string constants in server/routes.ts
  name: text("name").notNull(),
  description: text("description").notNull(),
  emoji: text("emoji"),
  rarity: text("rarity").notNull().default("common"),
  triggerType: text("trigger_type"),
  triggerValue: integer("trigger_value"),
});

export const earnedAchievements = pgTable("bindicator_earned_achievements", {
  id: uuid("id").primaryKey().default(genId()),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  achievementId: text("achievement_id").notNull().references(() => achievements.id),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Bin cards (contamination confessions) --------------------------------
export const binCards = pgTable("bindicator_bin_cards", {
  id: uuid("id").primaryKey().default(genId()),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  cardColor: text("card_color").notNull().default("green"), // 'green' | 'yellow' | 'red'
  reason: text("reason"),
  binType: text("bin_type"),
  itemName: text("item_name"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Household members (sharing) ------------------------------------------
export const householdMembers = pgTable("bindicator_household_members", {
  id: uuid("id").primaryKey().default(genId()),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  displayName: text("display_name"),
  role: text("role").notNull().default("member"), // 'owner' | 'member'
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

// ---- Streaks — one row per household, PK IS household_id ------------------
// (upsert() in routes.ts is called with no onConflict target, which in
// PostgREST means "conflict on primary key" — so household_id has to be the PK.)
export const streaks = pgTable("bindicator_streaks", {
  householdId: uuid("household_id").primaryKey().references(() => households.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastMarkedDate: date("last_marked_date"),
  badges: jsonb("badges").notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Notification prefs — one row per household, PK IS household_id -------
export const notificationPrefs = pgTable("bindicator_notification_prefs", {
  householdId: uuid("household_id").primaryKey().references(() => households.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  notifyDayBefore: boolean("notify_day_before").notNull().default(true),
  notifyMorningOf: boolean("notify_morning_of").notNull().default(true),
  notifyTime: time("notify_time").notNull().default("20:00:00"),
  emailAddress: text("email_address"),
});

// ---- Agent runs (analyst/checker verification log) ------------------------
export const agentRuns = pgTable("bindicator_agent_runs", {
  id: uuid("id").primaryKey().default(genId()),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "cascade" }),
  agentType: text("agent_type").notNull(), // 'analyst' | 'checker'
  status: text("status").notNull(), // 'ok' | 'mismatch' | 'error'
  result: jsonb("result"),
  error: text("error"),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Push subscriptions -----------------------------------------------------
export const pushSubscriptions = pgTable(
  "bindicator_push_subscriptions",
  {
    id: uuid("id").primaryKey().default(genId()),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    enabled: boolean("enabled").notNull().default(true),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_subscriptions_household_endpoint_idx").on(t.householdId, t.endpoint)],
);

// ---- Bulletin (newsletter) subscribers — PK IS email -----------------------
export const bulletinSubscribers = pgTable("bindicator_bulletin_subscribers", {
  email: text("email").primaryKey(),
  consent: boolean("consent").notNull().default(false),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  source: text("source"),
  postcode: text("postcode"),
  councilId: text("council_id").references(() => councils.id),
  householdId: uuid("household_id").references(() => households.id),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  confirmationStatus: text("confirmation_status").notNull().default("pending"),
  confirmationToken: text("confirmation_token"),
  unsubscribeToken: text("unsubscribe_token"),
});

// ---- Schedule cache (written by the Node app + the Python worker) ---------
export const scheduleCache = pgTable(
  "bindicator_schedule_cache",
  {
    id: uuid("id").primaryKey().default(genId()),
    councilId: text("council_id").notNull().references(() => councils.id),
    postcode: text("postcode").notNull(),
    uprn: text("uprn"),
    paon: text("paon"),
    address: text("address"),
    schedule: jsonb("schedule").notNull().default(sql`'[]'::jsonb`),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("live"),
  },
  (t) => [uniqueIndex("schedule_cache_council_postcode_uprn_idx").on(t.councilId, t.postcode, t.uprn)],
);

// ---- Magic links -------------------------------------------------------------
export const magicLinks = pgTable("bindicator_magic_links", {
  id: uuid("id").primaryKey().default(genId()),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// ---- Sessions -------------------------------------------------------------
export const sessions = pgTable("bindicator_sessions", {
  id: uuid("id").primaryKey().default(genId()),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Lookup jobs (worker queue) --------------------------------------------
export const lookupJobs = pgTable("bindicator_lookup_jobs", {
  id: uuid("id").primaryKey().default(genId()),
  councilId: text("council_id").notNull().references(() => councils.id),
  postcode: text("postcode").notNull(),
  uprn: text("uprn"),
  paon: text("paon"),
  status: text("status").notNull().default("pending"), // pending|running|done|error|empty|unsupported
  lastError: text("last_error"),
  result: jsonb("result"),
  enqueuedAt: timestamp("enqueued_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// ---- Council freshness — PK IS council_id ----------------------------------
export const councilFreshness = pgTable("bindicator_council_freshness", {
  councilId: text("council_id").primaryKey().references(() => councils.id),
  lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  refreshMethod: text("refresh_method"),
});

// ---- Ideas board -------------------------------------------------------------
export const ideas = pgTable("bindicator_ideas", {
  id: uuid("id").primaryKey().default(genId()),
  title: text("title").notNull(),
  body: text("body"),
  submittedByUserId: text("submitted_by_user_id"),
  submittedByName: text("submitted_by_name"),
  status: text("status").notNull().default("open"), // open|wont_do|...
  upvotes: integer("upvotes").notNull().default(0),
  curated: boolean("curated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ideaVotes = pgTable(
  "bindicator_idea_votes",
  {
    id: uuid("id").primaryKey().default(genId()),
    ideaId: uuid("idea_id").notNull().references(() => ideas.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idea_votes_idea_user_idx").on(t.ideaId, t.userId)],
);

// ---- Waitlist (councils we don't support yet) -----------------------------
export const waitlist = pgTable("bindicator_waitlist", {
  id: uuid("id").primaryKey().default(genId()),
  email: text("email").notNull(),
  councilId: text("council_id"),
  postcode: text("postcode"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Unknown items (item-lookup misses, for catalogue growth) -------------
export const unknownItems = pgTable(
  "bindicator_unknown_items",
  {
    id: uuid("id").primaryKey().default(genId()),
    councilId: text("council_id").notNull().references(() => councils.id),
    query: text("query").notNull(),
    searchCount: integer("search_count").notNull().default(1),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("unknown_items_council_query_idx").on(t.councilId, t.query)],
);
