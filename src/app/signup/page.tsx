'use client';
import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Logo } from '../Shell';

// Clipper sign-up. Everyone who signs up here is a clipper; team and client
// accounts are created by a Reelay admin.
export default function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) return setMsg({ err: 'Use at least 8 characters for your password.' });
    setBusy(true);
    const sb = supabaseBrowser();
    const { data, error } = await sb.auth.signUp({ email: form.email, password: form.password, options: { data: { name: form.name } } });
    setBusy(false);
    if (error) return setMsg({ err: 'Could not create your account. If you already have one, sign in instead.' });
    if (data.session) window.location.href = '/crew';
    else setMsg({ ok: 'Check your email to confirm your account, then sign in.' });
  }

  return (
    <>
      <header className="top"><div className="wrap"><Logo /></div></header>
      <main className="wrap" style={{ maxWidth: 440 }}>
        <div className="card">
          <h1>Join the Crew</h1>
          <p className="muted">Edit clips for real brands and get paid every Friday for verified views.</p>
          <form onSubmit={onSubmit} className="stack">
            <div><label htmlFor="name">Full name (as on your PAN)</label><input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            {msg.err && <p className="err" role="alert">{msg.err}</p>}
            {msg.ok && <p className="flash flash-ok" role="status">{msg.ok}</p>}
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
            <p className="muted">Already have an account? <Link href="/login">Sign in</Link></p>
          </form>
        </div>
      </main>
    </>
  );
}
