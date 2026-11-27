import { ROLE_LABEL, type Role } from '@/lib/roles';

export function Logo() {
  return (
    <span className="logo">
      <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M5 5l9 9-9 9z" fill="#FF5A1F" />
        <path d="M14 5l9 9-9 9z" fill="#F5F2EC" />
      </svg>
      Reelay
    </span>
  );
}

export function Shell({ title, name, role, children }: { title: string; name: string; role: Role; children: React.ReactNode }) {
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Logo />
          <span>{title}</span>
          <form action="/auth/signout" method="post" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="muted" style={{ color: '#D4D0C8' }}>{name} · {ROLE_LABEL[role]}</span>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
