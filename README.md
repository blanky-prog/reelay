# Reelay portal

Managed Instagram clipping campaigns with verified views. One Next.js app with three portals:

- **Crew App** (`/crew`) for clippers
- **Control Room** (`/room`) for the Reelay team
- **Reelay Live** (`/live`) for clients

Everyone signs in at `/login` and lands in the portal for their role. Read [SPEC.md](SPEC.md) for what the product does and [CLAUDE.md](CLAUDE.md) for the rules every change must follow.

## What's in milestone 1

- Next.js 15 + TypeScript app shell, Supabase login, role-based routing to the three portals
- Full v1 database (`supabase/migrations`): 17 tables from the spec plus a settings table, with **row-level security on every table**
- Database guard rails: clippers can't change their own tier or status; new sign-ups are always clippers; the person who prepared or approved anything in a payout run can't release it; append-only audit log on every money and decision table
- All business rules as tested pure functions (`src/lib/rules.ts`): paid views, India share, per-clip and campaign caps, 70/30 split, live check and clawbacks, fraud flags, submission checks, Friday payout run
- AES-256-GCM encryption for PAN and UPI IDs (`src/lib/crypto.ts`)
- Tests: rules, encryption, and security tests that run the real migration in an in-memory Postgres and prove who can see and change what

## Run it locally

1. Install: `npm install`
2. Create a Supabase project. In its SQL editor, run the files in `supabase/migrations` in order (`0001` to `0004`), or use the Supabase CLI: `supabase db push`.
3. Copy `.env.example` to `.env.local` and fill in your project URL, anon key and a new `REELAY_DATA_KEY`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
4. `npm run dev` and open http://localhost:3000
5. Create your account in Supabase Auth (Authentication > Users > Add user), then make yourself super admin in the SQL editor:

```sql
insert into organisations (name, type) values ('Reelay', 'reelay');
update users set role = 'super_admin', organisation_id = (select id from organisations where type = 'reelay' limit 1)
where email = 'you@example.com';
```

## Checks

```bash
npm test          # rules, encryption and row-level security tests
npm run typecheck
npm run build
```

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Setup, logins, roles, full database with RLS, business rules with tests | Done |
| 2 | Crew App: sign-up, KYC, bio-code check, test brief, campaigns (public, application, private), submit clip, my clips, Insights recording upload, earnings | Done |
| 3 | Control Room: clients, people and roles, campaign setup (access type, pay model, brief, files, promo codes, applications, invites), clipper approval and test scoring, account verification, QA queue with bot score and timestamped feedback, view verification with fraud rules, flags and strikes, audit log | Done |
| 4 | Jobs: snapshot reminders, count lock, live check, campaign cap, payout runs and UPI file | Next |
| 5 | Reelay Live: dashboard, ProofCount, clips, audience, sales, PDF reports, billing | |
| 6 | Hardening: 2FA for team, security review, email notifications, deploy to Vercel | |

## Deploying

Vercel: import the repo, add the environment variables from `.env.example`, deploy. Keep `SUPABASE_SERVICE_ROLE_KEY` and `REELAY_DATA_KEY` server-only; never prefix them with `NEXT_PUBLIC_`.

Before real clippers' KYC data goes in, have a developer review the RLS policies and the encryption setup.
