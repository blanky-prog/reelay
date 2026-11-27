// Reelay business rules. Pure functions, no I/O, so they are easy to test.
// Money is always in paise (integers). Views are integers.

export type Tier = 'rookie' | 'runner' | 'anchor';

export interface Settings {
  minViews: number;            // 10,000
  lockDay: number;             // 14
  liveCheckDay: number;        // 30
  liveCheckMaxDropPct: number; // 10
  lockSharePct: number;        // 70 (the rest is paid after the live check)
  minPayoutPaise: number;      // 50,000 = Rs 500
  perClipCapViews: number;     // 5,00,000
  submissionWindowHours: number; // 48
  flagLikeRatePct: number;     // 0.5
  flagWatchSeconds: number;    // 2
  flagIndiaSharePct: number;   // 70
  flagSpikePct: number;        // 60
}

export const DEFAULT_SETTINGS: Settings = {
  minViews: 10_000,
  lockDay: 14,
  liveCheckDay: 30,
  liveCheckMaxDropPct: 10,
  lockSharePct: 70,
  minPayoutPaise: 50_000,
  perClipCapViews: 500_000,
  submissionWindowHours: 48,
  flagLikeRatePct: 0.5,
  flagWatchSeconds: 2,
  flagIndiaSharePct: 70,
  flagSpikePct: 60,
};

export type RatesPaise = Record<Tier, number>; // paise per 1,000 verified views

const DAY_MS = 86_400_000;
export const daysSince = (from: Date, now: Date) => Math.floor((now.getTime() - from.getTime()) / DAY_MS);

/** Paid views = min(locked views x India share, per-clip cap), and zero below the minimum. */
export function paidViews(lockedViews: number, indiaShare: number, s: Settings = DEFAULT_SETTINGS, perClipCap = s.perClipCapViews): number {
  if (!Number.isFinite(lockedViews) || lockedViews < s.minViews) return 0;
  const share = Math.min(1, Math.max(0, indiaShare));
  return Math.min(Math.floor(lockedViews * share), perClipCap);
}

/** Total earnings for a clip, in paise, rounded down to the paisa. */
export function clipEarningsPaise(paid: number, ratePaisePer1000: number): number {
  return Math.floor((paid * ratePaisePer1000) / 1000);
}

/** Split into the lock payment and the live-check payment. The two always add up to the total. */
export function splitPayout(totalPaise: number, s: Settings = DEFAULT_SETTINGS) {
  const lock = Math.floor((totalPaise * s.lockSharePct) / 100);
  return { lockPaise: lock, liveCheckPaise: totalPaise - lock };
}

/** Campaign cap: a clip can only take what is left of the view target. */
export function capToCampaign(paid: number, alreadyPaidViews: number, viewTarget: number) {
  const remaining = Math.max(0, viewTarget - alreadyPaidViews);
  const granted = Math.min(paid, remaining);
  return { granted, campaignFull: alreadyPaidViews + granted >= viewTarget };
}

export interface SnapshotMetrics {
  views: number;
  reach?: number;
  likes?: number;
  avgWatchSeconds?: number;
  indiaShare?: number;
  /** Share of views (0 to 1) that arrived in the busiest 6-hour window. */
  peakSixHourShare?: number;
}

export interface Flag { rule: 'like_rate' | 'watch_time' | 'india_share' | 'spike' | 'views_vs_reach'; value: number; threshold: number }

