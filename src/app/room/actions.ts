'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { getMe } from '@/lib/session';
import { TEAM_ROLES, type Role } from '@/lib/roles';
import { botScore, fraudFlags, DEFAULT_SETTINGS, type TimestampedNote } from '@/lib/rules';

function done(path: string, kind: 'ok' | 'err', msg: string): never {
  revalidatePath(path);
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}${kind}=${encodeURIComponent(msg)}`);
}

async function team() {
  const me = await getMe();
  if (!me || !TEAM_ROLES.includes(me.role)) redirect('/login');
  return { me, sb: await supabaseServer() };
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const int = (f: FormData, k: string) => { const n = Math.round(Number(f.get(k))); return Number.isFinite(n) ? n : null; };
/** Rupees in a form, to paise. */
const paise = (f: FormData, k: string) => { const v = str(f, k); if (!v) return null; const n = Math.round(Number(v) * 100); return Number.isFinite(n) && n >= 0 ? n : null; };

// ---------- Clippers ----------

export async function setClipper(form: FormData) {
  const { sb } = await team();
  const id = str(form, 'id');
  const path = `/room/clippers/${id}`;
  const patch: Record<string, unknown> = {};
  for (const k of ['status', 'tier', 'name_match_status'] as const) { const v = str(form, k); if (v) patch[k] = v; }
  const { error, count } = await sb.from('clippers').update(patch, { count: 'exact' }).eq('id', id);
  if (error || !count) done(path, 'err', 'Not saved. Only the network team can change clippers.');
  done(path, 'ok', 'Clipper updated.');
}

export async function scoreTest(form: FormData) {
  const { me, sb } = await team();
  const id = str(form, 'id');
  const clipperId = str(form, 'clipper_id');
  const path = `/room/clippers/${clipperId}`;
  const score = int(form, 'score');
  if (score == null || score < 0 || score > 20) done(path, 'err', 'Score must be 0 to 20.');
  const feedback = str(form, 'feedback').slice(0, 1000) || null;
  const { error } = await sb.from('test_submissions').update({ score, feedback, reviewed_by: me.id }).eq('id', id);
  if (error) done(path, 'err', 'Not saved. Only the network team can score tests.');
  await sb.from('clippers').update({ test_brief_score: score }).eq('id', clipperId);
  done(path, 'ok', score >= 14 ? `Passed with ${score}/20. Approve the clipper when ready.` : `Scored ${score}/20. They can resubmit.`);
}

export async function verifyAccount(form: FormData) {
  const { sb } = await team();
  const id = str(form, 'id');
  const back = str(form, 'back') || '/room/clippers?view=accounts';
  const india = int(form, 'india_pct');
  const approve = str(form, 'decision') === 'approve';
  const patch = approve
    ? { verified_at: new Date().toISOString(), audience_india_share: india == null ? null : Math.min(100, Math.max(0, india)) / 100 }
    : { verification_requested_at: null };
  const { error, count } = await sb.from('social_accounts').update(patch, { count: 'exact' }).eq('id', id);
  if (error || !count) done(back, 'err', 'Not saved. Only the network team can verify accounts.');
  done(back, 'ok', approve ? 'Account verified.' : 'Sent back. The clipper can request a check again.');
}

export async function strike(form: FormData) {
  const { sb } = await team();
  const id = str(form, 'id');
  const ban = str(form, 'ban') === '1';
  const back = str(form, 'back') || `/room/clippers/${id}`;
  const { error } = await sb.rpc('add_strike', { p_clipper: id, p_ban: ban });
  if (error) done(back, 'err', 'Could not add the strike.');
  done(back, 'ok', ban ? 'Clipper banned.' : 'Strike added. Three strikes bans automatically.');
}

// ---------- People and clients ----------

export async function setPerson(form: FormData) {
  const { me, sb } = await team();
  if (me.role !== 'super_admin') done('/room/people', 'err', 'Only the super admin can change roles.');
  const email = str(form, 'email').toLowerCase();
  const role = str(form, 'role') as Role;
  const org = str(form, 'organisation_id') || null;
  if (email === me.email.toLowerCase() && role !== 'super_admin') done('/room/people', 'err', 'You cannot remove your own super admin role.');
  const { error, count } = await sb.from('users').update({ role, organisation_id: org }, { count: 'exact' }).ilike('email', email);
  if (error) done('/room/people', 'err', 'Could not save.');
  if (!count) done('/room/people', 'err', 'No account with that email. Ask them to sign up first.');
  done('/room/people', 'ok', `${email} is now ${role.replace('_', ' ')}.`);
}

export async function addClient(form: FormData) {
  const { sb } = await team();
  const name = str(form, 'name');
  if (!name) done('/room/clients', 'err', 'Add the brand name.');
  const { error } = await sb.from('organisations').insert({ name, type: 'client', gst_number: str(form, 'gst') || null, billing_address: str(form, 'address') || null });
  if (error) done('/room/clients', 'err', 'Could not add the client.');
  done('/room/clients', 'ok', `${name} added.`);
}

// ---------- Campaigns ----------

function campaignFields(form: FormData) {
  const tiers = form.getAll('allowed_tiers').map(String).filter((t) => ['rookie', 'runner', 'anchor'].includes(t));
  return {
    name: str(form, 'name'),
    organisation_id: str(form, 'organisation_id'),
    package: str(form, 'package') || 'custom',
    view_target: int(form, 'view_target') ?? 0,
    revenue_paise: paise(form, 'revenue') ?? 0,
    start_date: str(form, 'start_date') || null,
    end_date: str(form, 'end_date') || null,
    visibility: str(form, 'visibility') || 'public',
    pay_model: str(form, 'pay_model') || 'cpm',
    per_post_paise: paise(form, 'per_post'),
    retainer_paise: paise(form, 'retainer'),
    rate_rookie_paise: paise(form, 'rate_rookie') ?? DEFAULT_RATES.rookie,
    rate_runner_paise: paise(form, 'rate_runner') ?? DEFAULT_RATES.runner,
    rate_anchor_paise: paise(form, 'rate_anchor') ?? DEFAULT_RATES.anchor,
    per_clip_cap_views: int(form, 'per_clip_cap') ?? DEFAULT_SETTINGS.perClipCapViews,
    allowed_tiers: tiers.length ? tiers : ['rookie', 'runner', 'anchor'],
  };
}
const DEFAULT_RATES = { rookie: 2000, runner: 2500, anchor: 3000 };

export async function createCampaign(form: FormData) {
  const { me, sb } = await team();
  const f = campaignFields(form);
  if (!f.name || !f.organisation_id || f.view_target <= 0) done('/room/campaigns/new', 'err', 'Name, client and view target are needed.');
  const { data, error } = await sb.from('campaigns').insert({ ...f, status: 'draft', created_by: me.id }).select('id').single();
  if (error || !data) done('/room/campaigns/new', 'err', 'Could not create the campaign. Only campaign managers can.');
  done(`/room/campaigns/${data.id}`, 'ok', 'Campaign created as a draft. Add the brief, then set it live.');
}

export async function updateCampaign(form: FormData) {
  const { sb } = await team();
  const id = str(form, 'id');
  const path = `/room/campaigns/${id}`;
  const f = campaignFields(form);
  const status = str(form, 'status');
  const { error } = await sb.from('campaigns').update({ ...f, ...(status ? { status } : {}) }).eq('id', id);
  if (error) done(path, 'err', 'Could not save the campaign.');
  done(path, 'ok', 'Campaign saved.');
}

export async function saveBrief(form: FormData) {
  const { sb } = await team();
  const id = str(form, 'campaign_id');
  const path = `/room/campaigns/${id}`;
  const { data: last } = await sb.from('briefs').select('version').eq('campaign_id', id).order('version', { ascending: false }).limit(1);
  const version = (last?.[0]?.version ?? 0) + 1;
  const { error } = await sb.from('briefs').insert({
    campaign_id: id, version,
    instructions: str(form, 'instructions'),
    banned_claims: str(form, 'banned_claims').split(',').map((s) => s.trim()).filter(Boolean),
    music_rules: str(form, 'music_rules') || null,
    cta: str(form, 'cta') || null,
  });
  if (error) done(path, 'err', 'Could not save the brief.');
  done(path, 'ok', `Brief version ${version} saved.`);
}

export async function addSourceFile(form: FormData) {
  const { sb } = await team();
  const id = str(form, 'campaign_id');
  const path = `/room/campaigns/${id}`;
  const url = str(form, 'file_url');
  if (!/^https?:\/\//.test(url)) done(path, 'err', 'Paste a full link, like a Google Drive link.');
  const { error } = await sb.from('source_files').insert({ campaign_id: id, file_url: url, type: str(form, 'type') === 'lead_clip' ? 'lead_clip' : 'raw' });
  if (error) done(path, 'err', 'Could not add the file.');
  done(path, 'ok', 'File added.');
}

export async function decideApplication(form: FormData) {
  const { me, sb } = await team();
  const campaignId = str(form, 'campaign_id');
  const clipperId = str(form, 'clipper_id');
  const approve = str(form, 'decision') === 'approve';
  const path = `/room/campaigns/${campaignId}`;
  const { error } = await sb.from('campaign_applications').update({ status: approve ? 'approved' : 'declined', decided_by: me.id }).eq('campaign_id', campaignId).eq('clipper_id', clipperId);
  if (error) done(path, 'err', 'Could not save the decision.');
  if (approve) await sb.from('campaign_members').upsert({ campaign_id: campaignId, clipper_id: clipperId });
  done(path, 'ok', approve ? 'Approved. They can now submit clips.' : 'Declined.');
}

export async function inviteClipper(form: FormData) {
  const { sb } = await team();
  const campaignId = str(form, 'campaign_id');
  const path = `/room/campaigns/${campaignId}`;
  const handle = str(form, 'handle').replace(/^@/, '').toLowerCase();
  const { data: acct } = await sb.from('social_accounts').select('clipper_id').eq('handle', handle).maybeSingle();
  if (!acct) done(path, 'err', `No clipper with the Instagram handle @${handle}.`);
  const { error } = await sb.from('campaign_members').upsert({ campaign_id: campaignId, clipper_id: acct.clipper_id });
  if (error) done(path, 'err', 'Could not add them.');
  done(path, 'ok', `@${handle} added to the campaign.`);
}

export async function addPromoCode(form: FormData) {
  const { sb } = await team();
  const campaignId = str(form, 'campaign_id');
  const path = `/room/campaigns/${campaignId}`;
  const code = str(form, 'code').toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) done(path, 'err', 'Codes are 3 to 30 letters or numbers.');
  const { error } = await sb.from('promo_codes').insert({ campaign_id: campaignId, code });
  if (error) done(path, 'err', error.code === '23505' ? 'That code already exists on this campaign.' : 'Could not add the code.');
  done(path, 'ok', `Code ${code} added.`);
}

// ---------- QA ----------

export async function reviewClip(form: FormData) {
  const { me, sb } = await team();
  const id = str(form, 'id');
  const decision = str(form, 'decision') as 'approved' | 'rejected' | 'flagged';
  const reason = str(form, 'reason').slice(0, 500) || null;
  const checklist = Object.fromEntries(['speaker_first_3s', 'no_banned_claims', 'original_edit', 'no_copyright_music'].map((k) => [k, form.get(k) === 'on']));
  const feedback: TimestampedNote[] = [0, 1, 2].map((i) => ({ at: str(form, `t${i}`), note: str(form, `n${i}`) }))
    .filter((x) => x.note).map((x) => {
      const [m, s] = x.at.includes(':') ? x.at.split(':').map(Number) : [0, Number(x.at)];
      return { at_seconds: Math.max(0, (m || 0) * 60 + (s || 0)), note: x.note.slice(0, 200) };
    });

  if (decision === 'approved' && Object.values(checklist).some((v) => !v)) done('/room/qa', 'err', 'Tick all four checks before approving.');
  if (decision === 'rejected' && !reason && !feedback.length) done('/room/qa', 'err', 'Give the clipper a reason when rejecting.');

  const { error: rErr } = await sb.from('reviews').insert({ clip_id: id, reviewer_id: me.id, decision, checklist, reason, feedback });
  if (rErr) done('/room/qa', 'err', 'Could not save the review. Only QA reviewers can review clips.');
  const patch = decision === 'approved' ? { status: 'counting' }
    : decision === 'rejected' ? { status: 'rejected', reject_reason: reason ?? feedback.map((f) => f.note).join('; ') }
    : { status: 'flagged', flag_reason: reason ?? 'Flagged by QA' };
  await sb.from('clips').update(patch).eq('id', id);
  if (decision === 'flagged') await sb.from('flags').insert({ clip_id: id, rule: 'qa_manual', status: 'open' });
  done('/room/qa', 'ok', decision === 'approved' ? 'Approved. Views are now being tracked.' : decision === 'rejected' ? 'Rejected. The clipper sees your notes.' : 'Flagged for checks.');
}

/** QA enters the public view count it sees on Instagram for a day 7 or day 14 recording; fraud rules run. */
export async function checkSnapshot(form: FormData) {
  const { me, sb } = await team();
  const id = str(form, 'id');
  const publicViews = int(form, 'public_views');
  if (publicViews == null || publicViews < 0) done('/room/verify', 'err', 'Enter the view count shown on Instagram.');
  const { data: snap } = await sb.from('snapshots').select('clip_id, insights_views, reach, likes, avg_watch_seconds, india_share').eq('id', id).single();
  if (!snap) done('/room/verify', 'err', 'Snapshot not found.');
  const { error } = await sb.from('snapshots').update({ public_views: publicViews, entered_by: me.id }).eq('id', id);
  if (error) done('/room/verify', 'err', 'Could not save. Only QA reviewers can verify views.');

  // Trust the lower of the clipper's Insights number and the public count.
  const views = Math.min(publicViews, snap.insights_views ?? publicViews);
  const metrics = { views, reach: snap.reach ?? undefined, likes: snap.likes ?? undefined, avgWatchSeconds: snap.avg_watch_seconds ?? undefined, indiaShare: snap.india_share ?? undefined };
  const flags = fraudFlags(metrics);
  const gap = snap.insights_views && publicViews ? Math.abs(snap.insights_views - publicViews) / Math.max(snap.insights_views, publicViews) : 0;
  if (gap > 0.15) flags.push({ rule: 'views_vs_reach', value: Math.round(gap * 100), threshold: 15 });
  const score = botScore(metrics);
  await sb.from('clips').update({ bot_score: score, india_share: snap.india_share }).eq('id', snap.clip_id);
  if (flags.length) {
    await sb.from('flags').insert(flags.map((f) => ({ clip_id: snap.clip_id, rule: f.rule, value: f.value, threshold: f.threshold })));
    await sb.from('clips').update({ status: 'flagged', flag_reason: flags.map((f) => labelFlag(f.rule, f.value)).join(' · ') }).eq('id', snap.clip_id).in('status', ['counting']);
    done('/room/verify', 'ok', `Saved. ${flags.length} fraud rule(s) tripped, clip sent to Flags. Bot score ${score}.`);
  }
  done('/room/verify', 'ok', `Saved. No fraud signals. Bot score ${score}.`);
}

function labelFlag(rule: string, v: number) {
  return ({ like_rate: `Like rate ${v}%`, watch_time: `Avg watch ${v}s`, india_share: `India share ${v}%`, spike: `${v}% of views in 6 hours`, views_vs_reach: `Numbers don't match (${v})` } as Record<string, string>)[rule] ?? rule;
}

export async function decideFlag(form: FormData) {
  const { me, sb } = await team();
  const clipId = str(form, 'clip_id');
  const fraud = str(form, 'decision') === 'fraud';
  const { error } = await sb.from('flags').update({ status: fraud ? 'fraud' : 'cleared', decided_by: me.id, decided_at: new Date().toISOString() }).eq('clip_id', clipId).eq('status', 'open');
  if (error) done('/room/flags', 'err', 'Could not save. Only QA reviewers can decide flags.');
  if (fraud) {
    const { data: clip } = await sb.from('clips').select('clipper_id').eq('id', clipId).single();
    await sb.from('clips').update({ status: 'fraud', flag_reason: 'Confirmed fake activity' }).eq('id', clipId);
    if (clip) await sb.rpc('add_strike', { p_clipper: clip.clipper_id, p_ban: true });
    done('/room/flags', 'ok', 'Confirmed fraud. Clip removed and clipper banned.');
  }
  await sb.from('clips').update({ status: 'counting', flag_reason: null }).eq('id', clipId);
  done('/room/flags', 'ok', 'Flag cleared. The clip is counting again.');
}
