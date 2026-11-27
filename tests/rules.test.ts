import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS as S, botScore, buildPayoutRun, earningsForPayModel, formatNote, capToCampaign, captionCode, checkSubmission, clipEarningsPaise,
  formatInr, fraudFlags, liveCheck, lockClip, normaliseReelUrl, paidViews, splitPayout,
} from '../src/lib/rules';

const rates = { rookie: 2000, runner: 2500, anchor: 3000 };

describe('paid views', () => {
  it('earns nothing below the minimum', () => expect(paidViews(9_999, 1)).toBe(0));
  it('counts only the India share', () => expect(paidViews(100_000, 0.9)).toBe(90_000));
  it('stops at the per-clip cap', () => expect(paidViews(2_000_000, 0.95)).toBe(500_000));
  it('clamps silly India shares', () => expect(paidViews(20_000, 1.4)).toBe(20_000));
});

describe('earnings and split', () => {
  it('pays per 1,000 views in paise', () => expect(clipEarningsPaise(90_000, 2500)).toBe(225_000)); // Rs 2,250
  it('70/30 split always adds back up', () => {
    for (const total of [0, 1, 99, 225_000, 333_333]) {
      const { lockPaise, liveCheckPaise } = splitPayout(total);
      expect(lockPaise + liveCheckPaise).toBe(total);
    }
  });
  it('formats rupees', () => expect(formatInr(225_000)).toBe('₹2,250'));
});

describe('campaign cap', () => {
  it('grants only what is left of the target', () => {
    expect(capToCampaign(200_000, 2_900_000, 3_000_000)).toEqual({ granted: 100_000, campaignFull: true });
  });
  it('grants nothing once full', () => expect(capToCampaign(50_000, 3_000_000, 3_000_000).granted).toBe(0));
});

describe('lock on day 14', () => {
  it('works out views, total and split together', () => {
    const r = lockClip({ lockedViews: 312_000, indiaShare: 0.94, tier: 'anchor', rates, alreadyPaidViews: 0, viewTarget: 3_000_000 });
    expect(r.paidViews).toBe(293_280);
    expect(r.totalPaise).toBe(879_840);
    expect(r.lockPaise + r.liveCheckPaise).toBe(r.totalPaise);
    expect(r.campaignFull).toBe(false);
  });
  it('respects a campaign-specific per-clip cap', () => {
    const r = lockClip({ lockedViews: 400_000, indiaShare: 1, tier: 'rookie', rates, alreadyPaidViews: 0, viewTarget: 3_000_000, perClipCap: 100_000 });
    expect(r.paidViews).toBe(100_000);
  });
});

describe('fraud flags', () => {
  it('clean clip raises nothing', () => {
    expect(fraudFlags({ views: 100_000, reach: 80_000, likes: 5_000, avgWatchSeconds: 7, indiaShare: 0.93, peakSixHourShare: 0.2 })).toEqual([]);
  });
  it('bought views raise several flags', () => {
    const rules = fraudFlags({ views: 90_000, reach: 15_000, likes: 200, avgWatchSeconds: 1.3, indiaShare: 0.41, peakSixHourShare: 0.96 }).map((f) => f.rule);
    expect(rules).toEqual(['like_rate', 'watch_time', 'india_share', 'spike', 'views_vs_reach']);
  });
});

describe('submission checks', () => {
  const base = {
    reelUrl: 'https://www.instagram.com/reel/Cx12_ab/?igsh=xyz',
    caption: 'Founder story RLY-7Q4K9 #ad',
    captionCode: 'RLY-7Q4K9',
    postedAt: new Date('2026-11-20T10:00:00Z'),
    joinedAt: new Date('2026-11-19T10:00:00Z'),
    submittedAt: new Date('2026-11-21T09:00:00Z'),
    campaignStatus: 'live' as const,
    existingUrls: new Set<string>(),
  };
  it('accepts a good submission', () => expect(checkSubmission(base)).toBeNull());
  it('rejects duplicates in any URL form', () => {
    expect(checkSubmission({ ...base, existingUrls: new Set([normaliseReelUrl('instagram.com/reels/Cx12_ab')!]) })).toBe('duplicate_link');
  });
  it('rejects a missing caption code', () => expect(checkSubmission({ ...base, caption: 'no code' })).toBe('missing_caption_code'));
  it('rejects old posts', () => expect(checkSubmission({ ...base, postedAt: new Date('2026-11-18T10:00:00Z') })).toBe('posted_before_joining'));
  it('rejects late submissions', () => expect(checkSubmission({ ...base, submittedAt: new Date('2026-11-23T11:00:00Z') })).toBe('outside_window'));
  it('rejects when the campaign is full', () => expect(checkSubmission({ ...base, campaignStatus: 'full' })).toBe('campaign_not_live'));
  it('rejects non-Instagram links', () => expect(checkSubmission({ ...base, reelUrl: 'https://youtube.com/shorts/abc' })).toBe('not_instagram_reel'));
});

