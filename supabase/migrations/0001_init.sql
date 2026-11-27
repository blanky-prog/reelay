-- Reelay v1: schema, row-level security, audit log and guard rails.
-- Instagram Reels only, India, INR. Money is always stored in paise (bigint).
-- Runs on Supabase (uses auth.uid() and the authenticated role).

create schema if not exists app;

-- ---------- Enums ----------
create type public.user_role as enum (
  'super_admin', 'campaign_manager', 'qa_reviewer', 'network_manager', 'finance',
  'client_admin', 'client_viewer', 'clipper'
);
create type public.org_type as enum ('client', 'reelay');
create type public.clipper_status as enum ('applied', 'active', 'banned');
create type public.clipper_tier as enum ('rookie', 'runner', 'anchor');
create type public.campaign_status as enum ('draft', 'live', 'full', 'closed');
create type public.clip_status as enum (
  'submitted', 'in_review', 'counting', 'flagged', 'locked', 'live_checked',
  'rejected', 'fraud', 'clawed_back', 'campaign_full'
);
create type public.review_decision as enum ('approved', 'rejected', 'flagged');
create type public.flag_status as enum ('open', 'cleared', 'fraud');
create type public.payout_type as enum ('lock_70', 'live_check_30', 'clawback');
create type public.payout_item_status as enum ('pending', 'in_run', 'paid', 'cancelled');
create type public.payout_run_status as enum ('prepared', 'released', 'paid');
create type public.source_file_type as enum ('raw', 'lead_clip');

-- ---------- Tables ----------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.org_type not null default 'client',
  gst_number text,
  billing_address text,
  created_at timestamptz not null default now()
);

