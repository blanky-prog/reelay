import { getMe } from '@/lib/session';
import { getMyClipper, PAYOUT_TYPE } from '@/lib/crew';
import { supabaseServer } from '@/lib/supabase/server';
import { DEFAULT_SETTINGS, formatInr } from '@/lib/rules';
import { Chip, Stat } from '../../ui';

export default async function Earnings() {
  const me = (await getMe())!;
  const clipper = await getMyClipper(me.id);
  const sb = await supabaseServer();
  const { data: items } = clipper
    ? await sb.from('payout_items').select('id, type, amount_paise, status, created_at, clips(caption_code), payout_runs(run_date, status)').order('created_at', { ascending: false })
    : { data: [] as any[] };

  const sum = (f: (i: any) => boolean) => (items ?? []).filter(f).reduce((a: number, i: any) => a + Number(i.amount_paise), 0);
  const paid = sum((i) => i.status === 'paid');
  const pending = sum((i) => i.status === 'pending' || i.status === 'in_run');

  return (
    <div className="stack">
      <h1>Earnings</h1>
      <div className="grid">
        <Stat label="Paid to you" value={formatInr(paid)} verified />
        <Stat label="Coming up" value={formatInr(pending)} />
        <Stat label="UPI" value={clipper?.upi_masked ?? 'Not added'} />
      </div>
      <p className="muted">Payouts go out every Friday by UPI. Balances under {formatInr(DEFAULT_SETTINGS.minPayoutPaise)} roll over to the next week. 70% is paid after a clip locks on day 14 and the rest after the day 30 check.</p>
      {clipper && clipper.name_match_status !== 'matched' && <p className="flash flash-err">We are still checking that your UPI name matches your PAN. Payouts start once it does.</p>}
      <div className="card scroll">
        {!items?.length ? <p className="muted">No earnings yet. Your first payout appears here when a clip locks.</p> : (
          <table>
            <thead><tr><th>Clip</th><th>Type</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((i: any) => (
                <tr key={i.id}>
                  <td>{i.clips?.caption_code ?? '-'}</td>
                  <td>{PAYOUT_TYPE[i.type] ?? i.type}</td>
                  <td className="num">{formatInr(Number(i.amount_paise))}</td>
                  <td>{i.status === 'paid' ? <Chip tone="ok">Paid {i.payout_runs?.run_date ? new Date(i.payout_runs.run_date).toLocaleDateString('en-IN') : ''}</Chip> : i.status === 'cancelled' ? <Chip tone="bad">Cancelled</Chip> : <Chip>Pending</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
