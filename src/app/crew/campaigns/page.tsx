import Link from 'next/link';
import { getMe } from '@/lib/session';
import { getMyClipper, rateFor } from '@/lib/crew';
import { supabaseServer } from '@/lib/supabase/server';
import { formatInr } from '@/lib/rules';
import { Chip } from '../../ui';

export default async function Campaigns() {
  const me = (await getMe())!;
  const clipper = await getMyClipper(me.id);
  if (!clipper || clipper.status !== 'active') {
    return <p className="card">Campaigns open up once your account is approved. <Link href="/crew">See your setup steps</Link>.</p>;
  }
  const sb = await supabaseServer();
  // RLS returns only campaigns this clipper may see.
  const [{ data: campaigns }, { data: members }, { data: apps }] = await Promise.all([
    sb.from('campaigns').select('id, name, status, visibility, pay_model, per_post_paise, end_date, rate_rookie_paise, rate_runner_paise, rate_anchor_paise').order('created_at', { ascending: false }),
    sb.from('campaign_members').select('campaign_id'),
    sb.from('campaign_applications').select('campaign_id, status'),
  ]);
  const joined = new Set((members ?? []).map((m: any) => m.campaign_id));
  const applied = new Map((apps ?? []).map((a: any) => [a.campaign_id, a.status]));
  const left = await Promise.all((campaigns ?? []).map((c: any) => sb.rpc('campaign_views_left', { p_campaign: c.id }).then((r) => r.data as number | null)));

  return (
    <div className="stack">
      <h1>Campaigns</h1>
      {!campaigns?.length && <p className="card">No open campaigns for your tier right now. New ones go live every week.</p>}
      <ul className="list">
        {(campaigns ?? []).map((c: any, i: number) => (
          <li key={c.id} className="stack">
            <div className="row">
              <Link href={`/crew/campaigns/${c.id}`}><strong>{c.name}</strong></Link>
              {joined.has(c.id) ? <Chip tone="ok">Joined</Chip> : applied.has(c.id) ? <Chip tone="warn">Applied: {applied.get(c.id)}</Chip> : c.visibility === 'application' ? <Chip>Apply to join</Chip> : <Chip>Open</Chip>}
            </div>
            <div className="row muted">
              <span>{c.pay_model === 'per_post' ? `${formatInr(c.per_post_paise ?? 0)} per approved post` : `${formatInr(rateFor(c, clipper.tier))} per 1,000 verified views`}</span>
              {left[i] != null && <span>{left[i]!.toLocaleString('en-IN')} views left</span>}
              {c.end_date && <span>Ends {new Date(c.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
