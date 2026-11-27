import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';
import { canUsePortal, portalFor, portalPath, type Portal, type Role } from './roles';

export interface Me { id: string; name: string; email: string; role: Role; organisationId: string | null }

/** The signed-in user's profile, or null. Reads through RLS (a user can always read their own row). */
export async function getMe(): Promise<Me | null> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('users').select('id, name, email, role, organisation_id').eq('id', user.id).maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name, email: data.email, role: data.role as Role, organisationId: data.organisation_id };
}

/** Use at the top of each portal page. Sends people to login, or to their own portal. */
export async function requirePortal(portal: Portal): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!canUsePortal(me.role, portal)) redirect(portalPath(portalFor(me.role)));
  return me;
}
