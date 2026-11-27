-- Milestone 2: Crew App support, plus the managed-model features added on 27 Nov 2026:
-- campaign access types, pay models, bot score, timestamped feedback.

create type public.campaign_visibility as enum ('public', 'application', 'private');
create type public.pay_model as enum ('cpm', 'per_post', 'retainer');
create type public.application_status as enum ('pending', 'approved', 'declined');

alter table public.campaigns
  add column visibility public.campaign_visibility not null default 'public',
  add column pay_model public.pay_model not null default 'cpm',
  add column per_post_paise bigint check (per_post_paise is null or per_post_paise >= 0),
  add column retainer_paise bigint check (retainer_paise is null or retainer_paise >= 0);

alter table public.clips
  add column caption text,
  add column bot_score integer check (bot_score between 0 and 100);

-- Timestamped notes from the reviewer: [{"at_seconds": 3, "note": "Founder not on screen yet"}]
alter table public.reviews
  add column feedback jsonb not null default '[]';

alter table public.social_accounts
  add column verification_requested_at timestamptz;

-- Applications for 'application' campaigns. Approval creates the campaign_members row (team only).
create table public.campaign_applications (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  clipper_id uuid not null references public.clippers(id) on delete cascade,
  note text,
  status public.application_status not null default 'pending',
  decided_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  primary key (campaign_id, clipper_id)
);

-- Test brief: 3 Reel links, scored out of 20 by the network team.
create table public.test_submissions (
  id uuid primary key default gen_random_uuid(),
  clipper_id uuid not null references public.clippers(id) on delete cascade,
  links text[] not null check (array_length(links, 1) between 1 and 3),
  score integer check (score between 0 and 20),
  feedback text,
  reviewed_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.campaign_applications enable row level security;
alter table public.test_submissions enable row level security;

-- Which campaigns a clipper can see:
--   public: live and their tier is allowed, or they're a member
--   application: live and their tier is allowed (so they can apply), or they're a member
--   private: only if they're a member
create or replace function app.clipper_can_see_campaign(campaign uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.campaigns c
     join public.clippers k on k.id = app.my_clipper_id()
     where c.id = campaign
       and k.status = 'active'
       and (
         exists (select 1 from public.campaign_members m where m.campaign_id = c.id and m.clipper_id = k.id)
         or (c.status = 'live' and c.visibility in ('public', 'application') and k.tier = any(c.allowed_tiers))
       )) $$;

-- Clippers can join directly only public campaigns.
drop policy members_self_join on public.campaign_members;
create policy members_self_join on public.campaign_members for insert
  with check (
    clipper_id = app.my_clipper_id()
    and exists (
      select 1 from public.campaigns c join public.clippers k on k.id = app.my_clipper_id()
      where c.id = campaign_members.campaign_id and c.status = 'live' and c.visibility = 'public'
        and k.status = 'active' and k.tier = any(c.allowed_tiers))
  );
create policy members_team_manage on public.campaign_members for all
  using (app.has_role('super_admin','campaign_manager','network_manager'))
  with check (app.has_role('super_admin','campaign_manager','network_manager'));

-- Applications
create policy apps_self_read on public.campaign_applications for select using (clipper_id = app.my_clipper_id());
create policy apps_self_apply on public.campaign_applications for insert
  with check (
    clipper_id = app.my_clipper_id() and status = 'pending'
    and exists (select 1 from public.campaigns c where c.id = campaign_applications.campaign_id and c.visibility = 'application')
    and app.clipper_can_see_campaign(campaign_id)
  );
create policy apps_team_read on public.campaign_applications for select using (app.is_team());
create policy apps_team_decide on public.campaign_applications for update
  using (app.has_role('super_admin','campaign_manager','network_manager'))
  with check (app.has_role('super_admin','campaign_manager','network_manager'));

-- Test submissions: clippers submit and read their own (score and feedback only set by the team)
create policy tests_self_read on public.test_submissions for select
  using (clipper_id = app.my_clipper_id());
create policy tests_self_submit on public.test_submissions for insert
  with check (clipper_id = app.my_clipper_id() and score is null and reviewed_by is null and feedback is null);
create policy tests_team_read on public.test_submissions for select using (app.is_team());
create policy tests_network_review on public.test_submissions for update
  using (app.has_role('super_admin','network_manager')) with check (app.has_role('super_admin','network_manager'));

-- Clippers see only their own reviews' feedback, through a narrow view-like function.
create or replace function public.my_clip_feedback(p_clip uuid)
returns table (decision public.review_decision, reason text, feedback jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as
$$ select r.decision, r.reason, r.feedback, r.created_at
   from public.reviews r join public.clips c on c.id = r.clip_id
   where r.clip_id = p_clip and (c.clipper_id = app.my_clipper_id() or app.is_team())
   order by r.created_at desc $$;

-- Clippers must never verify their own Instagram account or set its audience share.
create or replace function app.guard_social_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for trusted server jobs using the service role.
  if auth.uid() is not null and not app.has_role('super_admin','network_manager') then
    if tg_op = 'INSERT' then
      new.verified_at := null;
      new.audience_india_share := null;
    elsif new.verified_at is distinct from old.verified_at
       or new.audience_india_share is distinct from old.audience_india_share
       or new.handle is distinct from old.handle and old.verified_at is not null then
      raise exception 'Only the network team can verify accounts or change a verified handle';
    end if;
  end if;
  return new;
end $$;
create trigger social_accounts_guard before insert or update on public.social_accounts
  for each row execute function app.guard_social_account();

-- Changing PAN or UPI resets the name-match check so finance re-verifies before the next payout.
create or replace function app.guard_clipper_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for trusted server jobs using the service role.
  if auth.uid() is not null and not app.has_role('super_admin','network_manager') then
    if new.tier is distinct from old.tier
       or new.status is distinct from old.status
       or new.strikes is distinct from old.strikes
       or new.test_brief_score is distinct from old.test_brief_score
       or new.name_match_status is distinct from old.name_match_status then
      raise exception 'Only the network team can change tier, status, strikes, score or name match';
    end if;
    if new.pan_encrypted is distinct from old.pan_encrypted or new.upi_encrypted is distinct from old.upi_encrypted then
      new.name_match_status := 'pending';
    end if;
  end if;
  return new;
end $$;

-- Recording uploads (Insights screen recordings) in a private storage bucket, one folder per clipper.
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('recordings', 'recordings', false) on conflict (id) do nothing;
    execute $p$create policy recordings_own_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = app.my_clipper_id()::text)$p$;
    execute $p$create policy recordings_own_read on storage.objects for select to authenticated
      using (bucket_id = 'recordings' and ((storage.foldername(name))[1] = app.my_clipper_id()::text or app.is_team()))$p$;
  end if;
end $$;

-- New clipper defaults: also skip for trusted server jobs.
create or replace function app.default_new_clipper() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not app.has_role('super_admin','network_manager') then
    new.tier := 'rookie'; new.status := 'applied'; new.strikes := 0;
    new.test_brief_score := null; new.name_match_status := 'pending';
  end if;
  return new;
end $$;

-- Views left in a campaign (target minus paid views so far), for the Crew App campaign cards.
-- Clippers can't read other clippers' clips, so this exposes only the total.
create or replace function public.campaign_views_left(p_campaign uuid) returns integer
language sql stable security definer set search_path = public as
$$ select case when app.is_team() or app.clipper_can_see_campaign(p_campaign) then
     greatest(0, c.view_target - coalesce((select sum(paid_views) from public.clips where campaign_id = c.id and status in ('locked','live_checked')), 0))::integer
   end
   from public.campaigns c where c.id = p_campaign $$;
