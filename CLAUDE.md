# Reelay portal: rules for anyone (human or AI) working in this repo

Read SPEC.md first. Build one milestone at a time (see README) and show a plan before large changes.

## Non-negotiables

- **Instagram Reels only** in v1. No other platforms in code paths or UI.
- **Money is always integer paise** (`bigint` in Postgres, `number` of whole paise in TS). Never floats for money. Format with `formatInr` only at display time.
- **Business rules live in `src/lib/rules.ts`** as pure functions with tests. Jobs and API routes call these; they never re-implement the maths.
- **Row-level security on every table.** A new table is not done until it has RLS policies and a test in `tests/rls.test.ts` proving a client or clipper can't read someone else's rows.
- **Separation of duties:** the person who approves a clip can never release its payout; the person who prepares a payout run can never release it. Enforced in the database (`app.guard_payout_release`), not just the UI.
- **Clients see only verified numbers** (clip status counting, locked, live_checked).
- **Audit log is append-only.** Never add update or delete paths to `audit_log`.
- **PAN and UPI are encrypted** with `src/lib/crypto.ts` before they reach the database; show only masked values except to finance.
- **No scraping Instagram.** Views come from clipper screen recordings and QA-entered public counts until the Meta API is approved.
- Every change to money logic or RLS needs tests; run `npm test` and `npm run typecheck` before committing.

## Copy and brand

- Brand: Reelay (by Blanky in India). Product names: Crew App, Control Room, Reelay Live, ProofCount.
- Plain English; never use the word "elevate"; no em dashes in any UI copy or docs.
- Colours: Ink #111111, Paper #F5F2EC, Relay Orange #FF5A1F, Verified Green #22C55E (only next to verified numbers).
