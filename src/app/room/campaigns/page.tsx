import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInr } from '@/lib/rules';
import { Chip, Flash, type SP } from '../../ui';

export default async function Campaigns({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: campaigns } = await sb.from('campaigns').select('id, name, status, visibility, view_target, revenue_paise, end_date, organisations(name)').order('created_at', { ascending: false });
  const left = await Promise.all((campaigns ?? []).map((c: any) => sb.rpc('campaign_views_left', { p_campaign: c.id }).then((r) => r.data as number | null)));

  return (
    <div className="stack">
      <div className="row"><h1>Campaigns</h1><Link className="btn primary" href="/room/campaigns/new">New campaign</Link></div>
      <Flash ok={ok} err={err} />
      <div className="card scroll">
        {!campaigns?.length ? <p className="muted">No campaigns yet. Add a client first, then create a campaign.</p> : (
          <table>
            <thead><tr><th>Campaign</th><th>Client</th><th>Status</th><th>Access</th><th className="num">Target</th><th className="num">Paid views so far</th><th className="num">Revenue</th></tr></thead>
            <tbody>{campaigns.map((c: any, i: number) => (
              <tr key={c.id}>
                <td><Link href={`/room/campaigns/${c.id}`}><strong>{c.name}</strong></Link></td>
                <td>{c.organisations?.name}</td>
                <td><Chip tone={c.status === 'live' ? 'ok' : c.status === 'draft' ? 'warn' : ''}>{c.status}</Chip></td>
                <td>{c.visibility}</td>
                <td className="num">{Number(c.view_target).toLocaleString('en-IN')}</td>
                <td className="num" style={{ color: 'var(--verified)' }}>{left[i] == null ? '-' : (c.view_target - left[i]!).toLocaleString('en-IN')}</td>
                <td className="num">{formatInr(Number(c.revenue_paise))}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
