import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { decideFlag } from '../actions';
import { Chip, Flash, type SP } from '../../ui';

const RULE: Record<string, string> = {
  like_rate: 'Like rate too low', watch_time: 'Watch time too short', india_share: 'Too few Indian viewers',
  spike: 'Sudden spike', views_vs_reach: 'Numbers do not match', qa_manual: 'Flagged by QA',
};

export default async function Flags({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: clips } = await sb.from('clips')
    .select('id, reel_url, caption_code, flag_reason, bot_score, clipper_id, campaigns(name), social_accounts(handle), clippers(strikes, users(name)), flags(rule, value, threshold, status)')
    .eq('status', 'flagged').order('submitted_at');

  return (
    <div className="stack">
      <h1>Flags</h1>
      <Flash ok={ok} err={err} />
      <p className="muted">A flag means a rule tripped, not that the clip is fake. Check the Reel and the recording, then clear it or confirm fraud. Confirming fraud removes the clip, bans the clipper and stops any payout.</p>
      {!clips?.length && <p className="card muted">No open flags.</p>}
      {(clips ?? []).map((c: any) => (
        <form key={c.id} action={decideFlag} className="card stack">
          <input type="hidden" name="clip_id" value={c.id} />
          <div className="row">
            <strong>{c.campaigns?.name} · @{c.social_accounts?.handle} · {c.caption_code}</strong>
            {c.bot_score != null && <Chip tone={c.bot_score >= 50 ? 'bad' : 'warn'}>Bot score {c.bot_score}</Chip>}
          </div>
          <div className="checks">
            {(c.flags ?? []).filter((f: any) => f.status === 'open').map((f: any, i: number) => (
              <Chip key={i} tone="bad">{RULE[f.rule] ?? f.rule}{f.value != null ? `: ${f.value} (limit ${f.threshold})` : ''}</Chip>
            ))}
          </div>
          {c.flag_reason && <p className="muted" style={{ margin: 0 }}>{c.flag_reason}</p>}
          <p style={{ margin: 0 }}>
            <a href={`https://www.${c.reel_url}`} target="_blank" rel="noreferrer">Open Reel ↗</a> · <Link href={`/room/clippers/${c.clipper_id}`}>{c.clippers?.users?.name}</Link> ({c.clippers?.strikes ?? 0} strikes)
          </p>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button name="decision" value="clear" type="submit">Clear flag</button>
            <button className="primary" name="decision" value="fraud" type="submit">Confirm fraud and ban</button>
          </div>
        </form>
      ))}
    </div>
  );
}