describe('live check on day 30', () => {
  it('releases the 30% when the clip is fine', () => {
    expect(liveCheck({ isLive: true, lockedViews: 100_000, currentViews: 95_000, lockPaidPaise: 70_000, liveCheckPaise: 30_000 })).toEqual({ result: 'pass', releasePaise: 30_000 });
  });
  it('claws back the 70% if the clip was deleted', () => {
    expect(liveCheck({ isLive: false, lockedViews: 100_000, currentViews: 0, lockPaidPaise: 70_000, liveCheckPaise: 30_000 })).toEqual({ result: 'clawback', clawbackPaise: -70_000, reason: 'deleted' });
  });
  it('claws back if views dropped more than 10%', () => {
    expect(liveCheck({ isLive: true, lockedViews: 100_000, currentViews: 85_000, lockPaidPaise: 70_000, liveCheckPaise: 30_000 })).toMatchObject({ result: 'clawback', reason: 'views_dropped' });
  });
});

describe('Friday payout run', () => {
  it('nets clawbacks and rolls over small balances, to the paisa', () => {
    const run = buildPayoutRun([
      { id: 'a1', clipperId: 'A', amountPaise: 615_888, status: 'pending' },
      { id: 'a2', clipperId: 'A', amountPaise: -70_000, status: 'pending' },
      { id: 'b1', clipperId: 'B', amountPaise: 40_000, status: 'pending' },
      { id: 'c1', clipperId: 'C', amountPaise: 90_000, status: 'paid' },
    ]);
    expect(run.lines).toEqual([{ clipperId: 'A', amountPaise: 545_888, itemIds: ['a1', 'a2'] }]);
    expect(run.rolledOver).toEqual([{ clipperId: 'B', amountPaise: 40_000 }]);
    expect(run.totalPaise).toBe(545_888);
  });
});

describe('caption codes', () => {
  it('look like RLY-XXXXX without confusing characters', () => {
    for (let i = 0; i < 200; i++) expect(captionCode()).toMatch(/^RLY-[2-9A-HJKMNP-Z]{5}$/);
  });
});

it('settings defaults match the spec', () => {
  expect(S).toMatchObject({ minViews: 10_000, lockDay: 14, liveCheckDay: 30, lockSharePct: 70, minPayoutPaise: 50_000, perClipCapViews: 500_000 });
});

describe('bot score', () => {
  it('is 0 for a clean clip', () => {
    expect(botScore({ views: 100_000, reach: 80_000, likes: 5_000, avgWatchSeconds: 7, indiaShare: 0.93, peakSixHourShare: 0.2 })).toBe(0);
  });
  it('is high for bought views', () => {
    expect(botScore({ views: 90_000, reach: 15_000, likes: 50, avgWatchSeconds: 0.5, indiaShare: 0.2, peakSixHourShare: 0.98 })).toBeGreaterThan(70);
  });
  it('stays between 0 and 100', () => {
    const v = botScore({ views: 1_000_000, reach: 1, likes: 0, avgWatchSeconds: 0, indiaShare: 0, peakSixHourShare: 1 });
    expect(v).toBe(100);
  });
});

describe('timestamped feedback and pay models', () => {
  it('formats notes like 0:03, ...', () => expect(formatNote({ at_seconds: 3, note: 'founder not on screen yet' })).toBe('0:03, founder not on screen yet'));
  it('formats minutes', () => expect(formatNote({ at_seconds: 75, note: 'music' })).toBe('1:15, music'));
  it('cpm pays per view, per_post pays flat, retainer pays nothing per clip', () => {
    expect(earningsForPayModel('cpm', { paidViews: 100_000, ratePaisePer1000: 2500 })).toBe(250_000);
    expect(earningsForPayModel('per_post', { paidViews: 100_000, ratePaisePer1000: 2500, perPostPaise: 150_000 })).toBe(150_000);
    expect(earningsForPayModel('retainer', { paidViews: 100_000, ratePaisePer1000: 2500 })).toBe(0);
  });
});
