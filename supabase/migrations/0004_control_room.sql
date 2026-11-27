-- Milestone 3: Control Room helpers.

-- The guard on clippers blocks everyone except network managers and super admins.
-- add_strike (below) is the one trusted path for QA: it marks the transaction so the guard lets it through.
-- QA reviewers can give strikes and confirm fraud, but can never change a clipper's tier or anything else.
create or replace function app.guard_clipper_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('reelay.trusted_strike', true) = 'on' then
    return new;
  end if;
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

create or replace function public.add_strike(p_clipper uuid, p_ban boolean default false)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_strikes integer;
begin
  if not app.has_role('super_admin', 'qa_reviewer', 'network_manager') then
    raise exception 'Only the QA or network team can give strikes';
  end if;
  perform set_config('reelay.trusted_strike', 'on', true);
  update public.clippers
     set strikes = strikes + 1,
         status = case when p_ban or strikes + 1 >= 3 then 'banned'::public.clipper_status else status end
   where id = p_clipper
  returning strikes into v_strikes;
  perform set_config('reelay.trusted_strike', 'off', true);
  insert into public.audit_log (actor_id, action, object_type, object_id, after)
  values (auth.uid(), case when p_ban then 'ban' else 'strike' end, 'clippers', p_clipper::text, jsonb_build_object('strikes', v_strikes));
  return v_strikes;
end $$;

-- Team members can read a clipper's account handles and test results through RLS already.
-- This summary feeds the Control Room home page in one call.
create or replace function public.control_room_counts()
returns table (live_campaigns bigint, qa_queue bigint, open_flags bigint, accounts_to_verify bigint, tests_to_score bigint, clippers_applied bigint, snapshots_to_check bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.campaigns where status = 'live'),
    (select count(*) from public.clips where status in ('submitted','in_review')),
    (select count(*) from public.flags where status = 'open'),
    (select count(*) from public.social_accounts where verified_at is null and verification_requested_at is not null),
    (select count(*) from public.test_submissions where score is null),
    (select count(*) from public.clippers where status = 'applied'),
    (select count(*) from public.snapshots where public_views is null and day in (7, 14))
  where app.is_team()
$$;
