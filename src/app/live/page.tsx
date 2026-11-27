import { requirePortal } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';
import { Shell } from '../Shell';

export const dynamic = 'force-dynamic';

export default async function ReelayLive() {
  const me = await requirePortal('live');
  const sb = await supabaseServer();
  // RLS: only this client's campaigns, and only clips with verified statuses.
  const [{ data: campaigns }, { data: clips }] = await Promise.all([
    sb.from('campaigns').select('id, name, view_target, status'),
    sb.from('clips').select('locked_views, india_share, status'),
  ]);
  const verified = (clips ?? []).reduce((a, c) => a + Math.floor((c.locked_views ?? 0) * (c.india_share ?? 0)), 0);

  return (
    <Shell title="Reelay Live" name={me.name} role={me.role}>
      <h1>Your campaigns</h1>
      <div className="grid">
        <div className="card"><div className="muted">Campaigns</div><strong>{campaigns?.length ?? 0}</strong></div>
        <div className="card"><div className="muted">Locked verified views</div><strong style={{ color: 'var(--verified)' }}>{verified.toLocaleString('en-IN')}</strong></div>
      </div>
      <p className="muted" style={{ marginTop: 24 }}>The full dashboard, ProofCount and reports arrive in milestone 5.</p>
    </Shell>
  );
}
