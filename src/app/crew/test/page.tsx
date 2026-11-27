import Link from 'next/link';
import { getMe } from '@/lib/session';
import { getMyClipper } from '@/lib/crew';
import { supabaseServer } from '@/lib/supabase/server';
import { submitTest } from '../actions';
import { Chip, Flash, type SP } from '../../ui';

export default async function TestBrief({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const me = (await getMe())!;
  const clipper = await getMyClipper(me.id);
  if (!clipper) return <p className="card">First <Link href="/crew/profile">add your profile</Link>.</p>;
  const sb = await supabaseServer();
  const { data: tests } = await sb.from('test_submissions').select('id, links, score, feedback, created_at').order('created_at', { ascending: false });
  const latest = tests?.[0];
  const canSubmit = !latest || (latest.score != null && latest.score < 14);

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Test brief</h1>
      <Flash ok={ok} err={err} />
      <div className="card stack">
        <p>Cut <strong>3 Reels</strong> from the sample founder-podcast footage and post them on your account. You have 48 hours.</p>
        <ul className="muted">
          <li>Hook in the first 2 seconds</li>
          <li>Burned-in captions inside the safe zones</li>
          <li>Speaker on screen early, no copyrighted music, under 45 seconds</li>
          <li>Your own angle, not a plain cut-down</li>
        </ul>
        <p className="muted">Scored out of 20. Pass mark is 14. Score 18 or more and you move up to Runner after your first campaign.</p>
      </div>
      {latest && (
        <div className="card">
          <div className="row"><strong>Your latest test</strong>{latest.score == null ? <Chip tone="warn">Waiting for review</Chip> : latest.score >= 14 ? <Chip tone="ok">Passed {latest.score}/20</Chip> : <Chip tone="bad">{latest.score}/20</Chip>}</div>
          {latest.feedback && <p>{latest.feedback}</p>}
        </div>
      )}
      {canSubmit && (
        <form action={submitTest} className="card stack">
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <label htmlFor={`l${n}`}>Reel link {n}</label>
              <input id={`l${n}`} name={`l${n}`} placeholder="https://www.instagram.com/reel/..." required />
            </div>
          ))}
          <button className="primary" type="submit">Submit test</button>
        </form>
      )}
    </div>
  );
}
