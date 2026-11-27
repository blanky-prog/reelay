import { supabaseServer } from './supabase/server';
import type { Tier } from './rules';

export interface MyClipper {
  id: string; tier: Tier; status: 'applied' | 'active' | 'banned'; strikes: number;
  pan_last4: string | null; upi_masked: string | null; name_match_status: string;
  city: string | null; niches: string[]; languages: string[]; test_brief_score: number | null;
}

export async function getMyClipper(userId: string): Promise<MyClipper | null> {
  const sb = await supabaseServer();
  const { data } = await sb.from('clippers')
    .select('id, tier, status, strikes, pan_last4, upi_masked, name_match_status, city, niches, languages, test_brief_score')
    .eq('user_id', userId).maybeSingle();
  return (data as MyClipper) ?? null;
}

export const NICHES = ['Founders and business', 'Money and careers', 'Tech and AI', 'Comedy and entertainment', 'Food', 'Beauty and fashion', 'Fitness and wellness', 'Lifestyle and culture'];
export const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Kannada'];

export const CLIP_STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | '' }> = {
  submitted: { label: 'Waiting for review', tone: '' },
  in_review: { label: 'In review', tone: '' },
  counting: { label: 'Counting views', tone: 'warn' },
  flagged: { label: 'Flagged for checks', tone: 'bad' },
  locked: { label: 'Locked', tone: 'ok' },
  live_checked: { label: 'Fully paid', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  fraud: { label: 'Removed: fraud', tone: 'bad' },
  clawed_back: { label: 'Clawed back', tone: 'bad' },
  campaign_full: { label: 'Campaign full', tone: '' },
};

export const PAYOUT_TYPE: Record<string, string> = { lock_70: 'Lock (70%)', live_check_30: 'Day 30 check (30%)', clawback: 'Clawback' };

export function rateFor(campaign: { rate_rookie_paise: number; rate_runner_paise: number; rate_anchor_paise: number }, tier: Tier) {
  return tier === 'anchor' ? campaign.rate_anchor_paise : tier === 'runner' ? campaign.rate_runner_paise : campaign.rate_rookie_paise;
}

export const daysSincePosted = (postedAt: string) => Math.floor((Date.now() - new Date(postedAt).getTime()) / 86_400_000);
