'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api-client';

const inputClass =
  'w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 font-normal outline-none focus:border-forest-600 focus:ring-2 focus:ring-forest-200';

export default function Account() {
  const { user, ready, logout } = useAuth();
  if (!ready) return <div className="mx-auto max-w-lg px-4 py-10 text-ink-400">Loading…</div>;
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {user ? <Profile user={user} onSignOut={logout} /> : <SignInOrRegister />}
    </div>
  );
}

function SignInOrRegister() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === 'signin') await login({ email: form.email, password: form.password });
      else await register(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">
        {tab === 'signin' ? 'Sign in' : 'Create an account'}
      </h1>

      <div role="tablist" className="mt-4 flex gap-1 border-b border-sand-200">
        {[['signin', 'Sign in'], ['register', 'Register']].map(([value, label]) => (
          <button
            key={value} role="tab" type="button" aria-selected={tab === value}
            onClick={() => { setTab(value); setError(null); }}
            className={`border-b-2 px-4 py-2.5 font-semibold ${
              tab === value ? 'border-forest-700 text-forest-700' : 'border-transparent text-ink-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-5">
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

        {tab === 'register' ? (
          <>
            <label className="grid gap-1 text-sm font-semibold">
              Full name
              <input value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Mobile number
              <input type="tel" value={form.phone} onChange={set('phone')} required
                     placeholder="+91 98765 43210" autoComplete="tel" className={inputClass} />
            </label>
          </>
        ) : null}

        <label className="grid gap-1 text-sm font-semibold">
          Email
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Password
          <input
            type="password" value={form.password} onChange={set('password')} required minLength={8}
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'} className={inputClass}
          />
          {tab === 'register' ? (
            <span className="text-xs font-normal text-ink-400">
              At least 8 characters, with a letter and a number.
            </span>
          ) : null}
        </label>

        <button type="submit" disabled={busy}
                className="rounded-lg bg-forest-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? 'Just a moment…' : tab === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </>
  );
}

function Profile({ user, onSignOut }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, phone: user.phone, currentPassword: '', newPassword: '' });
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body = { name: form.name, phone: form.phone };
      if (form.newPassword) {
        body.newPassword = form.newPassword;
        body.currentPassword = form.currentPassword;
      }
      const { user: updated } = await api.updateMe(body);
      setUser(updated);
      setForm({ ...form, currentPassword: '', newPassword: '' });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Your account</h1>
      <p className="text-ink-500">Signed in as {user.email}</p>

      <form onSubmit={save} className="mt-5 grid gap-3 rounded-2xl border border-sand-200 bg-white p-5">
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        {saved ? <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-800">Saved.</p> : null}

        <label className="grid gap-1 text-sm font-semibold">
          Full name
          <input value={form.name} onChange={set('name')} required minLength={2} className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Mobile number
          <input type="tel" value={form.phone} onChange={set('phone')} required className={inputClass} />
        </label>

        <details className="rounded-lg bg-sand-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Change password</summary>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">
              Current password
              <input type="password" value={form.currentPassword} onChange={set('currentPassword')}
                     autoComplete="current-password" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              New password
              <input type="password" value={form.newPassword} onChange={set('newPassword')} minLength={8}
                     autoComplete="new-password" className={inputClass} />
            </label>
          </div>
        </details>

        <button type="submit" disabled={busy}
                className="rounded-lg bg-forest-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>

      <div className="mt-4 grid gap-2">
        <Link href="/trips" className="rounded-lg border border-sand-300 bg-white px-4 py-2.5 text-center font-semibold">
          My trips
        </Link>
        {user.role === 'ADMIN' ? (
          <Link href="/admin/payments" className="rounded-lg border border-sand-300 bg-white px-4 py-2.5 text-center font-semibold">
            Payment verification queue
          </Link>
        ) : null}
        <button type="button" onClick={onSignOut}
                className="rounded-lg border border-sand-300 bg-white px-4 py-2.5 font-semibold">
          Sign out
        </button>
      </div>
    </>
  );
}
