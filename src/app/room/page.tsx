import { requirePortal } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';
import { Shell } from '../Shell';

export const dynamic = 'force-dynamic';

export default async function ControlRoom() {
  const me = await requirePortal('room');
  const sb = await supabaseServer();
  const [live, queue, flags] = await Promise.all([
    sb.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    sb.from('clips').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
    sb.from('flags').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);

  return (
    <Shell title="Control Room" name={me.name} role={me.role}>
      <h1>Control Room</h1>
      <div className="grid">
        <div className="card"><div className="muted">Live campaigns</div><strong>{live.count ?? 0}</strong></div>
        <div className="card"><div className="muted">QA queue</div><strong>{queue.count ?? 0}</strong></div>
        <div className="card"><div className="muted">Open flags</div><strong>{flags.count ?? 0}</strong></div>
      </div>
      <p className="muted" style={{ marginTop: 24 }}>Campaign setup, QA, flags and payouts arrive in milestones 3 and 4.</p>
    </Shell>
  );
}
