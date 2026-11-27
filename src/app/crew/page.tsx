import { requirePortal } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';
import { Shell } from '../Shell';

export const dynamic = 'force-dynamic';

export default async function CrewApp() {
  const me = await requirePortal('crew');
  const sb = await supabaseServer();
  // RLS means these only ever return this clipper's own rows and campaigns open to them.
  const [{ data: clipper }, { data: campaigns }] = await Promise.all([
    sb.from('clippers').select('tier, status, strikes').eq('user_id', me.id).maybeSingle(),
    sb.from('campaigns').select('id, name, status').eq('status', 'live'),
  ]);

  return (
    <Shell title="Crew App" name={me.name} role={me.role}>
      <h1>Hi {me.name.split(' ')[0]}</h1>
      <div className="grid">
        <div className="card"><div className="muted">Tier</div><strong>{clipper?.tier ?? 'Not set up yet'}</strong></div>
        <div className="card"><div className="muted">Status</div><strong>{clipper?.status ?? 'Finish your profile'}</strong></div>
        <div className="card"><div className="muted">Open campaigns</div><strong>{campaigns?.length ?? 0}</strong></div>
      </div>
      <p className="muted" style={{ marginTop: 24 }}>Campaigns, clip submission and earnings arrive in milestone 2.</p>
    </Shell>
  );
}
