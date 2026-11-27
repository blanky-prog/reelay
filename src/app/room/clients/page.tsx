import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { addClient } from '../actions';
import { Flash, type SP } from '../../ui';

export default async function Clients({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: orgs } = await sb.from('organisations').select('id, name, gst_number, created_at, campaigns(id, status)').eq('type', 'client').order('name');

  return (
    <div className="stack">
      <h1>Clients</h1>
      <Flash ok={ok} err={err} />
      <form action={addClient} className="card stack" style={{ maxWidth: 640 }}>
        <h2>Add a client</h2>
        <div><label htmlFor="name">Brand name</label><input id="name" name="name" required /></div>
        <div className="grid">
          <div><label htmlFor="gst">GST number (optional)</label><input id="gst" name="gst" /></div>
          <div><label htmlFor="address">Billing address (optional)</label><input id="address" name="address" /></div>
        </div>
        <button className="primary" type="submit">Add client</button>
      </form>
      <div className="card scroll">
        {!orgs?.length ? <p className="muted">No clients yet.</p> : (
          <table>
            <thead><tr><th>Client</th><th>GST</th><th className="num">Campaigns</th><th className="num">Live</th></tr></thead>
            <tbody>{orgs.map((o: any) => (
              <tr key={o.id}><td><strong>{o.name}</strong></td><td>{o.gst_number ?? '-'}</td><td className="num">{o.campaigns?.length ?? 0}</td><td className="num">{(o.campaigns ?? []).filter((c: any) => c.status === 'live').length}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <p className="muted">To give a client dashboard access, ask them to sign up, then set their role to Client admin under <Link href="/room/people">People</Link>.</p>
    </div>
  );
}
