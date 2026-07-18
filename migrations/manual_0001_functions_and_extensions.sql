-- Manual migration — NOT managed by drizzle-kit (functions aren't part of
-- the Drizzle schema). Run this once, after the drizzle-kit-generated
-- 0000_*.sql, before importing your seed data.
--
-- These two functions existed only inside the old Supabase project (they
-- were never committed to this repo — likely created ad hoc via the
-- Supabase SQL editor). This is a best-effort reconstruction based on how
-- server/routes.ts calls them and the comments next to those call sites:
--   - binly_search_items_fuzzy: pg_trgm similarity search, threshold 0.25,
--     used as a fallback when the broad ILIKE search returns nothing.
--   - binly_bump_unknown_item: increments the search_count counter on an
--     existing bindicator_unknown_items row (the upsert() call before it
--     only handles the insert case).
-- Worth a quick sanity check against real search results after go-live —
-- if your old fuzzy-match behaved differently, adjust the threshold below.

create extension if not exists pg_trgm;

create or replace function binly_search_items_fuzzy(
  p_council_id text,
  p_query text,
  p_limit int default 8
)
returns setof bindicator_items
language sql
stable
as $$
  select *
  from bindicator_items
  where council_id = p_council_id
    and similarity(item_name, p_query) > 0.25
  order by similarity(item_name, p_query) desc
  limit p_limit;
$$;

create or replace function binly_bump_unknown_item(
  p_council_id text,
  p_query text
)
returns void
language sql
as $$
  update bindicator_unknown_items
  set search_count = search_count + 1,
      last_seen_at = now()
  where council_id = p_council_id
    and query = p_query;
$$;
