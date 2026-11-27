import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import { portalFor, portalPath } from '@/lib/roles';

// Send everyone to the right place: login, or their own portal.
export default async function Home() {
  const me = await getMe();
  redirect(me ? portalPath(portalFor(me.role)) : '/login');
}
