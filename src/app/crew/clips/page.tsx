import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { CLIP_STATUS, daysSincePosted } from '@/lib/crew';
import { Chip, Flash, type SP } from '../../ui';

export default async function MyClips({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: clips } = await sb.from('clips')
    .select('id, reel_url, caption_code, status, posted_at, locked_views, paid_views, flag_reason, reject_reason, campaigns(name)')
    .order('submitted_at', { ascending: false });

  return (
    <div className="stack">
      <h1>My clips</h1>
      <Flash ok={ok} err={err} />
      {!clips?.length && <p className="card">No clips yet. <Link href="/crew/campaigns">Find a campaign</Link>.</p>}
      <ul className="list">
        {(clips ?? []).map((c: any) => {
          const s = CLIP_STATUS[c.status] ?? { label: c.status, tone: '' };
          const age = daysSincePosted(c.posted_at);
          const needsRecording = c.status === 'counting' && (age >= 7 && age < 14);
          return (
            <li key={c.id} className="stack">
              <div className="row">
                <Link href={`/crew/clips/${c.id}`}><strong>{c.campaigns?.name ?? 'Campaign'}</strong> · <span className="muted">{c.caption_code}</span></Link>
                <Chip tone={s.tone}>{s.label}</Chip>
              </div>
              <div className="row muted">
                <span>Day {Math.max(0, age)} since posting</span>
                {c.paid_views != null && <span style={{ color: 'var(--verified)' }}>{Number(c.paid_views).toLocaleString('en-IN')} paid views</span>}
              </div>
              {(c.flag_reason || c.reject_reason) && <p className="muted" style={{ margin: 0 }}>{c.reject_reason ?? c.flag_reason}</p>}
              {needsRecording && <p style={{ margin: 0 }}><Link href={`/crew/clips/${c.id}`}>Upload your day 7 Insights recording →</Link></p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