/** Fraud rules. Any flag sends the clip to manual review; none of them decide fraud on their own. */
export function fraudFlags(m: SnapshotMetrics, s: Settings = DEFAULT_SETTINGS): Flag[] {
  const flags: Flag[] = [];
  if (m.views > 0 && m.likes !== undefined) {
    const likeRate = (m.likes / m.views) * 100;
    if (likeRate < s.flagLikeRatePct) flags.push({ rule: 'like_rate', value: round2(likeRate), threshold: s.flagLikeRatePct });
  }
  if (m.avgWatchSeconds !== undefined && m.avgWatchSeconds < s.flagWatchSeconds) {
    flags.push({ rule: 'watch_time', value: m.avgWatchSeconds, threshold: s.flagWatchSeconds });
  }
  if (m.indiaShare !== undefined && m.indiaShare * 100 < s.flagIndiaSharePct) {
    flags.push({ rule: 'india_share', value: round2(m.indiaShare * 100), threshold: s.flagIndiaSharePct });
  }
  if (m.peakSixHourShare !== undefined && m.peakSixHourShare * 100 > s.flagSpikePct) {
    flags.push({ rule: 'spike', value: round2(m.peakSixHourShare * 100), threshold: s.flagSpikePct });
  }
  // Views far above reach usually means looped or bought plays.
  if (m.reach !== undefined && m.reach > 0 && m.views / m.reach > 4) {
    flags.push({ rule: 'views_vs_reach', value: round2(m.views / m.reach), threshold: 4 });
  }
  return flags;
}

/**
 * Bot score, 0 (looks real) to 100 (almost certainly fake), from the same signals as the fraud flags.
 * Each signal adds points in proportion to how far past its threshold it is. Shown in QA and ProofCount;
 * it never decides fraud on its own.
 */
export function botScore(m: SnapshotMetrics, s: Settings = DEFAULT_SETTINGS): number {
  let score = 0;
  const over = (ratio: number, weight: number) => { score += Math.min(1, Math.max(0, ratio)) * weight; };
  if (m.views > 0 && m.likes !== undefined) {
    const likeRate = (m.likes / m.views) * 100;
    over((s.flagLikeRatePct - likeRate) / s.flagLikeRatePct, 25);
  }
  if (m.avgWatchSeconds !== undefined) over((s.flagWatchSeconds - m.avgWatchSeconds) / s.flagWatchSeconds, 25);
  if (m.indiaShare !== undefined) over((s.flagIndiaSharePct - m.indiaShare * 100) / s.flagIndiaSharePct, 15);
  if (m.peakSixHourShare !== undefined) over((m.peakSixHourShare * 100 - s.flagSpikePct) / (100 - s.flagSpikePct), 20);
  if (m.reach !== undefined && m.reach > 0) over((m.views / m.reach - 4) / 4, 15);
  return Math.round(score);
}

export interface TimestampedNote { at_seconds: number; note: string }

/** "0:03, founder not on screen yet" */
export const formatNote = (n: TimestampedNote) =>
  `${Math.floor(n.at_seconds / 60)}:${String(Math.floor(n.at_seconds % 60)).padStart(2, '0')}, ${n.note}`;

/** What a clip earns under each pay model, in paise. Per-post pays once on approval; retainer is paid monthly outside clips. */
export function earningsForPayModel(model: 'cpm' | 'per_post' | 'retainer', input: { paidViews: number; ratePaisePer1000: number; perPostPaise?: number | null }): number {
  if (model === 'cpm') return clipEarningsPaise(input.paidViews, input.ratePaisePer1000);
  if (model === 'per_post') return input.perPostPaise ?? 0;
  return 0;
}

export type SubmissionRejection = 'duplicate_link' | 'missing_caption_code' | 'posted_before_joining' | 'outside_window' | 'campaign_not_live' | 'not_instagram_reel';

/** Checks run the moment a clip is submitted. Returns the first reason to reject, or null. */
export function checkSubmission(input: {
  reelUrl: string;
  caption: string;
  captionCode: string;
  postedAt: Date;
  joinedAt: Date;
  submittedAt: Date;
  campaignStatus: 'draft' | 'live' | 'full' | 'closed';
  existingUrls: Set<string>;
}, s: Settings = DEFAULT_SETTINGS): SubmissionRejection | null {
  if (input.campaignStatus !== 'live') return 'campaign_not_live';
  const url = normaliseReelUrl(input.reelUrl);
  if (!url) return 'not_instagram_reel';
  if (input.existingUrls.has(url)) return 'duplicate_link';
  if (!input.caption.toUpperCase().includes(input.captionCode.toUpperCase())) return 'missing_caption_code';
  if (input.postedAt.getTime() < input.joinedAt.getTime()) return 'posted_before_joining';
  if (input.submittedAt.getTime() - input.postedAt.getTime() > s.submissionWindowHours * 3_600_000) return 'outside_window';
  return null;
}

