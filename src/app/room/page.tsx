import Link from 'next/link';
import { getMe } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';

export default async function ControlRoomHome() {
  const me = (await getMe())!;
  const sb = await supabaseServer();
  const { data } = await sb.rpc('control_room_counts');
  const c = (data as any[])?.[0] ?? {};
  const tiles: [string, number, string][] = [
    ['QA queue', c.qa_queue ?? 0, '/room/qa'],
    ['Recordings to check', c.snapshots_to_check ?? 0, '/room/verify'],
    ['Open flags', c.open_flags ?? 0, '/room/flags'],
    ['Accounts to verify', c.accounts_to_verify ?? 0, '/room/clippers?view=accounts'],
    ['Tests to score', c.tests_to_score ?? 0, '/room/clippers?view=tests'],
    ['Clippers waiting', c.clippers_applied ?? 0, '/room/clippers?view=applied'],
    ['Live campaigns', c.live_campaigns ?? 0, '/room/campaigns'],
  ];

  return (
    <div className="stack">
      <h1>Good to see you, {me.name.split(' ')[0]}</h1>
      <div className="grid">
        {tiles.map(([label, n, href]) => (
          <Link key={label} href={href} className="card" style={{ textDecoration: 'none' }}>
            <div className="muted">{label}</div>
            <div className="stat">{Number(n)}</div>
          </Link>
        ))}
      </div>
      <p className="muted">Payout runs and automatic locks arrive in milestone 4.</p>
    </div>
  );
}
