# Bindicator Phase 1 — build notes

## Voice
Refreshed all user-facing copy with the "binfluencer chaos with substance" tone:
- **Landing:** "Your bins, sorted." / "Wheelie good." / "Don't talk rubbish. Take it out." Three clay characters with quotes. Footer: "Made with clay, care and a slightly unhealthy interest in lid hinges."
- **Onboard:** "Tell us where you live." / "Sending in the agents…" / waitlist screen: "We don't auto-pull the schedule for {council} just yet. Drop your email and we'll yell when we do."
- **Dashboard:** "All quiet on the kerb." / "Streaks rewarded. Smugness encouraged." / streak milestone toast: "{n} weeks. Iconic."
- **Items:** "Pizza box paradox? Solved." / "Don't talk rubbish — bin it correctly."
- **Achievements:** "Trophies, hard-earned." / "Each one's a small certificate of binning excellence."
- **Households:** "Flatmates, herded." / "One person remembering bin day for everyone? That's a war crime."
- **Wrapped:** "Your Bin Wrapped." / "Streaks rewarded. Smugness encouraged." (wordmark on the card itself)
- **Settings:** "The boring (necessary) bits."

## Pages built / refreshed
- `Nav.tsx` — shared top nav with mobile menu (Bins · Lookup · Trophies · Flatmates · Wrapped · Settings).
- `Landing.tsx` — refreshed with character trio + chaos voice.
- `Onboard.tsx` — replaced council Select with shadcn `Combobox` (Command + Popover) searching all 361 councils. Detects `data_strategy === "waitlist"` and switches to email-capture. Waitlist hits new `POST /api/waitlist`.
- `Dashboard.tsx` — horoscope card, Bin of the Week card with character image (hover scale + rotate), streak fireworks via `canvas-confetti`, thunk sound via Web Audio API on mark-bin-out, prefers-reduced-motion respected.
- `Items.tsx` v2 — search filters across `item_name + category`. Each result is an expandable card showing `notes` (The truth) + `tip` (Tip) + `fun_fact` (Fun fact) with distinct icons & tones. Bin-type pill colour-coded (with sensible fallbacks per bin family). Category chip. Click-to-expand fires `POST /api/items/looked-up`. Shrek easter egg: typing "shrek" surfaces a hidden quote card without breaking filtering.
- `Achievements.tsx` — grid of all 16 achievements; earned in full colour with date, unearned greyscaled with rarity-aware teaser. Rarity badge (common / rare / epic / legendary) styled per tier.
- `Households.tsx` — lists members from `GET /api/members`, invite form posts to `POST /api/members` (auto-triggers sharer achievement), remove via DELETE, copy-paste invite link.
- `Wrapped.tsx` — portrait 9:16 share card with current streak / favourite bin (computed from collections) / unlocked achievement count + top 3 names. Copy-link button. Suitable for screenshotting.

## Server
- Added `POST /api/waitlist` writing to a new `bindicator_waitlist` table (`(email, council_id, postcode, created_at)`). Migration applied to Supabase project `kgxvomfyvirkqhgabjel` with anon-insert RLS.
- `/api/councils` now returns `data_strategy` so the onboarding combobox can switch flow.

## FX
- `client/src/lib/fx.ts` — `fireBinFireworks(count)` and `thunkSound()`. Both no-op under `prefers-reduced-motion`. Fireworks fire 3-burst on streak milestones (1, 4, 12, 26, 52); single burst otherwise.
- Hover micro-interactions on bin character images on Dashboard and bin pills on Items list.

## QA
Screenshots in `/tmp/bindicator-qa/`. Captured both desktop (1280×900) and mobile (375×800) for every page. Full populated views via a seeded test visitor (`qa-test-visitor-*`) onboarded against Aberdeen City. Streak, members, achievements, lookups, horoscope all populated.

## Known issues / scope deferred
- **Streak only increments once per real calendar day.** Even with multiple `/api/streak/mark` calls in QA, streak stays at 1 because the same-day guard short-circuits. The "X weeks. Iconic." toast logic is wired but only fires when a milestone is actually reached on a real day — can't simulate week-rollover in a single QA run.
- **Bin Wrapped favourite bin** is computed client-side from `/api/collections` (next 8 weeks), not historical data. For year-end Wrapped this should consume a server endpoint that aggregates the verified history table.
- **Bin character hover micro-interactions** are CSS-only (scale + slight rotate). Nothing fancy yet.
- **Magic-link auth** intentionally Phase 2 — visitor ID via `?uid=` query param continues.
- **Email actually being sent** for invites is not wired; the row is created and the sharer achievement awarded but no SMTP.
- **Invite link** uses placeholder host `https://bindicator.example/?invite={household_id}` per task spec.
- The "Jones" achievement teaser falls back to "Hidden trigger. Keep binning." for trigger types that aren't covered in the teaser map (e.g. odd specials). Earned descriptions still render correctly.