/** instagram.com/reel/ABC123 in a single canonical form, or null if it isn't a Reel or post link. */
export function normaliseReelUrl(raw: string): string | null {
  const m = raw.trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reels?|p)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  return `instagram.com/reel/${m[2]}`;
}

/** Unique, readable code like RLY-7Q4K9. Avoids look-alike characters. */
export function captionCode(random: () => number = Math.random): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let out = 'RLY-';
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}

export type LiveCheckOutcome = { result: 'pass'; releasePaise: number } | { result: 'clawback'; clawbackPaise: number; reason: 'deleted' | 'views_dropped' };

/** Day 30: the clip must still be live and must not have lost more than the allowed share of its locked views. */
export function liveCheck(input: { isLive: boolean; lockedViews: number; currentViews: number; lockPaidPaise: number; liveCheckPaise: number }, s: Settings = DEFAULT_SETTINGS): LiveCheckOutcome {
  if (!input.isLive) return { result: 'clawback', clawbackPaise: -input.lockPaidPaise, reason: 'deleted' };
  const dropPct = input.lockedViews > 0 ? ((input.lockedViews - input.currentViews) / input.lockedViews) * 100 : 0;
  if (dropPct > s.liveCheckMaxDropPct) return { result: 'clawback', clawbackPaise: -input.lockPaidPaise, reason: 'views_dropped' };
  return { result: 'pass', releasePaise: input.liveCheckPaise };
}

export interface PayoutItem { id: string; clipperId: string; amountPaise: number; status: 'pending' | 'in_run' | 'paid' | 'cancelled' }

/** Friday run: net each clipper's pending items (clawbacks included); balances under the minimum roll over. */
export function buildPayoutRun(items: PayoutItem[], s: Settings = DEFAULT_SETTINGS) {
  const byClipper = new Map<string, PayoutItem[]>();
  for (const i of items) {
    if (i.status !== 'pending') continue;
    const list = byClipper.get(i.clipperId) ?? [];
    list.push(i);
    byClipper.set(i.clipperId, list);
  }
  const lines: { clipperId: string; amountPaise: number; itemIds: string[] }[] = [];
  const rolledOver: { clipperId: string; amountPaise: number }[] = [];
  for (const [clipperId, list] of byClipper) {
    const net = list.reduce((a, i) => a + i.amountPaise, 0);
    if (net >= s.minPayoutPaise) lines.push({ clipperId, amountPaise: net, itemIds: list.map((i) => i.id) });
    else rolledOver.push({ clipperId, amountPaise: net });
  }
  lines.sort((a, b) => b.amountPaise - a.amountPaise);
  return { lines, rolledOver, totalPaise: lines.reduce((a, l) => a + l.amountPaise, 0) };
}

/** Whole-clip lock: everything that happens on day 14, in one place. */
export function lockClip(input: {
  lockedViews: number; indiaShare: number; tier: Tier; rates: RatesPaise;
  alreadyPaidViews: number; viewTarget: number; perClipCap?: number;
}, s: Settings = DEFAULT_SETTINGS) {
  const eligible = paidViews(input.lockedViews, input.indiaShare, s, input.perClipCap ?? s.perClipCapViews);
  const { granted, campaignFull } = capToCampaign(eligible, input.alreadyPaidViews, input.viewTarget);
  const total = clipEarningsPaise(granted, input.rates[input.tier]);
  const { lockPaise, liveCheckPaise } = splitPayout(total, s);
  return { paidViews: granted, totalPaise: total, lockPaise, liveCheckPaise, campaignFull };
}

export const formatInr = (paise: number) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 });

function round2(n: number) { return Math.round(n * 100) / 100; }
