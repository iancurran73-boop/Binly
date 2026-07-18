/**
 * Drop-in replacement for the old `@supabase/supabase-js` client.
 *
 * Everything that imports `{ supabase } from "./supabase"` (agents.ts,
 * auth.ts, cron.ts, lookup.ts, push.ts, routes.ts) keeps working unmodified —
 * `.from(table).select().eq()...` etc. now run as parameterised SQL against
 * Neon via `server/supabaseCompat.ts` instead of Supabase's hosted REST API.
 * See MIGRATION_RUNBOOK.md for why this shim exists instead of rewriting
 * every call site to typed Drizzle queries.
 */
export { supabase } from "./supabaseCompat";
