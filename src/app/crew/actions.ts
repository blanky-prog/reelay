'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { encrypt, isValidPan, isValidUpi, maskPan, maskUpi } from '@/lib/crypto';
import { checkSubmission, normaliseReelUrl, type SubmissionRejection } from '@/lib/rules';
import { getMe } from '@/lib/session';
import { getMyClipper, LANGUAGES, NICHES } from '@/lib/crew';

function done(path: string, kind: 'ok' | 'err', msg: string): never {
  revalidatePath(path);
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

async function clipperContext() {
  const me = await getMe();
  if (!me || me.role !== 'clipper') redirect('/login');
  const clipper = await getMyClipper(me.id);
  return { me, clipper, sb: await supabaseServer() };
}

export async function saveProfile(form: FormData) {
  const { me, clipper, sb } = await clipperContext();
  const pan = String(form.get('pan') ?? '').trim().toUpperCase();
  const upi = String(form.get('upi') ?? '').trim();
  const city = String(form.get('city') ?? '').trim();
  const niches = form.getAll('niches').map(String).filter((n) => NICHES.includes(n));
  const languages = form.getAll('languages').map(String).filter((l) => LANGUAGES.includes(l));

  if (!city) done('/crew/profile', 'err', 'Add your city.');
  if (!niches.length) done('/crew/profile', 'err', 'Pick at least one niche.');
  if (!clipper && (!pan || !upi)) done('/crew/profile', 'err', 'PAN and UPI ID are needed to pay you.');
  if (pan && !isValidPan(pan)) done('/crew/profile', 'err', 'That PAN does not look right. It should look like ABCDE1234F.');
  if (upi && !isValidUpi(upi)) done('/crew/profile', 'err', 'That UPI ID does not look right. It should look like name@bank.');

  const row: Record<string, unknown> = { city, niches, languages };
  try {
    if (pan) Object.assign(row, { pan_encrypted: encrypt(pan), pan_last4: maskPan(pan) });
    if (upi) Object.assign(row, { upi_encrypted: encrypt(upi), upi_masked: maskUpi(upi) });
  } catch {
    done('/crew/profile', 'err', 'Payments setup is not finished on our side. Please try again later.');
  }

  const { error } = clipper
    ? await sb.from('clippers').update(row).eq('id', clipper.id)
    : await sb.from('clippers').insert({ ...row, user_id: me.id });
  if (error) done('/crew/profile', 'err', 'Could not save your profile. Please try again.');
  done('/crew/profile', 'ok', 'Profile saved.');
}

export async function addAccount(form: FormData) {
  const { clipper, sb } = await clipperContext();
  if (!clipper) done('/crew/accounts', 'err', 'Finish your profile first.');
  const handle = String(form.get('handle') ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) done('/crew/accounts', 'err', 'Enter your Instagram handle, like aarav.cuts');
  const { error } = await sb.from('social_accounts').insert({ clipper_id: clipper.id, handle });
  if (error) done('/crew/accounts', 'err', error.code === '23505' ? 'That account is already registered on Reelay.' : 'Could not add the account.');
  done('/crew/accounts', 'ok', 'Account added. Put the code in your bio, then tap "I\'ve added the code".');
}

export async function requestVerification(form: FormData) {
  const { clipper, sb } = await clipperContext();
  if (!clipper) redirect('/crew/profile');
  const id = String(form.get('id'));
  await sb.from('social_accounts').update({ verification_requested_at: new Date().toISOString() }).eq('id', id).eq('clipper_id', clipper.id);
  done('/crew/accounts', 'ok', 'Thanks. Our team will check your bio within 24 hours. Keep the code there until then.');
}

export async function submitTest(form: FormData) {
  const { clipper, sb } = await clipperContext();
  if (!clipper) done('/crew/test', 'err', 'Finish your profile first.');
  const links = ['l1', 'l2', 'l3'].map((k) => String(form.get(k) ?? '').trim()).filter(Boolean);
  const normalised = links.map(normaliseReelUrl);
  if (links.length !== 3 || normalised.some((l) => !l)) done('/crew/test', 'err', 'Add 3 Instagram Reel links.');
  const { error } = await sb.from('test_submissions').insert({ clipper_id: clipper.id, links: normalised });
  if (error) done('/crew/test', 'err', 'Could not submit your test. Please try again.');
  done('/crew/test', 'ok', 'Test submitted. You will hear back within 48 hours.');
}

export async function joinCampaign(form: FormData) {
  const { clipper, sb } = await clipperContext();
  const campaignId = String(form.get('campaign_id'));
  const path = `/crew/campaigns/${campaignId}`;
  if (!clipper || clipper.status !== 'active') done(path, 'err', 'You can join campaigns once your account is approved.');
  const { error } = await sb.from('campaign_members').insert({ campaign_id: campaignId, clipper_id: clipper.id });
  if (error && error.code !== '23505') done(path, 'err', 'Could not join this campaign.');
  done(path, 'ok', 'You are in. Read the brief, then post and submit your clips.');
}

export async function applyToCampaign(form: FormData) {
  const { clipper, sb } = await clipperContext();
  const campaignId = String(form.get('campaign_id'));
  const path = `/crew/campaigns/${campaignId}`;
  if (!clipper || clipper.status !== 'active') done(path, 'err', 'You can apply once your account is approved.');
  const note = String(form.get('note') ?? '').trim().slice(0, 500);
  const { error } = await sb.from('campaign_applications').insert({ campaign_id: campaignId, clipper_id: clipper.id, note });
  if (error && error.code !== '23505') done(path, 'err', 'Could not send your application.');
  done(path, 'ok', 'Application sent. We will let you know.');
}

const REJECTION_TEXT: Record<SubmissionRejection, string> = {
  duplicate_link: 'This Reel has already been submitted.',
  missing_caption_code: 'Your caption code is missing from the caption. Add it on Instagram and paste the caption again.',
  posted_before_joining: 'This Reel was posted before you joined the campaign.',
  outside_window: 'Reels must be submitted within 48 hours of posting.',
  campaign_not_live: 'This campaign is not open for submissions.',
  not_instagram_reel: 'Paste the link to an Instagram Reel.',
};

export async function submitClip(form: FormData) {
  const { clipper, sb } = await clipperContext();
  const campaignId = String(form.get('campaign_id'));
  const path = `/crew/campaigns/${campaignId}`;
  if (!clipper) done(path, 'err', 'Finish your profile first.');

  const reelUrl = String(form.get('reel_url') ?? '');
  const caption = String(form.get('caption') ?? '');
  const captionCode = String(form.get('caption_code') ?? '');
  const accountId = String(form.get('social_account_id') ?? '');
  const postedRaw = String(form.get('posted_at') ?? '');
  const baseline = Math.max(0, Math.floor(Number(form.get('baseline_views') ?? 0)) || 0);
  // The form's date-time is India time.
  const postedAt = new Date(`${postedRaw}:00+05:30`);
  if (!postedRaw || Number.isNaN(postedAt.getTime())) done(path, 'err', 'Add when you posted the Reel.');

  const [{ data: campaign }, { data: member }] = await Promise.all([
    sb.from('campaigns').select('status').eq('id', campaignId).maybeSingle(),
    sb.from('campaign_members').select('joined_at').eq('campaign_id', campaignId).eq('clipper_id', clipper.id).maybeSingle(),
  ]);
  if (!campaign || !member) done(path, 'err', 'Join the campaign before submitting clips.');

  const rejection = checkSubmission({
    reelUrl, caption, captionCode, postedAt, joinedAt: new Date(member.joined_at), submittedAt: new Date(),
    campaignStatus: campaign.status, existingUrls: new Set(), // duplicates are caught by the database's unique index
  });
  if (rejection) done(path, 'err', REJECTION_TEXT[rejection]);

  const { error } = await sb.from('clips').insert({
    campaign_id: campaignId, clipper_id: clipper.id, social_account_id: accountId,
    reel_url: normaliseReelUrl(reelUrl), caption, caption_code: captionCode.toUpperCase(),
    posted_at: postedAt.toISOString(), baseline_views: baseline,
  });
  if (error) {
    if (error.code === '23505') done(path, 'err', REJECTION_TEXT.duplicate_link);
    done(path, 'err', 'Could not submit. Check that your Instagram account is verified.');
  }
  revalidatePath('/crew/clips');
  done('/crew/clips', 'ok', 'Clip submitted. It is now waiting for review.');
}

export async function saveRecording(form: FormData) {
  const { clipper, sb } = await clipperContext();
  const clipId = String(form.get('clip_id'));
  const path = `/crew/clips/${clipId}`;
  if (!clipper) redirect('/crew/profile');
  const day = Number(form.get('day'));
  const recordingPath = String(form.get('recording_path') ?? '');
  if (![7, 14].includes(day)) done(path, 'err', 'Recordings are for day 7 or day 14.');
  if (!recordingPath.startsWith(`${clipper.id}/`)) done(path, 'err', 'Upload the screen recording first.');
  const num = (k: string) => { const v = Number(form.get(k)); return Number.isFinite(v) && v >= 0 ? v : null; };
  const indiaPct = num('india_pct');
  const { error } = await sb.from('snapshots').insert({
    clip_id: clipId, day,
    insights_views: num('views'), reach: num('reach'), likes: num('likes'), comments: num('comments'),
    shares: num('shares'), saves: num('saves'), avg_watch_seconds: num('avg_watch'),
    india_share: indiaPct === null ? null : Math.min(1, indiaPct / 100),
    recording_url: recordingPath,
  });
  if (error) done(path, 'err', error.code === '23505' ? `You already sent the day ${day} recording.` : 'Could not save the recording.');
  done(path, 'ok', `Day ${day} recording sent. Our team will check it against the public count.`);
}
