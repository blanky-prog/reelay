import Link from 'next/link';
import { getMe } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';
import { getMyClipper } from '@/lib/crew';
import { formatInr } from '@/lib/rules';
import { Chip, Stat } from '../ui';

export default async function CrewHome() {
  const me = (await getMe())!;
  const clipper = await getMyClipper(me.id);
  const sb = await supabaseServer();

  const [{ data: accounts }, { data: tests }, { data: items }, { count: liveClips }] = await Promise.all([
    clipper ? sb.from('social_accounts').select('verified_at, verification_requested_at') : Promise.resolve({ data: [] as any[] }),
    clipper ? sb.from('test_submissions').select('score, created_at').order('created_at', { ascending: false }).limit(1) : Promise.resolve({ data: [] as any[] }),
    clipper ? sb.from('payout_items').select('amount_paise, status') : Promise.resolve({ data: [] as any[] }),
    clipper ? sb.from('clips').select('id', { count: 'exact', head: true }).in('status', ['counting', 'locked']) : Promise.resolve({ count: 0 }),
  ]);

  const verified = (accounts ?? []).some((a: any) => a.verified_at);
  const pendingVerify = (accounts ?? []).some((a: any) => !a.verified_at && a.verification_requested_at);
  const test = tests?.[0];
  const paid = (items ?? []).filter((i: any) => i.status === 'paid').reduce((a: number, i: any) => a + Number(i.amount_paise), 0);
  const pending = (items ?? []).filter((i: any) => i.status === 'pending').reduce((a: number, i: any) => a + Number(i.amount_paise), 0);

  const steps = [
    { done: !!clipper, label: 'Add your profile, PAN and UPI ID', href: '/crew/profile', note: '' },
    { done: verified, label: 'Connect your Instagram account', href: '/crew/accounts', note: pendingVerify ? 'Waiting for our check' : '' },
    { done: test?.score != null && test.score >= 14, label: 'Pass the test brief', href: '/crew/test', note: test && test.score == null ? 'Waiting for review' : test?.score != null && test.score < 14 ? `Scored ${test.score}/20. Try again.` : '' },
    { done: clipper?.status === 'active', label: 'Get approved', href: '/crew', note: clipper?.status === 'banned' ? 'Account removed' : '' },
  ];
  const ready = steps.every((s) => s.done);

  return (
    <div className="stack">
      <h1>Hi {me.name.split(' ')[0]}</h1>
      {!ready && (
        <div className="card">
          <h2>Get set up</h2>
          <ol className="list">
            {steps.map((s) => (
              <li key={s.label} className="row">
                <span>{s.done ? '✓ ' : ''}<Link href={s.href}>{s.label}</Link></span>
                {s.done ? <Chip tone="ok">Done</Chip> : s.note ? <Chip tone="warn">{s.note}</Chip> : <Chip>To do</Chip>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="grid">
        <Stat label="Tier" value={clipper ? clipper.tier[0].toUpperCase() + clipper.tier.slice(1) : 'Not set up'} />
        <Stat label="Clips earning" value={liveClips ?? 0} />
        <Stat label="Next Friday" value={formatInr(pending)} />
        <Stat label="Paid so far" value={formatInr(paid)} verified />
      </div>
      {ready && <p><Link className="btn primary" href="/crew/campaigns">See open campaigns</Link></p>}
    </div>
  );
}
