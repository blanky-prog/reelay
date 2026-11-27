import { supabaseServer } from '@/lib/supabase/server';
import { checkSnapshot } from '../actions';
import { Flash, type SP } from '../../ui';

export default async function VerifyViews({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: snaps } = await sb.from('snapshots')
    .select('id, day, insights_views, reach, likes, comments, shares, saves, avg_watch_seconds, india_share, recording_url, created_at, clips(reel_url, caption_code, campaigns(name), social_accounts(handle))')
    .is('public_views', null).in('day', [7, 14]).order('created_at').limit(30);
  const urls = await Promise.all((snaps ?? []).map((s: any) =>
    s.recording_url ? sb.storage.from('recordings').createSignedUrl(s.recording_url, 3600).then((r) => r.data?.signedUrl ?? null) : Promise.resolve(null)));

  return (
    <div className="stack">
      <h1>Verify views</h1>
      <Flash ok={ok} err={err} />
      <p className="muted">For each recording: watch it, open the Reel on Instagram, and type the view count Instagram shows publicly. Reelay trusts the lower of the two numbers and runs the fraud rules.</p>
      {!snaps?.length && <p className="card muted">Nothing to verify right now.</p>}
      {(snaps ?? []).map((s: any, i: number) => (
        <form key={s.id} action={checkSnapshot} className="card stack">
          <input type="hidden" name="id" value={s.id} />
          <div className="row">
            <strong>{s.clips?.campaigns?.name} · @{s.clips?.social_accounts?.handle} · {s.clips?.caption_code} · Day {s.day}</strong>
            <span className="row">
              {urls[i] && <a href={urls[i]!} target="_blank" rel="noreferrer">Watch recording ↗</a>}
              <a href={`https://www.${s.clips?.reel_url}`} target="_blank" rel="noreferrer">Open Reel ↗</a>
            </span>
          </div>
          <div className="scroll">
            <table>
              <thead><tr><th className="num">Views (clipper)</th><th className="num">Reach</th><th className="num">Likes</th><th className="num">Comments</th><th className="num">Shares</th><th className="num">Saves</th><th className="num">Avg watch</th><th className="num">India</th></tr></thead>
              <tbody><tr>
                <td className="num">{s.insights_views?.toLocaleString('en-IN') ?? '-'}</td><td className="num">{s.reach?.toLocaleString('en-IN') ?? '-'}</td>
                <td className="num">{s.likes ?? '-'}</td><td className="num">{s.comments ?? '-'}</td><td className="num">{s.shares ?? '-'}</td><td className="num">{s.saves ?? '-'}</td>
                <td className="num">{s.avg_watch_seconds != null ? `${s.avg_watch_seconds}s` : '-'}</td><td className="num">{s.india_share != null ? `${Math.round(s.india_share * 100)}%` : '-'}</td>
              </tr></tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <label style={{ margin: 0 }}>Public view count on Instagram<input name="public_views" type="number" min={0} required style={{ width: 200 }} /></label>
            <button className="primary" type="submit">Save and run checks</button>
          </div>
        </form>
      ))}
    </div>
  );
}
