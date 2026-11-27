# Reelay v1 Product Spec

The full, living version of this spec is the "Reelay v1 Product Spec" doc. This file is the copy the code is built against. If they disagree, ask before building.

Reelay v1 is a web app with three portals (Crew App for clippers, Control Room for the Reelay team, Reelay Live for clients) that runs Instagram clipping campaigns end to end: briefs, clip submissions, verification, payouts and client reporting.

## Scope

**v1 supports Instagram Reels only, in India, in rupees.**

In v1:
- Three portals in one web app, mobile-friendly, with separate logins and roles
- Campaigns with briefs, source files, banned claims, budget caps and per-clip caps
- Clipper sign-up, ownership check by bio code, KYC details, test brief, tiers
- Clip submission by Instagram Reel link, with a unique caption code per submission
- View verification: public view count snapshots plus clipper-uploaded screen recordings of Insights
- QA review queue, fraud flags, strikes and bans
- Count lock at day 14, 70/30 payout split, day 30 live check, clawbacks
- Weekly payout runs exported as a bulk UPI payout file
- Client dashboard, weekly PDF reports, promo code sales entered or imported by CSV
- Email notifications

Not in v1: YouTube, X, TikTok; Instagram API data (v3, needs Meta App Review); API payouts and WhatsApp (v2); Shopify sync (v2); multi-currency (v3); native apps.

**Decision (27 Nov 2026): Reelay is fully managed.** Clients never build or run campaigns; the Reelay team does it in Control Room. No self-serve campaign builder or checkout.

Added to v1:

| Feature | Where | How it works |
| --- | --- | --- |
| Bot score on every clip | QA queue, ProofCount | 0 to 100 risk score from the fraud signals (`botScore` in rules.ts) |
| Timestamped feedback | QA review, Crew App clip detail | Notes pinned to moments in the clip, e.g. "0:03, founder not on screen yet" |
| Campaign access | Campaign setup (team only) | public (allowed tiers join directly), application (clippers apply, team approves), private (invite only) |
| Pay models | Campaign setup (team only) | cpm (default), per_post (flat fee per approved post) or retainer (monthly) |

## Roles

| Role | Portal | Can do | Cannot do |
| --- | --- | --- | --- |
| super_admin | Control Room | Everything, including settings, rates and releasing payouts | |
| campaign_manager | Control Room | Campaigns, briefs, clients, reports | Release payouts |
| qa_reviewer | Control Room | Approve, reject, flag clips; strikes | Edit payouts or rates |
| network_manager | Control Room | Approve clippers, tiers, bans | Approve clips |
| finance | Control Room | Prepare payout runs, invoices, clawbacks | Approve clips; release payouts |
| client_admin | Reelay Live | Own campaigns, upload content, invite viewers, reports, invoices | Other clients; clipper personal data |
| client_viewer | Reelay Live | Own campaigns and reports | Upload, invite, invoices |
| clipper | Crew App | Join campaigns, submit clips, own clips and earnings | Other clippers' data; client data beyond the brief |

**Key rule:** the person who approves a clip is never the person who releases its payout.

## Business rules (defaults, all editable in Settings)

| Setting | Default |
| --- | --- |
| Platform / market | Instagram Reels / India (only the India share of views is paid) |
| Minimum views to qualify | 10,000 |
| Count snapshot / lock / live check | Day 7 / day 14 / day 30 |
| Live check | Clip still live; views not down more than 10% from lock |
| Payout split | 70% after lock, 30% after live check |
| Payout day | Friday; minimum Rs 500, smaller balances roll over |
| Rates per 1,000 verified views | Rookie Rs 20, Runner Rs 25, Anchor Rs 30 (per campaign; open question: Rs 40 to 60) |
| Per-clip cap | 5,00,000 views |
| Campaign cap | Package view target; campaign closes automatically |
| Submission window | 48 hours after posting; posted after joining the campaign |
| Caption code | Required, unique per submission |
| Fraud flags | Like rate under 0.5%; avg watch under 2s; India share under 70%; over 60% of views in one 6-hour window; views over 4x reach |
| Strikes | 3 quality strikes = removal; confirmed fraud = ban and clawback |
| Tiers | Runner: 5,00,000 verified views, no fraud. Anchor: 20,00,000 and top 10% quality |

Paid views = min(locked views x India share, per-clip cap), and 0 below the minimum. Payout = paid views / 1,000 x rate. 70% after lock, 30% after live check.

## Clip lifecycle

submitted -> in_review -> counting -> locked -> live_checked
Side exits: rejected, flagged (-> counting or fraud), clawed_back, campaign_full.

## Portals (screens)

- **Crew App:** sign up, profile and KYC, connect Instagram (bio code), test brief, campaigns, campaign detail, submit clip, my clips, clip detail (upload Insights recordings), earnings, tier and leaderboard, notifications.
- **Control Room:** home, clients, campaign setup, campaign detail, QA queue, flags, verification, clippers, payout runs, reports, settings, audit log.
- **Reelay Live:** overview, daily views, ProofCount, clips, audience, sales, reports, billing, onboarding, team.

## Background jobs

Submission checks; snapshot reminders (day 7 and 14); fraud rules on each snapshot; count lock (day 14); live check (day 30); campaign cap on every lock; payout run (Thursday night). No scraping of Instagram.

## Security

Row-level security on every table; 2FA for team; PAN and UPI encrypted (masked everywhere except finance); no Aadhaar or passwords collected; immutable audit log; separation of duties on payouts; daily backups.

## v1 is done when

- A campaign can be created, run and closed without any spreadsheet
- A clipper can sign up, verify, pass the test, join, submit and get paid in the app
- Every fraud rule opens a flag when its threshold is crossed
- A campaign closes itself at its target and later clips earn nothing
- The Friday payout file matches payable items minus clawbacks, to the paisa
- Clients see only verified numbers, matching the invoice
- No client or clipper can see another's data
- Every approval and payout is in the audit log
- Works on a mid-range Android phone on 4G
