import Link from 'next/link';
import { getMe } from '@/lib/session';
import { getMyClipper } from '@/lib/crew';
import { supabaseServer } from '@/lib/supabase/server';
import { addAccount, requestVerification } from '../actions';
import { Chip, Flash, type SP } from '../../ui';

export default async function Accounts({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const me = (await getMe())!;
  const clipper = await getMyClipper(me.id);
  if (!clipper) return <p className="card">First <Link href="/crew/profile">add your profile</Link>.</p>;
  const sb = await supabaseServer();
  const { data: accounts } = await sb.from('social_accounts').select('id, handle, bio_code, verified_at, verification_requested_at').order('created_at');

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Instagram accounts</h1>
      <Flash ok={ok} err={err} />
      <p className="muted">To prove an account is yours, add its code to your Instagram bio for 24 hours. Each account can belong to one clipper only.</p>
      <ul className="list">
        {(accounts ?? []).map((a: any) => (
          <li key={a.id} className="stack">
            <div className="row">
              <strong>@{a.handle}</strong>
              {a.verified_at ? <Chip tone="ok">Verified</Chip> : a.verification_requested_at ? <Chip tone="warn">Checking</Chip> : <Chip>Not verified</Chip>}
            </div>
            {!a.verified_at && (
              <>
                <div><span className="muted">Add this to your bio: </span><span className="code">{a.bio_code}</span></div>
                {!a.verification_requested_at && (
                  <form action={requestVerification}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit">I've added the code</button>
                  </form>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <form action={addAccount} className="card stack">
        <div>
          <label htmlFor="handle">Add an Instagram account</label>
          <input id="handle" name="handle" placeholder="@yourpage" required />
        </div>
        <button className="primary" type="submit">Add account</button>
      </form>
    </div>
  );
}
