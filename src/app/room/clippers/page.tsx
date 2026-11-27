import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyAccount } from '../actions';
import { Chip, Flash } from '../../ui';

type View = 'applied' | 'accounts' | 'tests' | 'all';

export default async function Clippers({ searchParams }: { searchParams: Promise<{ view?: View; ok?: string; err?: string }> }) {
  const { view = 'applied', ok, err } = await searchParams;
  const sb = await supabaseServer();

  return (
    <div className="stack">
      <h1>Clippers</h1>
      <Flash ok={ok} err={err} />
      <nav className="tabs" aria-label="Clipper views">
        {([['applied', 'Waiting for approval'], ['accounts', 'Accounts to verify'], ['tests', 'Tests to score'], ['all', 'Everyone']] as const).map(([v, l]) => (
          <Link key={v} href={`/room/clippers?view=${v}`} style={view === v ? { background: '#fff', color: 'var(--ink)' } : undefined}>{l}</Link>
        ))}
      </nav>
      {view === 'accounts' ? <Accounts sb={sb} /> : view === 'tests' ? <Tests sb={sb} /> : <List sb={sb} view={view} />}
    </div>
  );
}

async function List({ sb, view }: { sb: any; view: View }) {
  let q = sb.from('clippers').select('id, tier, status, strikes, city, niches, test_brief_score, name_match_status, created_at, users(name, email)').order('created_at', { ascending: false }).limit(200);
  if (view === 'applied') q = q.eq('status', 'applied');
  const { data } = await q;
  if (!data?.length) return <p className="card muted">Nobody here right now.</p>;
  return (
    <div className="card scroll">
      <table>
        <thead><tr><th>Name</th><th>City</th><th>Niches</th><th>Test</th><th>Tier</th><th>Status</th><th className="num">Strikes</th></tr></thead>
        <tbody>
          {data.map((c: any) => (
            <tr key={c.id}>
              <td><Link href={`/room/clippers/${c.id}`}><strong>{c.users?.name}</strong></Link><div className="muted">{c.users?.email}</div></td>
              <td>{c.city ?? '-'}</td>
              <td className="muted">{(c.niches ?? []).join(', ') || '-'}</td>
              <td>{c.test_brief_score == null ? '-' : `${c.test_brief_score}/20`}</td>
              <td>{c.tier}</td>
              <td><Chip tone={c.status === 'active' ? 'ok' : c.status === 'banned' ? 'bad' : 'warn'}>{c.status}</Chip></td>
              <td className="num">{c.strikes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Accounts({ sb }: { sb: any }) {
  const { data } = await sb.from('social_accounts').select('id, handle, bio_code, verification_requested_at, clipper_id, clippers(users(name))').is('verified_at', null).not('verification_requested_at', 'is', null).order('verification_requested_at');
  if (!data?.length) return <p className="card muted">No accounts waiting for a check.</p>;
  return (
    <ul className="list">
      {data.map((a: any) => (
        <li key={a.id} className="stack">
          <div className="row">
            <span><a href={`https://www.instagram.com/${a.handle}/`} target="_blank" rel="noreferrer"><strong>@{a.handle}</strong></a> · <Link href={`/room/clippers/${a.clipper_id}`}>{a.clippers?.users?.name}</Link></span>
            <span className="muted">Requested {new Date(a.verification_requested_at).toLocaleString('en-IN')}</span>
          </div>
          <div>Check the bio shows <span className="code">{a.bio_code}</span>, then enter the audience in India from their Insights if you have it.</div>
          <form action={verifyAccount} className="row" style={{ justifyContent: 'flex-start' }}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="back" value="/room/clippers?view=accounts" />
            <label style={{ margin: 0 }}>India audience %<input name="india_pct" type="number" min={0} max={100} style={{ width: 120 }} /></label>
            <button className="primary" name="decision" value="approve" type="submit">Verify</button>
            <button name="decision" value="reject" type="submit">Code not found</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

async function Tests({ sb }: { sb: any }) {
  const { data } = await sb.from('test_submissions').select('id, links, created_at, clipper_id, clippers(users(name))').is('score', null).order('created_at');
  if (!data?.length) return <p className="card muted">No tests waiting.</p>;
  return (
    <ul className="list">
      {data.map((t: any) => (
        <li key={t.id} className="row">
          <span><Link href={`/room/clippers/${t.clipper_id}`}><strong>{t.clippers?.users?.name}</strong></Link> · {t.links.length} Reels</span>
          <Link className="btn" href={`/room/clippers/${t.clipper_id}`}>Score test</Link>
        </li>
      ))}
    </ul>
  );
}
