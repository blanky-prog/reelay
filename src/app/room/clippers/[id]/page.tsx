import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/session';
import { supabaseServer } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { CLIP_STATUS } from '@/lib/crew';
import { scoreTest, setClipper, strike, verifyAccount } from '../../actions';
import { Chip, Flash } from '../../../ui';

function tryDecrypt(v: string | null) { if (!v) return null; try { return decrypt(v); } catch { return 'Cannot decrypt (check REELAY_DATA_KEY)'; } }

export default async function ClipperDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const { ok, err } = await searchParams;
  const me = (await getMe())!;
  const sb = await supabaseServer();
  const { data: c } = await sb.from('clippers').select('*, users(name, email, phone)').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [{ data: accounts }, { data: tests }, { data: clips }] = await Promise.all([
    sb.from('social_accounts').select('id, handle, bio_code, verified_at, verification_requested_at, audience_india_share').eq('clipper_id', id),
    sb.from('test_submissions').select('id, links, score, feedback, created_at').eq('clipper_id', id).order('created_at', { ascending: false }),
    sb.from('clips').select('id, caption_code, status, paid_views, bot_score, campaigns(name)').eq('clipper_id', id).order('submitted_at', { ascending: false }).limit(20),
  ]);
  const canSeeKyc = me.role === 'super_admin' || me.role === 'finance';
  const pan = canSeeKyc ? tryDecrypt(c.pan_encrypted) : c.pan_last4;
  const upi = canSeeKyc ? tryDecrypt(c.upi_encrypted) : c.upi_masked;
  const canManage = me.role === 'super_admin' || me.role === 'network_manager';

  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <Link href="/room/clippers" className="muted">← Clippers</Link>
      <div className="row"><h1>{c.users?.name}</h1><Chip tone={c.status === 'active' ? 'ok' : c.status === 'banned' ? 'bad' : 'warn'}>{c.status}</Chip></div>
      <Flash ok={ok} err={err} />
      <div className="grid">
        <div className="card"><div className="muted">Email</div><strong>{c.users?.email}</strong></div>
        <div className="card"><div className="muted">City</div><strong>{c.city ?? '-'}</strong></div>
        <div className="card"><div className="muted">Niches and languages</div><strong>{[...(c.niches ?? []), ...(c.languages ?? [])].join(', ') || '-'}</strong></div>
        <div className="card"><div className="muted">Strikes</div><strong>{c.strikes} of 3</strong></div>
      </div>

      <div className="card stack">
        <h2>Payments (KYC)</h2>
        <div className="grid">
          <div><div className="muted">PAN</div><strong>{pan ?? 'Not added'}</strong></div>
          <div><div className="muted">UPI</div><strong>{upi ?? 'Not added'}</strong></div>
          <div><div className="muted">Name match</div><Chip tone={c.name_match_status === 'matched' ? 'ok' : c.name_match_status === 'mismatch' ? 'bad' : 'warn'}>{c.name_match_status}</Chip></div>
        </div>
        {canManage && (
          <form action={setClipper} className="row" style={{ justifyContent: 'flex-start' }}>
            <input type="hidden" name="id" value={id} />
            <span className="muted">Check that the UPI name matches "{c.users?.name}" and the PAN.</span>
            <button name="name_match_status" value="matched" type="submit">Names match</button>
            <button name="name_match_status" value="mismatch" type="submit">Mismatch</button>
          </form>
        )}
      </div>

      <div className="card stack">
        <h2>Instagram accounts</h2>
        {!accounts?.length && <p className="muted">No accounts added yet.</p>}
        {(accounts ?? []).map((a: any) => (
          <div key={a.id} className="row">
            <a href={`https://www.instagram.com/${a.handle}/`} target="_blank" rel="noreferrer">@{a.handle}</a>
            {a.verified_at ? <Chip tone="ok">Verified{a.audience_india_share != null ? ` · ${Math.round(a.audience_india_share * 100)}% India` : ''}</Chip> : (
              <form action={verifyAccount} className="row">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="back" value={`/room/clippers/${id}`} />
                <span className="muted">Bio code {a.bio_code}</span>
                <input name="india_pct" type="number" min={0} max={100} placeholder="India %" style={{ width: 100 }} aria-label="India audience percent" />
                <button className="primary" name="decision" value="approve" type="submit">Verify</button>
              </form>
            )}
          </div>
        ))}
      </div>

      <div className="card stack">
        <h2>Test brief</h2>
        {!tests?.length && <p className="muted">No test submitted yet.</p>}
        {(tests ?? []).map((t: any) => (
          <div key={t.id} className="stack">
            <ul>{t.links.map((l: string) => <li key={l}><a href={`https://www.${l}`} target="_blank" rel="noreferrer">{l}</a></li>)}</ul>
            {t.score != null ? <p>Scored <strong>{t.score}/20</strong>{t.feedback ? `: ${t.feedback}` : ''}</p> : canManage && (
              <form action={scoreTest} className="stack">
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="clipper_id" value={id} />
                <p className="muted">Hook (5) · Captions (4) · Pacing (4) · Brief followed (4) · Originality (3). Pass mark 14.</p>
                <div className="row" style={{ justifyContent: 'flex-start' }}>
                  <label style={{ margin: 0 }}>Score out of 20<input name="score" type="number" min={0} max={20} required style={{ width: 120 }} /></label>
                </div>
                <textarea name="feedback" placeholder="Short feedback the clipper will see" />
                <button className="primary" type="submit">Save score</button>
              </form>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <div className="card stack">
          <h2>Status and tier</h2>
          <form action={setClipper} className="row" style={{ justifyContent: 'flex-start' }}>
            <input type="hidden" name="id" value={id} />
            <label style={{ margin: 0 }}>Tier
              <select name="tier" defaultValue={c.tier} style={{ width: 160 }}>
                <option value="rookie">Rookie</option><option value="runner">Runner</option><option value="anchor">Anchor</option>
              </select>
            </label>
            <label style={{ margin: 0 }}>Status
              <select name="status" defaultValue={c.status} style={{ width: 160 }}>
                <option value="applied">Applied</option><option value="active">Active (approved)</option><option value="banned">Banned</option>
              </select>
            </label>
            <button className="primary" type="submit">Save</button>
          </form>
        </div>
      )}

      <div className="card stack">
        <div className="row"><h2>Clips</h2>
          <form action={strike} className="row">
            <input type="hidden" name="id" value={id} />
            <button type="submit">Add a strike</button>
            <button type="submit" name="ban" value="1">Ban</button>
          </form>
        </div>
        {!clips?.length ? <p className="muted">No clips yet.</p> : (
          <table>
            <thead><tr><th>Campaign</th><th>Code</th><th>Status</th><th className="num">Bot score</th><th className="num">Paid views</th></tr></thead>
            <tbody>{clips.map((x: any) => (
              <tr key={x.id}><td>{x.campaigns?.name}</td><td>{x.caption_code}</td><td><Chip tone={CLIP_STATUS[x.status]?.tone}>{CLIP_STATUS[x.status]?.label ?? x.status}</Chip></td><td className="num">{x.bot_score ?? '-'}</td><td className="num">{x.paid_views?.toLocaleString('en-IN') ?? '-'}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
