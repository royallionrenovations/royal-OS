import { redirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile, departmentsFor, type Role } from '@/lib/access';

/**
 * The office shell: the black and gold sidebar, the company mark, and the
 * signed-in person's name and role. Everything inside (app) sits in here.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { user, profile } = await currentProfile(supabase);

  if (!user) redirect('/login');
  if (!profile || profile.status !== 'ACTIVE' || profile.role === 'PENDING') redirect('/pending');

  const menu = departmentsFor(profile.role as Role);

  return (
    <div className="shell">
      <aside className="side">
        {/* The company mark. Swap this file in /public for the original PNG. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="Royal Lion Renovations" />

        <nav>
          {menu.map((d) => (
            <Link key={d.path} href={d.path}>
              {d.label}
            </Link>
          ))}
        </nav>

        <div className="who">
          <b>{profile.full_name || profile.email}</b>
          {profile.role}
          <form action="/auth/signout" method="post" style={{ marginTop: 8 }}>
            <button className="ghost" type="submit" style={{ width: '100%' }}>
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
