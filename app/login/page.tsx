'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const supabase = createBrowserClient(
    String(process.env.NEXT_PUBLIC_SUPABASE_URL),
    String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');

    if (mode === 'signup') {
      const res = await supabase.auth.signUp({
        email: email,
        password: password,
        options: { data: { full_name: fullName } }
      });
      setBusy(false);
      if (res.error) { setErr(res.error.message); return; }
      setMsg('Account created. Check your email for the confirmation link, then sign in. Your access stays locked until the CEO approves you on the Settings page.');
      setMode('signin');
      return;
    }

    const res = await supabase.auth.signInWithPassword({ email: email, password: password });
    setBusy(false);
    if (res.error) { setErr(res.error.message); return; }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main style={wrapStyle}>
      <div style={cardStyle}>
        <h1 style={h1Style}>ROYAL LION OS</h1>
        <p style={subStyle}>Royal Lion Renovations LLC</p>

        <div style={tabsStyle}>
          <button type="button" onClick={() => setMode('signin')} style={mode === 'signin' ? tabOnStyle : tabOffStyle}>Sign in</button>
          <button type="button" onClick={() => setMode('signup')} style={mode === 'signup' ? tabOnStyle : tabOffStyle}>Create account</button>
        </div>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label style={labStyle}>
              Your name
              <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Christian" />
            </label>
          )}

          <label style={labStyle}>
            Email
            <input style={inputStyle} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>

          <label style={labStyle}>
            Password
            <input style={inputStyle} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 8 characters" />
          </label>

          <button style={btnStyle} disabled={busy} type="submit">{busy ? 'Working...' : 'Sign in'}</button>
        </form>

        {err && <p style={badStyle}>{err}</p>}
        {msg && <p style={goodStyle}>{msg}</p>}

        <p style={footStyle}>One sign-in for the whole office. Your role decides which departments you can open, and the CEO approves every new account.</p>
      </div>
    </main>
  );
}

const wrapStyle = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b0b', padding: 20 };
const cardStyle = { width: 420, background: '#141414', border: '1px solid #2b2413', borderTop: '4px solid #c8961e', borderRadius: 12, padding: 28, color: '#f2ead8' };
const h1Style = { margin: 0, color: '#e3b341', fontSize: 24 };
const subStyle = { margin: '4px 0 20px', color: '#b3a98f', fontSize: 13 };
const tabsStyle = { display: 'flex', gap: 6, marginBottom: 16 };
const tabOnStyle = { flex: 1, background: '#241d0e', color: '#e3b341', border: '1px solid #4a3a15', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' };
const tabOffStyle = { flex: 1, background: 'transparent', color: '#8d8266', border: '1px solid #2b2413', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' };
const labStyle = { display: 'block', marginBottom: 12, fontSize: 13, color: '#b3a98f' };
const inputStyle = { width: '100%', marginTop: 4, background: '#0c0c0c', color: '#f2ead8', border: '1px solid #4a4022', borderRadius: 6, padding: 10, fontSize: 15 };
const btnStyle = { width: '100%', background: '#c8961e', color: '#111', fontWeight: 'bold', border: 0, padding: 12, borderRadius: 6, cursor: 'pointer', fontSize: 15, marginTop: 6 };
const badStyle = { color: '#ff7a6b', fontSize: 13, marginTop: 12 };
const goodStyle = { color: '#5fd08a', fontSize: 13, marginTop: 12 };
const footStyle = { color: '#8d8266', fontSize: 12, marginTop: 18, lineHeight: 1.5 };
