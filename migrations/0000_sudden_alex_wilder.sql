CREATE TABLE "bindicator_achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"emoji" text,
	"rarity" text DEFAULT 'common' NOT NULL,
	"trigger_type" text,
	"trigger_value" integer
);
--> statement-breakpoint
CREATE TABLE "bindicator_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"agent_type" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"error" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_bin_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"card_color" text DEFAULT 'green' NOT NULL,
	"reason" text,
	"bin_type" text,
	"item_name" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_bulletin_subscribers" (
	"email" text PRIMARY KEY NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"source" text,
	"postcode" text,
	"council_id" text,
	"household_id" uuid,
	"unsubscribed_at" timestamp with time zone,
	"confirmation_status" text DEFAULT 'pending' NOT NULL,
	"confirmation_token" text,
	"unsubscribe_token" text
);
--> statement-breakpoint
CREATE TABLE "bindicator_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"collection_date" date NOT NULL,
	"bin_type" text NOT NULL,
	"bin_color" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_council_freshness" (
	"council_id" text PRIMARY KEY NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"refresh_method" text
);
--> statement-breakpoint
CREATE TABLE "bindicator_councils" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text,
	"bin_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missed_collection_url" text,
	"source_url" text,
	"data_strategy" text DEFAULT 'waitlist' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "bindicator_earned_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bindicator_households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"postcode" text NOT NULL,
	"address_line" text,
	"uprn" text,
	"paon" text,
	"council_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_idea_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"submitted_by_user_id" text,
	"submitted_by_name" text,
	"status" text DEFAULT 'open' NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"curated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"council_id" text NOT NULL,
	"item_name" text NOT NULL,
	"bin_type" text NOT NULL,
	"notes" text,
	"tip" text,
	"fun_fact" text,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "bindicator_lookup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"council_id" text NOT NULL,
	"postcode" text NOT NULL,
	"uprn" text,
	"paon" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"result" jsonb,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bindicator_magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "bindicator_magic_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "bindicator_notification_prefs" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"notify_day_before" boolean DEFAULT true NOT NULL,
	"notify_morning_of" boolean DEFAULT true NOT NULL,
	"notify_time" time DEFAULT '20:00:00' NOT NULL,
	"email_address" text
);
--> statement-breakpoint
CREATE TABLE "bindicator_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_schedule_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"council_id" text NOT NULL,
	"postcode" text NOT NULL,
	"uprn" text,
	"paon" text,
	"address" text,
	"schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'live' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_streaks" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_marked_date" date,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_unknown_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"council_id" text NOT NULL,
	"query" text NOT NULL,
	"search_count" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bindicator_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"council_id" text,
	"postcode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bindicator_agent_runs" ADD CONSTRAINT "bindicator_agent_runs_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_bin_cards" ADD CONSTRAINT "bindicator_bin_cards_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_bulletin_subscribers" ADD CONSTRAINT "bindicator_bulletin_subscribers_council_id_bindicator_councils_id_fk" FOREIGN KEY ("council_id") REFERENCES "public"."bindicator_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_bulletin_subscribers" ADD CONSTRAINT "bindicator_bulletin_subscribers_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_collections" ADD CONSTRAINT "bindicator_collections_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_council_freshness" ADD CONSTRAINT "bindicator_council_freshness_council_id_bindicator_councils_id_fk" FOREIGN KEY ("council_id") REFERENCES "public"."bindicator_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_earned_achievements" ADD CONSTRAINT "bindicator_earned_achievements_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_earned_achievements" ADD CONSTRAINT "bindicator_earned_achievements_achievement_id_bindicator_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."bindicator_achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_household_members" ADD CONSTRAINT "bindicator_household_members_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_households" ADD CONSTRAINT "bindicator_households_council_id_bindicator_councils_id_fk" FOREIGN KEY ("council_id") REFERENCES "public"."bindicator_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_idea_votes" ADD CONSTRAINT "bindicator_idea_votes_idea_id_bindicator_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."bindicator_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_items" ADD CONSTRAINT "bindicator_items_council_id_bindicator_councils_id_fk" FOREIGN KEY ("council_id") REFERENCES "public"."bindicator_councils"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_lookup_jobs" ADD CONSTRAINT "bindicator_lookup_jobs_council_id_bindicator_councils_id_fk" FOREIGN KEY ("council_id") REFERENCES "public"."bindicator_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_notification_prefs" ADD CONSTRAINT "bindicator_notification_prefs_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_push_subscriptions" ADD CONSTRAINT "bindicator_push_subscriptions_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_schedule_cache" ADD CONSTRAINT "bindicator_schedule_cache_council_id_bindicator_councils_id_fk" FOREIGN KEY ("council_id") REFERENCES "public"."bindicator_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_streaks" ADD CONSTRAINT "bindicator_streaks_household_id_bindicator_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."bindicator_households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindicator_unknown_items" ADD CONSTRAINT "bindicator_unknown_items_council_id_bindicator_councils_id_fk" FOREIGN KEY ("council_id") REFERENCES "public"."bindicator_councils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idea_votes_idea_user_idx" ON "bindicator_idea_votes" USING btree ("idea_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_household_endpoint_idx" ON "bindicator_push_subscriptions" USING btree ("household_id","endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_cache_council_postcode_uprn_idx" ON "bindicator_schedule_cache" USING btree ("council_id","postcode","uprn");--> statement-breakpoint
CREATE UNIQUE INDEX "unknown_items_council_query_idx" ON "bindicator_unknown_items" USING btree ("council_id","query");