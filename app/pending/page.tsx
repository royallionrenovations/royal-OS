import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';

/**
 * Shown to any account that exists but has not been approved yet.
 * This is how the specification's "CEO approves access" rule is enforced.
 */
export default async function PendingPage() {
  const supabase = supabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, role, status')
    .eq('id', user.id)
    .single();

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0b0b',
        color: '#f2ead8',
        padding: 20
      }}
    >
      <div
        style={{
          maxWidth: 520,
          background: '#141414',
          border: '1px solid #2b2413',
          borderLeft: '5px solid #e3b341',
          borderRadius: 12,
          padding: 26
        }}
      >
        <h1 style={{ color: '#e3b341', fontSize: 22, marginTop: 0 }}>Waiting for approval</h1>
        <p style={{ color: '#b3a98f', lineHeight: 1.6 }}>
          Your account is created and signed in, but it has no access yet. Every new account starts like this, so
          nobody can read the company books by simply signing up.
        </p>
        <p style={{ lineHeight: 1.6 }}>
          <b>Signed in as:</b> {profile?.email || user.email}
          <br />
          <b>Status:</b> {profile?.status || 'PENDING'}
          <br />
          <b>Role:</b> {profile?.role || 'PENDING'}
        </p>
        <p style={{ color: '#b3a98f', lineHeight: 1.6 }}>
          The CEO approves access from <b>Settings &rarr; People</b>. Once your role is set to ACTIVE you can open
          the departments that role allows.
        </p>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            style={{
              background: '#241d0e',
              color: '#e3b341',
              border: '1px solid #4a3a15',
              padding: '9px 14px',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
