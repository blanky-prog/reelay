import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/session';
import { getMyClipper, CLIP_STATUS, daysSincePosted } from '@/lib/crew';
import { supabaseServer } from '@/lib/supabase/server';
import { formatNote, type TimestampedNote } from '@/lib/rules';
import { Chip, Flash } from '../../../ui';
import { RecordingUpload } from './RecordingUpload';

export default async function ClipDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const { ok, err } = await searchParams;
  const me = (await getMe())!;
  const clipper = await getMyClipper(me.id);
  const sb = await supabaseServer();
  const { data: clip } = await sb.from('clips')
    .select('id, reel_url, caption_code, status, posted_at, submitted_at, baseline_views, locked_views, india_share, paid_views, flag_reason, reject_reason, campaigns(name)')
    .eq('id', id).maybeSingle();
  if (!clip || !clipper) notFound();

  const [{ data: snaps }, { data: reviews }] = await Promise.all([
    sb.from('snapshots').select('day, insights_views, public_views, likes, avg_watch_seconds, india_share, created_at').eq('clip_id', id).order('day'),
    sb.rpc('my_clip_feedback', { p_clip: id }),
  ]);
  const s = CLIP_STATUS[clip.status] ?? { label: clip.status, tone: '' };
  const age = daysSincePosted(clip.posted_at);
  const have = new Set((snaps ?? []).map((x: any) => x.day));
  const due: (7 | 14)[] = [];
  if (['counting', 'flagged'].includes(clip.status)) {
    if (age >= 7 && !have.has(7)) due.push(7);
    if (age >= 14 && !have.has(14)) due.push(14);
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Link href="/crew/clips" className="muted">← My clips</Link>
      <div className="row"><h1>{(clip as any).campaigns?.name ?? 'Clip'} · {clip.caption_code}</h1><Chip tone={s.tone}>{s.label}</Chip></div>
      <Flash ok={ok} err={err} />
      <div className="grid">
        <div className="card"><div className="muted">Posted</div><strong>Day {Math.max(0, age)}</strong></div>
        <div className="card"><div className="muted">Locked views</div><strong>{clip.locked_views != null ? Number(clip.locked_views).toLocaleString('en-IN') : 'Locks on day 14'}</strong></div>
        <div className="card"><div className="muted">Paid views (India)</div><strong style={{ color: 'var(--verified)' }}>{clip.paid_views != null ? Number(clip.paid_views).toLocaleString('en-IN') : '-'}</strong></div>
      </div>
      <p className="muted"><a href={`https://www.${clip.reel_url}`} target="_blank" rel="noreferrer">Open on Instagram</a></p>

      {(clip.reject_reason || clip.flag_reason) && <div className="card"><strong>Why:</strong> {clip.reject_reason ?? clip.flag_reason}</div>}

      {(reviews ?? []).length > 0 && (
        <div className="card stack">
          <h2>Reviewer feedback</h2>
          {(reviews as any[]).map((r, i) => (
            <div key={i}>
              <div className="row"><strong>{r.decision === 'approved' ? 'Approved' : r.decision === 'rejected' ? 'Rejected' : 'Flagged'}</strong><span className="muted">{new Date(r.created_at).toLocaleDateString('en-IN')}</span></div>
              {r.reason && <p style={{ margin: '6px 0' }}>{r.reason}</p>}
              <ul>{(r.feedback as TimestampedNote[]).map((n, j) => <li key={j}>{formatNote(n)}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      {due.map((d) => <RecordingUpload key={d} clipId={clip.id} clipperId={clipper.id} day={d} />)}

      <div className="card">
        <h2>Snapshots</h2>
        {!snaps?.length ? <p className="muted">No snapshots yet. We ask for an Insights recording on day 7 and day 14.</p> : (
          <div className="scroll">
            <table>
              <thead><tr><th>Day</th><th className="num">Views (Insights)</th><th className="num">Public count</th><th className="num">Likes</th><th className="num">Avg watch</th><th className="num">India</th></tr></thead>
              <tbody>
                {snaps.map((x: any) => (
                  <tr key={x.day}>
                    <td>Day {x.day}</td>
                    <td className="num">{x.insights_views?.toLocaleString('en-IN') ?? '-'}</td>
                    <td className="num">{x.public_views?.toLocaleString('en-IN') ?? 'Checking'}</td>
                    <td className="num">{x.likes?.toLocaleString('en-IN') ?? '-'}</td>
                    <td className="num">{x.avg_watch_seconds != null ? `${x.avg_watch_seconds}s` : '-'}</td>
                    <td className="num">{x.india_share != null ? `${Math.round(x.india_share * 100)}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
