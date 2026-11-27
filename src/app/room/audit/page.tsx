import { supabaseServer } from '@/lib/supabase/server';

const ACTION: Record<string, string> = { insert: 'Created', update: 'Changed', delete: 'Deleted', strike: 'Strike', ban: 'Banned' };

function summarise(e: any) {
  const b = e.before ?? {}, a = e.after ?? {};
  const changed = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]) && !['updated_at'].includes(k));
  if (e.action === 'update') return changed.slice(0, 4).map((k) => `${k}: ${fmt(b[k])} → ${fmt(a[k])}`).join(' · ');
  if (e.action === 'insert') return a.status ? `status ${a.status}` : a.decision ? `decision ${a.decision}` : a.name ?? '';
  return a.strikes != null ? `strikes now ${a.strikes}` : '';
}
const fmt = (v: unknown) => (v == null ? '-' : typeof v === 'object' ? '…' : String(v).slice(0, 40));

export default async function AuditLog() {
  const sb = await supabaseServer();
  const { data: entries } = await sb.from('audit_log').select('id, actor_id, action, object_type, object_id, before, after, created_at').order('created_at', { ascending: false }).limit(200);
  const ids = [...new Set((entries ?? []).map((e: any) => e.actor_id).filter(Boolean))];
  const { data: people } = ids.length ? await sb.from('users').select('id, name').in('id', ids) : { data: [] as any[] };
  const name = new Map((people ?? []).map((p: any) => [p.id, p.name]));

  return (
    <div className="stack">
      <h1>Audit log</h1>
      <p className="muted">Every change to clips, reviews, flags, campaigns, clippers and payouts. It cannot be edited or deleted. Showing the latest 200.</p>
      <div className="card scroll">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th><th>Details</th></tr></thead>
          <tbody>{(entries ?? []).map((e: any) => (
            <tr key={e.id}>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString('en-IN')}</td>
              <td>{e.actor_id ? name.get(e.actor_id) ?? 'Unknown user' : 'System'}</td>
              <td>{ACTION[e.action] ?? e.action}</td>
              <td>{e.object_type}</td>
              <td className="muted">{summarise(e)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
