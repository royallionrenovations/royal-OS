import Link from 'next/link';

/**
 * The first thing anyone sees. It explains what this is in plain language,
 * rather than showing a marketing splash screen for a private tool.
 */
export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b0b0b',
        color: '#f2ead8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        style={{
          maxWidth: 640,
          background: '#141414',
          border: '1px solid #2b2413',
          borderTop: '4px solid #c8961e',
          borderRadius: 12,
          padding: 30
        }}
      >
        <h1 style={{ color: '#e3b341', fontSize: 26, marginTop: 0 }}>ROYAL LION OS</h1>
        <p style={{ color: '#b3a98f', lineHeight: 1.6 }}>
          The private operating system for Royal Lion Renovations LLC. Leads, estimates, projects, marketing, money,
          and an AI team that works from your own records.
        </p>
        <p style={{ lineHeight: 1.6 }}>
          It is private: nobody sees anything without an account you have approved, and every figure you read is
          counted from data you entered.
        </p>
        <Link
          href="/login"
          style={{
            display: 'inline-block',
            background: 'linear-gradient(#e3b341,#b8821f)',
            color: '#111',
            fontWeight: 'bold',
            padding: '11px 18px',
            borderRadius: 6,
            textDecoration: 'none',
            marginTop: 8
          }}
        >
          Sign in
        </Link>
        <p style={{ color: '#8d8266', fontSize: 13, marginTop: 18, lineHeight: 1.6 }}>
          First time here? Open the login page and create your account, then approve yourself as CEO by running the
          short update in the README. After that every other account you create stays locked until you switch it on.
        </p>
      </div>
    </main>
  );
}
