import Link from 'next/link';
import { requirePortal } from '@/lib/session';
import { Shell } from '../Shell';

export const dynamic = 'force-dynamic';

const TABS = [
  ['/crew', 'Home'],
  ['/crew/campaigns', 'Campaigns'],
  ['/crew/clips', 'My clips'],
  ['/crew/earnings', 'Earnings'],
  ['/crew/profile', 'Profile'],
] as const;

export default async function CrewLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePortal('crew');
  return (
    <Shell title="Crew App" name={me.name} role={me.role}>
      <nav className="tabs" aria-label="Crew App">
        {TABS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      {children}
    </Shell>
  );
}
