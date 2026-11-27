import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { createCampaign } from '../../actions';
import { CampaignFields } from '../CampaignForm';
import { Flash, type SP } from '../../../ui';

export default async function NewCampaign({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const { data: orgs } = await sb.from('organisations').select('id, name').eq('type', 'client').order('name');
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <Link href="/room/campaigns" className="muted">← Campaigns</Link>
      <h1>New campaign</h1>
      <Flash ok={ok} err={err} />
      {!orgs?.length ? <p className="card">Add a client first under <Link href="/room/clients">Clients</Link>.</p> : (
        <form action={createCampaign} className="card stack">
          <CampaignFields orgs={orgs as any} />
          <button className="primary" type="submit">Create campaign (as draft)</button>
        </form>
      )}
    </div>
  );
}
