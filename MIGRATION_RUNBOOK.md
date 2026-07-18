# Binly: Supabase → Neon migration runbook

This covers moving Binly's database off Supabase onto [Neon](https://neon.tech)
(free-tier serverless Postgres), following on from the cost conversation:
Supabase wasn't the only cost driver (Render's Standard plan for the Selenium
worker is a separate, bigger one — see "Also worth doing" at the end), but
it's the one this runbook fixes.

## What changed, in one paragraph

The app never talked to Supabase's Auth, Storage, or Realtime — only its
Postgres database, via the REST API (PostgREST) from both the Node server and
the Python worker. That REST layer is what's gone. In its place:
`shared/dbSchema.ts` is a proper Drizzle ORM schema (22 tables), `server/db.ts`
opens a real Postgres connection to Neon, and `server/supabaseCompat.ts` is a
small compatibility shim that makes `supabase.from(table).select().eq(...)`
keep working exactly as before — so the ~90 call sites across `routes.ts`,
`agents.ts`, `auth.ts`, `cron.ts`, `lookup.ts`, and `push.ts` needed **zero**
changes. The Python worker got the equivalent treatment: `selenium-worker/supa.py`
now runs parameterised SQL via `psycopg2` instead of REST calls, with the same
function signatures, so `worker.py` also needed no changes.

