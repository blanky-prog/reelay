import Link from 'next/link';
import { requirePortal } from '@/lib/session';
import type { Role } from '@/lib/roles';
import { Shell } from '../Shell';

export const dynamic = 'force-dynamic';

const TABS: [string, string, Role[] | 'all'][] = [
  ['/room', 'Home', 'all'],
  ['/room/qa', 'QA queue', ['super_admin', 'qa_reviewer', 'campaign_manager']],
  ['/room/verify', 'Verify views', ['super_admin', 'qa_reviewer']],
  ['/room/flags', 'Flags', ['super_admin', 'qa_reviewer']],
  ['/room/campaigns', 'Campaigns', 'all'],
  ['/room/clippers', 'Clippers', 'all'],
  ['/room/clients', 'Clients', ['super_admin', 'campaign_manager']],
  ['/room/people', 'People', ['super_admin']],
  ['/room/audit', 'Audit log', ['super_admin']],
];

export default async function RoomLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePortal('room');
  return (
    <Shell title="Control Room" name={me.name} role={me.role}>
      <nav className="tabs" aria-label="Control Room">
        {TABS.filter(([, , roles]) => roles === 'all' || roles.includes(me.role)).map(([href, label]) => (
          <Link key={href} href={href}>{label}</Link>
        ))}
      </nav>
      {children}
    </Shell>
  );
}
