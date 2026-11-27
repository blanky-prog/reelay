import { supabaseServer } from '@/lib/supabase/server';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { setPerson } from '../actions';
import { Flash, type SP } from '../../ui';

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export default async function People({ searchParams }: { searchParams: SP }) {
  const { ok, err } = await searchParams;
  const sb = await supabaseServer();
  const [{ data: users }, { data: orgs }] = await Promise.all([
    sb.from('users').select('id, name, email, role, organisations(name)').neq('role', 'clipper').order('role'),
    sb.from('organisations').select('id, name, type').order('name'),
  ]);

  return (
    <div className="stack">
      <h1>People</h1>
      <Flash ok={ok} err={err} />
      <p className="muted">Everyone signs up as a clipper. To make someone part of the Reelay team, or a client's dashboard user, ask them to sign up first, then set their role here.</p>
      <form action={setPerson} className="card stack" style={{ maxWidth: 640 }}>
        <div><label htmlFor="email">Their sign-up email</label><input id="email" name="email" type="email" required /></div>
        <div className="grid">
          <div><label htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue="qa_reviewer">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
          </div>
          <div><label htmlFor="org">Organisation</label>
            <select id="org" name="organisation_id" defaultValue="">
              <option value="">None (clippers)</option>
              {(orgs ?? []).map((o: any) => <option key={o.id} value={o.id}>{o.name}{o.type === 'reelay' ? ' (team)' : ''}</option>)}
            </select>
          </div>
        </div>
        <p className="muted">Team roles belong to the Reelay organisation. Client roles belong to the client's organisation.</p>
        <button className="primary" type="submit">Save role</button>
      </form>
      <div className="card scroll">
        <h2>Team and client users</h2>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Organisation</th></tr></thead>
          <tbody>{(users ?? []).map((u: any) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{ROLE_LABEL[u.role as Role]}</td><td>{u.organisations?.name ?? '-'}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
