// Small shared UI pieces for all portals.

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p role="status" className={err ? 'flash flash-err' : 'flash flash-ok'}>{err ?? ok}</p>
  );
}

export function Chip({ tone, children }: { tone?: 'ok' | 'bad' | 'warn' | ''; children: React.ReactNode }) {
  return <span className={`chip ${tone ? `chip-${tone}` : ''}`}>{children}</span>;
}

export function Stat({ label, value, verified }: { label: string; value: React.ReactNode; verified?: boolean }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="stat" style={verified ? { color: 'var(--verified)' } : undefined}>{value}</div>
    </div>
  );
}

export type SP = Promise<{ ok?: string; err?: string }>;