One dead file was removed: `server/storage.ts` was an unused Replit-template
leftover referencing a `users` table that doesn't exist anywhere else in the
app — it was already broken before this migration (try `npm run check` on the
original repo and you'll see the same error). Removing it is a bonus fix, not
a functional change.

## Before you start

You'll need:
- A Neon account (free, no card required) — [neon.tech](https://neon.tech)
- `psql` or Neon's SQL Editor in their dashboard (either works for the steps below)
- Access to your Render dashboard (or wherever the app and worker are deployed)
- This migrated code, either as the patch/zip provided or already merged into your repo

## Step 1 — Create the Neon project

1. Sign up at neon.tech, create a new project (any region close to your
   Render service's region keeps latency down — Render's default is Oregon,
   US West).
2. In the Neon dashboard, grab the **pooled** connection string (the one with
   `-pooler` in the hostname — this matters, it's what handles many short-lived
   connections well, which matches this app's pattern). It looks like:
   ```
   postgresql://<user>:<password>@<project>-pooler.<region>.aws.neon.tech/<db>?sslmode=require
   ```
3. Do **not** add a payment method unless you actually want to. Neon's free
   tier (0.5GB storage, 100 CU-hours/month, scale-to-zero) can't bill you
   without one on file.

## Step 2 — Create the schema

From the repo root, with `psql`:

```bash
psql "$DATABASE_URL" -f migrations/0000_sudden_alex_wilder.sql
psql "$DATABASE_URL" -f migrations/manual_0001_functions_and_extensions.sql
```

(Or paste both files into Neon's SQL Editor, in that order, if you'd rather
not install `psql`.)

The first file creates all 22 tables via Drizzle's generated DDL. The second
enables the `pg_trgm` extension and creates two Postgres functions
(`binly_search_items_fuzzy`, `binly_bump_unknown_item`) that the item-search
endpoint calls via `supabase.rpc(...)`. **These two functions only ever
existed inside your old Supabase project** — they were never committed to
this repo, so what's in `manual_0001_functions_and_extensions.sql` is a
best-effort reconstruction from how `server/routes.ts` calls them and the
code comments next to those calls (trigram similarity, threshold 0.25 for the
search; a plain counter increment for the bump). Worth a quick check that
fuzzy item search "feels" the same after you cut over — if not, the
`similarity(...) > 0.25` threshold is the knob to adjust.

## Step 3 — Import your seed data

Run these against the new database, in this exact order (later files assume
councils/items exist):

```bash
psql "$DATABASE_URL" -f scripts/chunks/00_wipe.sql
for f in scripts/chunks/0{1,2,3,4,5,6,7}_insert.sql; do psql "$DATABASE_URL" -f "$f"; done
psql "$DATABASE_URL" -f scripts/seed_items.sql
```

(`scripts/seed_all_councils.sql` is the same content as the `00_wipe.sql` +
`01`-`07_insert.sql` chunks combined — use one or the other, not both.)

This restores the 361 UK councils and the full item-lookup catalogue. It does
**not** restore any real household/user data, since none of that existed in
the repo (nor should it have — it's user data). If you had live users before
deleting the Supabase project, that data is gone; this rebuild starts fresh
from the seed catalogue, same as a new deploy would.

## Step 4 — Update environment variables

Replace `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_KEY`
everywhere with a single `DATABASE_URL` (the Neon pooled connection string
from Step 1):

- **Local dev**: your `.env` file at the repo root (used by both `server/`
  via `dotenv/config` and — if you run the worker locally — `selenium-worker/`).
- **Render — main app service**: dashboard → your web service → Environment
  → remove the old Supabase vars, add `DATABASE_URL`.
- **Render — `binly-binnovator` worker service**: same thing. Both
  `render.yaml` files in this repo (root and `selenium-worker/`) have already
  been updated to declare `DATABASE_URL` instead of the Supabase pair, so if
  you're using Render's Blueprint sync it'll prompt you for the new value on
  next deploy.
- **GitHub Actions** (`.github/workflows/cron.yml`): no change needed — it
  only calls `POST /api/cron/daily` on your deployed app over HTTPS, it never
  touched Supabase directly.

## Step 5 — Install and deploy

```bash
npm install        # picks up the new `postgres` dependency, drops @supabase/supabase-js + better-sqlite3
npm run check       # tsc — should show the same pre-existing errors as before (lucide-react/web-push
                     # missing type declarations, a couple of implicit-any warnings) and nothing new
                     # from the migration itself
npm run build
```

Deploy as you normally would (push to the branch Render auto-deploys from).
For the worker, redeploy the `binly-binnovator` service on Render after
setting `DATABASE_URL`.

## Step 6 — Smoke test

Before pointing real traffic at it:

1. `GET /api/health` → `{ ok: true }`
2. `GET /api/councils` → should return all 361 councils
3. Complete onboarding for a test postcode → confirms household/streak/
   notification-prefs inserts all work
4. `GET /api/items?q=pizza` → confirms the broad ILIKE path works; try a
   deliberately misspelled item (e.g. `q=teabagg`) to exercise the
   `binly_search_items_fuzzy` RPC fallback
5. Mark a bin out (`POST /api/streak/mark`) → confirms the no-`onConflict`
   upsert path (relies on `household_id` being the primary key on
   `bindicator_streaks`, per the schema notes below)
6. If you run the worker: `python worker.py --once` against a job you've
   manually inserted into `bindicator_lookup_jobs`, confirm it writes to
   `bindicator_schedule_cache`

## Rollback plan

Nothing about this migration touches your GitHub repo's git history — it's
all in this branch/patch. If something's wrong, redeploying the previous
commit (before this migration) is a clean revert, *provided* you haven't
deleted your old Supabase project's data too (in your case that's already
gone, so rollback really means "keep debugging Neon" rather than "switch
back"). Keep the Neon project around even after cutover for a few days before
deleting anything, in case you need to re-import against it again.

## Schema caveats worth knowing about

The original Supabase project's `CREATE TABLE` statements were never
committed to this repo — only `INSERT` seed data was. `shared/dbSchema.ts`
is reconstructed by reading every place the code touches each table
(`server/*.ts`, `selenium-worker/worker.py`, `shared/schema.ts`'s TypeScript
interfaces, and the seed SQL). It's a close match, but a few
primary-key/unique-constraint choices are inferred rather than confirmed:

- `bindicator_streaks` and `bindicator_notification_prefs`: primary key is
  `household_id` (inferred from `.upsert()` calls with no explicit
  `onConflict`, which in PostgREST means "conflict on the primary key")
- `bindicator_bulletin_subscribers`: primary key is `email` (from
  `onConflict: "email"`)
- `bindicator_council_freshness`: primary key is `council_id` (from the
  worker's explicit `on_conflict="council_id"`)
- Composite unique constraints on `bindicator_push_subscriptions`
  (household_id, endpoint), `bindicator_schedule_cache` (council_id,
  postcode, uprn), and `bindicator_unknown_items` (council_id, query) —
  all taken directly from `onConflict` strings in the code

If anything behaves unexpectedly around duplicate rows, these are the first
places to check.

## Also worth doing (separate from this migration)

The bigger recurring cost was the Selenium worker's Render **Standard plan
($25/mo)**, not Supabase. That's unchanged by this migration — it's still
running the same way, just pointed at Neon now instead of Supabase. If you
want to actually eliminate that cost too, the options from the earlier
conversation still stand: drop back to the non-Selenium `Dockerfile` (free
tier, loses only the 5 still-stub council adapters), or move the worker to a
scheduled GitHub Actions job instead of an always-on service. Happy to do
that one too if you want it.
