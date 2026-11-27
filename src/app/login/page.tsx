'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Logo } from '../Shell';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError('Email or password is wrong. Try again.');
    window.location.href = '/';
  }

  return (
    <>
      <header className="top"><div className="wrap"><Logo /></div></header>
      <main className="wrap" style={{ maxWidth: 420 }}>
        <div className="card">
          <h1>Sign in</h1>
          <p className="muted">One login for clippers, the Reelay team and clients. You'll land in your own portal.</p>
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
            <div>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="err" role="alert">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
          </form>
        </div>
      </main>
    </>
  );
}
