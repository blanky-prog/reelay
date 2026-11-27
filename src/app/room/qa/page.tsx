import { supabaseServer } from '@/lib/supabase/server';
import { reviewClip } from '../actions';
import { Chip, Flash, type SP } from '../../ui';

const CHECKS: [string, string][] = [
  ['speaker_first_3s', 'Speaker or brand on screen in the first 3 seconds'],
  ['no_banned_claims', 'No banned claims, nothing taken out of context'],
  ['original_edit', 'Original edit with captions, not a plain repost'],
  ['no_copyright_music', 'No copyrighted music'],
];

export default async function QAQueue({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: clips } = await sb.from('clips')
    .select('id, reel_url, caption, caption_code, posted_at, submitted_at, bot_score, campaigns(name, briefs(banned_claims, version)), clippers(tier, strikes, users(name)), social_accounts(handle)')
    .in('status', ['submitted', 'in_review']).order('submitted_at').limit(30);

  return (
    <div className="stack">
      <div className="row"><h1>QA queue</h1><span className="muted">{clips?.length ?? 0} waiting, oldest first</span></div>
      <Flash ok={ok} err={err} />
      {!clips?.length && <p className="card muted">Queue is clear.</p>}
      {(clips ?? []).map((c: any) => {
        const codeOk = (c.caption ?? '').toUpperCase().includes(c.caption_code);
        const banned: string[] = (c.campaigns?.briefs ?? []).sort((a: any, b: any) => b.version - a.version)[0]?.banned_claims ?? [];
        return (
          <form key={c.id} action={reviewClip} className="card stack">
            <input type="hidden" name="id" value={c.id} />
            <div className="row">
              <span><strong>{c.campaigns?.name}</strong> · @{c.social_accounts?.handle} · {c.clippers?.users?.name} ({c.clippers?.tier}{c.clippers?.strikes ? `, ${c.clippers.strikes} strike${c.clippers.strikes > 1 ? 's' : ''}` : ''})</span>
              <span className="row">
                {c.bot_score != null && <Chip tone={c.bot_score >= 50 ? 'bad' : c.bot_score >= 20 ? 'warn' : 'ok'}>Bot score {c.bot_score}</Chip>}
                <Chip tone={codeOk ? 'ok' : 'bad'}>{c.caption_code} {codeOk ? 'found' : 'missing'}</Chip>
              </span>
            </div>
            <p style={{ margin: 0 }}><a href={`https://www.${c.reel_url}`} target="_blank" rel="noreferrer">Open the Reel on Instagram ↗</a> <span className="muted">· posted {new Date(c.posted_at).toLocaleString('en-IN')}</span></p>
            {c.caption && <p className="muted" style={{ margin: 0, whiteSpace: 'pre-line' }}>{c.caption.slice(0, 400)}</p>}
            {banned.length > 0 && <p style={{ margin: 0 }}><strong>Banned claims:</strong> {banned.join(', ')}</p>}
            <div className="checks">
              {CHECKS.map(([k, label]) => <label key={k}><input type="checkbox" name={k} />{label}</label>)}
            </div>
            <details>
              <summary>Add timestamped notes (shown to the clipper)</summary>
              <div className="stack" style={{ marginTop: 10 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="row" style={{ justifyContent: 'flex-start' }}>
                    <input name={`t${i}`} placeholder="0:03" aria-label={`Note ${i + 1} time`} style={{ width: 90 }} />
                    <input name={`n${i}`} placeholder="Founder not on screen yet" aria-label={`Note ${i + 1}`} style={{ flex: 1, minWidth: 200 }} />
                  </div>
                ))}
              </div>
            </details>
            <input name="reason" placeholder="Reason (needed when rejecting)" aria-label="Reason" />
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <button className="primary" name="decision" value="approved" type="submit">Approve</button>
              <button name="decision" value="rejected" type="submit">Reject</button>
              <button name="decision" value="flagged" type="submit">Flag for checks</button>
            </div>
          </form>
        );
      })}
    </div>
  );
}