-- One row per auth user. id = auth.users.id
create table public.users (
  id uuid primary key,
  organisation_id uuid references public.organisations(id),
  name text not null,
  email text not null,
  phone text,
  role public.user_role not null default 'clipper',
  two_factor_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- Global defaults the super admin can change. Exactly one row.
create table public.settings (
  id boolean primary key default true check (id),
  min_views integer not null default 10000,
  count_day integer not null default 7,
  lock_day integer not null default 14,
  live_check_day integer not null default 30,
  live_check_max_drop_pct integer not null default 10,
  lock_share_pct integer not null default 70,
  min_payout_paise bigint not null default 50000,
  per_clip_cap_views integer not null default 500000,
  submission_window_hours integer not null default 48,
  rate_rookie_paise bigint not null default 2000,
  rate_runner_paise bigint not null default 2500,
  rate_anchor_paise bigint not null default 3000,
  flag_like_rate_pct numeric not null default 0.5,
  flag_watch_seconds numeric not null default 2,
  flag_india_share_pct integer not null default 70,
  flag_spike_pct integer not null default 60,
  updated_at timestamptz not null default now()
);
insert into public.settings default values;

create table public.clippers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  -- Encrypted by the server with AES-256-GCM before insert (see src/lib/crypto.ts).
  pan_encrypted text,
  upi_encrypted text,
  pan_last4 text,
  upi_masked text,
  name_match_status text not null default 'pending' check (name_match_status in ('pending', 'matched', 'mismatch')),
  city text,
  niches text[] not null default '{}',
  languages text[] not null default '{}',
  tier public.clipper_tier not null default 'rookie',
  strikes integer not null default 0,
  status public.clipper_status not null default 'applied',
  test_brief_score integer check (test_brief_score between 0 and 20),
  created_at timestamptz not null default now()
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  clipper_id uuid not null references public.clippers(id) on delete cascade,
  platform text not null default 'instagram' check (platform = 'instagram'),
  handle text not null,
  bio_code text not null default ('RLY-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))),
  verified_at timestamptz,
  audience_india_share numeric check (audience_india_share between 0 and 1),
  created_at timestamptz not null default now(),
  unique (platform, handle)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  package text not null check (package in ('first_leg', 'relay', 'always_on', 'custom')),
  view_target integer not null check (view_target > 0),
  revenue_paise bigint not null default 0,
  start_date date,
  end_date date,
  status public.campaign_status not null default 'draft',
  per_clip_cap_views integer not null default 500000,
  rate_rookie_paise bigint not null default 2000,
  rate_runner_paise bigint not null default 2500,
  rate_anchor_paise bigint not null default 3000,
  allowed_tiers public.clipper_tier[] not null default '{rookie,runner,anchor}',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version integer not null default 1,
  instructions text not null,
  banned_claims text[] not null default '{}',
  music_rules text,
  cta text,
  created_at timestamptz not null default now(),
  unique (campaign_id, version)
);

create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  file_url text not null,
  type public.source_file_type not null default 'raw',
  created_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  clipper_id uuid not null references public.clippers(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (campaign_id, clipper_id)
);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id),
  clipper_id uuid not null references public.clippers(id),
  social_account_id uuid not null references public.social_accounts(id),
  reel_url text not null unique,
  caption_code text not null unique,
  posted_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  baseline_views integer not null default 0,
  status public.clip_status not null default 'submitted',
  locked_views integer,
  india_share numeric check (india_share between 0 and 1),
  paid_views integer,
  flag_reason text,
  reject_reason text
);
create index clips_campaign_idx on public.clips (campaign_id, status);
create index clips_clipper_idx on public.clips (clipper_id);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  day integer not null check (day in (0, 1, 7, 14, 30)),
  public_views integer,
  insights_views integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  avg_watch_seconds numeric,
  india_share numeric check (india_share between 0 and 1),
  recording_url text,
  entered_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (clip_id, day)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  reviewer_id uuid not null references public.users(id),
  decision public.review_decision not null,
  checklist jsonb not null default '{}',
  reason text,
  created_at timestamptz not null default now()
);

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id) on delete cascade,
  rule text not null,
  value numeric,
  threshold numeric,
  status public.flag_status not null default 'open',
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payout_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default current_date,
  total_paise bigint not null default 0,
  file_url text,
  status public.payout_run_status not null default 'prepared',
  prepared_by uuid not null references public.users(id),
  released_by uuid references public.users(id),
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payout_items (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips(id),
  clipper_id uuid not null references public.clippers(id),
  type public.payout_type not null,
  amount_paise bigint not null,
  status public.payout_item_status not null default 'pending',
  run_id uuid references public.payout_runs(id),
  created_at timestamptz not null default now(),
  unique (clip_id, type),
  check ((type = 'clawback' and amount_paise <= 0) or (type <> 'clawback' and amount_paise >= 0))
);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  clip_id uuid references public.clips(id),
  code text not null,
  unique (campaign_id, code)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  external_order_id text not null,
  code text not null,
  amount_paise bigint not null,
  ordered_on date not null,
  unique (campaign_id, external_order_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  object_type text not null,
  object_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Helper functions (security definer so policies don't recurse) ----------
create or replace function app.my_role() returns public.user_role
language sql stable security definer set search_path = public as
$$ select role from public.users where id = auth.uid() $$;

create or replace function app.my_org() returns uuid
language sql stable security definer set search_path = public as
$$ select organisation_id from public.users where id = auth.uid() $$;

create or replace function app.my_clipper_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.clippers where user_id = auth.uid() $$;

create or replace function app.is_team() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(app.my_role() in ('super_admin','campaign_manager','qa_reviewer','network_manager','finance'), false) $$;

create or replace function app.has_role(variadic roles public.user_role[]) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(app.my_role() = any(roles), false) $$;

create or replace function app.is_client_of(campaign uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.campaigns c
     where c.id = campaign
       and c.organisation_id = app.my_org()
       and app.my_role() in ('client_admin','client_viewer')) $$;

create or replace function app.clipper_can_see_campaign(campaign uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.campaigns c
     join public.clippers k on k.id = app.my_clipper_id()
     where c.id = campaign
       and k.status = 'active'
       and (c.status = 'live' and k.tier = any(c.allowed_tiers)
            or exists (select 1 from public.campaign_members m where m.campaign_id = c.id and m.clipper_id = k.id))) $$;

-- Clips a client may see: only verified statuses, so the dashboard always matches the bill.
create or replace function app.is_verified_status(s public.clip_status) returns boolean
language sql immutable as
$$ select s in ('counting','locked','live_checked') $$;

-- ---------- Row-level security ----------
alter table public.organisations enable row level security;
alter table public.users enable row level security;
alter table public.settings enable row level security;
alter table public.clippers enable row level security;
alter table public.social_accounts enable row level security;
alter table public.campaigns enable row level security;
alter table public.briefs enable row level security;
alter table public.source_files enable row level security;
alter table public.campaign_members enable row level security;
alter table public.clips enable row level security;
alter table public.snapshots enable row level security;
alter table public.reviews enable row level security;
alter table public.flags enable row level security;
alter table public.payout_runs enable row level security;
alter table public.payout_items enable row level security;
alter table public.promo_codes enable row level security;
alter table public.orders enable row level security;
alter table public.audit_log enable row level security;

-- organisations
create policy org_team_read on public.organisations for select using (app.is_team());
create policy org_client_read on public.organisations for select using (id = app.my_org());
create policy org_manage on public.organisations for all
  using (app.has_role('super_admin','campaign_manager')) with check (app.has_role('super_admin','campaign_manager'));

-- users
create policy users_self_read on public.users for select using (id = auth.uid());
create policy users_team_read on public.users for select using (app.is_team());
create policy users_client_admin_read on public.users for select
  using (app.my_role() = 'client_admin' and organisation_id = app.my_org());
create policy users_admin_manage on public.users for all
  using (app.has_role('super_admin')) with check (app.has_role('super_admin'));

-- settings
create policy settings_team_read on public.settings for select using (app.is_team());
create policy settings_admin_update on public.settings for update
  using (app.has_role('super_admin')) with check (app.has_role('super_admin'));

-- clippers
create policy clippers_self_read on public.clippers for select using (user_id = auth.uid());
create policy clippers_self_insert on public.clippers for insert with check (user_id = auth.uid());
create policy clippers_self_update on public.clippers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy clippers_team_read on public.clippers for select using (app.is_team());
create policy clippers_network_manage on public.clippers for update
  using (app.has_role('super_admin','network_manager')) with check (app.has_role('super_admin','network_manager'));

-- social_accounts
create policy sa_self_all on public.social_accounts for all
  using (clipper_id = app.my_clipper_id()) with check (clipper_id = app.my_clipper_id());
create policy sa_team_read on public.social_accounts for select using (app.is_team());
create policy sa_network_manage on public.social_accounts for update
  using (app.has_role('super_admin','network_manager')) with check (app.has_role('super_admin','network_manager'));

-- campaigns
create policy campaigns_team_read on public.campaigns for select using (app.is_team());
create policy campaigns_manage on public.campaigns for all
  using (app.has_role('super_admin','campaign_manager')) with check (app.has_role('super_admin','campaign_manager'));
create policy campaigns_client_read on public.campaigns for select using (app.is_client_of(id));
create policy campaigns_clipper_read on public.campaigns for select using (app.clipper_can_see_campaign(id));

-- briefs and source files
create policy briefs_team on public.briefs for all
  using (app.has_role('super_admin','campaign_manager')) with check (app.has_role('super_admin','campaign_manager'));
create policy briefs_team_read on public.briefs for select using (app.is_team());
create policy briefs_client_read on public.briefs for select using (app.is_client_of(campaign_id));
create policy briefs_clipper_read on public.briefs for select using (app.clipper_can_see_campaign(campaign_id));

create policy files_team on public.source_files for all
  using (app.has_role('super_admin','campaign_manager')) with check (app.has_role('super_admin','campaign_manager'));
create policy files_team_read on public.source_files for select using (app.is_team());
create policy files_client_read on public.source_files for select using (app.is_client_of(campaign_id));
create policy files_clipper_read on public.source_files for select using (app.clipper_can_see_campaign(campaign_id));

-- campaign members
create policy members_self_read on public.campaign_members for select using (clipper_id = app.my_clipper_id());
create policy members_self_join on public.campaign_members for insert
  with check (clipper_id = app.my_clipper_id() and app.clipper_can_see_campaign(campaign_id));
create policy members_team_read on public.campaign_members for select using (app.is_team());

-- clips
create policy clips_self_read on public.clips for select using (clipper_id = app.my_clipper_id());
create policy clips_self_submit on public.clips for insert
  with check (
    clipper_id = app.my_clipper_id()
    and status = 'submitted'
    and exists (select 1 from public.campaign_members m where m.campaign_id = clips.campaign_id and m.clipper_id = app.my_clipper_id())
    and exists (select 1 from public.social_accounts s where s.id = clips.social_account_id and s.clipper_id = app.my_clipper_id() and s.verified_at is not null)
  );
create policy clips_team_read on public.clips for select using (app.is_team());
create policy clips_team_update on public.clips for update
  using (app.has_role('super_admin','qa_reviewer','campaign_manager')) with check (app.has_role('super_admin','qa_reviewer','campaign_manager'));
create policy clips_client_read on public.clips for select
  using (app.is_client_of(campaign_id) and app.is_verified_status(status));

-- snapshots
create policy snap_self_read on public.snapshots for select
  using (exists (select 1 from public.clips c where c.id = clip_id and c.clipper_id = app.my_clipper_id()));
create policy snap_self_upload on public.snapshots for insert
  with check (exists (select 1 from public.clips c where c.id = clip_id and c.clipper_id = app.my_clipper_id()));
create policy snap_team_all on public.snapshots for all
  using (app.has_role('super_admin','qa_reviewer')) with check (app.has_role('super_admin','qa_reviewer'));
create policy snap_team_read on public.snapshots for select using (app.is_team());
create policy snap_client_read on public.snapshots for select
  using (exists (select 1 from public.clips c where c.id = clip_id and app.is_client_of(c.campaign_id) and app.is_verified_status(c.status)));

-- reviews and flags: team only
create policy reviews_team_read on public.reviews for select using (app.is_team());
create policy reviews_qa_insert on public.reviews for insert
  with check (app.has_role('super_admin','qa_reviewer') and reviewer_id = auth.uid());
create policy flags_team_read on public.flags for select using (app.is_team());
create policy flags_qa_manage on public.flags for all
  using (app.has_role('super_admin','qa_reviewer')) with check (app.has_role('super_admin','qa_reviewer'));

-- payouts
create policy items_self_read on public.payout_items for select using (clipper_id = app.my_clipper_id());
create policy items_team_read on public.payout_items for select using (app.is_team());
create policy items_finance_manage on public.payout_items for all
  using (app.has_role('super_admin','finance')) with check (app.has_role('super_admin','finance'));

create policy runs_team_read on public.payout_runs for select using (app.is_team());
create policy runs_finance_prepare on public.payout_runs for insert
  with check (app.has_role('super_admin','finance') and prepared_by = auth.uid());
create policy runs_admin_release on public.payout_runs for update
  using (app.has_role('super_admin')) with check (app.has_role('super_admin'));

-- promo codes and orders
create policy promo_team on public.promo_codes for all
  using (app.has_role('super_admin','campaign_manager')) with check (app.has_role('super_admin','campaign_manager'));
create policy promo_team_read on public.promo_codes for select using (app.is_team());
create policy promo_client_read on public.promo_codes for select using (app.is_client_of(campaign_id));
create policy orders_team on public.orders for all
  using (app.has_role('super_admin','campaign_manager')) with check (app.has_role('super_admin','campaign_manager'));
create policy orders_team_read on public.orders for select using (app.is_team());
create policy orders_client_read on public.orders for select using (app.is_client_of(campaign_id));

-- audit log: readable by super admin, written only by triggers, never edited
create policy audit_admin_read on public.audit_log for select using (app.has_role('super_admin'));

-- ---------- Guard rails ----------

-- Clippers may edit their own profile but never their tier, status, strikes, score or name-match result.
create or replace function app.guard_clipper_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('super_admin','network_manager') then
    if new.tier is distinct from old.tier
       or new.status is distinct from old.status
       or new.strikes is distinct from old.strikes
       or new.test_brief_score is distinct from old.test_brief_score
       or new.name_match_status is distinct from old.name_match_status then
      raise exception 'Only the network team can change tier, status, strikes, score or name match';
    end if;
  end if;
  return new;
end $$;
create trigger clippers_guard before update on public.clippers
  for each row execute function app.guard_clipper_fields();

-- New clipper rows always start as applied rookies, whatever the client sends.
create or replace function app.default_new_clipper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('super_admin','network_manager') then
    new.tier := 'rookie'; new.status := 'applied'; new.strikes := 0;
    new.test_brief_score := null; new.name_match_status := 'pending';
  end if;
  return new;
end $$;
create trigger clippers_defaults before insert on public.clippers
  for each row execute function app.default_new_clipper();

-- Separation of duties: a payout run can only be released by a super admin who
-- (a) did not prepare it and (b) did not approve any clip in it.
create or replace function app.guard_payout_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'released' and old.status = 'prepared' then
    if auth.uid() = old.prepared_by then
      raise exception 'The person who prepared a payout run cannot release it';
    end if;
    if exists (
      select 1 from public.payout_items i
      join public.reviews r on r.clip_id = i.clip_id and r.decision = 'approved'
      where i.run_id = old.id and r.reviewer_id = auth.uid()
    ) then
      raise exception 'You approved a clip in this run, so you cannot release its payout';
    end if;
    new.released_by := auth.uid();
    new.released_at := now();
  elsif new.status is distinct from old.status and not (old.status = 'released' and new.status = 'paid') then
    raise exception 'Invalid payout run status change from % to %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger payout_runs_guard before update on public.payout_runs
  for each row execute function app.guard_payout_release();

-- Audit every change to the tables that move money or decide outcomes.
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, object_type, object_id, before, after)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_clips after insert or update or delete on public.clips for each row execute function app.audit();
create trigger audit_reviews after insert or update or delete on public.reviews for each row execute function app.audit();
create trigger audit_flags after insert or update or delete on public.flags for each row execute function app.audit();
create trigger audit_payout_items after insert or update or delete on public.payout_items for each row execute function app.audit();
create trigger audit_payout_runs after insert or update or delete on public.payout_runs for each row execute function app.audit();
create trigger audit_campaigns after insert or update or delete on public.campaigns for each row execute function app.audit();
create trigger audit_clippers after update on public.clippers for each row execute function app.audit();

-- settings has a boolean id; audit it separately.
create or replace function app.audit_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, object_type, object_id, before, after)
  values (auth.uid(), 'update', 'settings', 'global', to_jsonb(old), to_jsonb(new));
  return new;
end $$;
create trigger audit_settings after update on public.settings for each row execute function app.audit_settings();

-- Nobody edits or deletes the audit log through the API.
revoke update, delete, truncate on public.audit_log from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke update, delete, truncate on public.audit_log from authenticated';
    execute 'grant usage on schema app to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
  end if;
end $$;
