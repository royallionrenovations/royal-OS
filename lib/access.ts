import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Every path in Royal Lion OS, with the role allowed to open it.
 * The sidebar is built from this list and the same list is checked on the
 * server, so a hidden button never means hidden data.
 */
export const DEPARTMENTS = [
  { path: '/dashboard', label: 'Dashboard', roles: ['CEO', 'ADMIN', 'BOOKKEEPER', 'SALES', 'ESTIMATOR', 'MARKETING', 'VIEWER'] },
  { path: '/leads', label: 'Leads', roles: ['CEO', 'ADMIN', 'SALES', 'MARKETING'] },
  { path: '/sales', label: 'Sales', roles: ['CEO', 'ADMIN', 'SALES'] },
  { path: '/customers', label: 'Customers', roles: ['CEO', 'ADMIN', 'SALES', 'BOOKKEEPER'] },
  { path: '/estimates', label: 'Estimates', roles: ['CEO', 'ADMIN', 'ESTIMATOR', 'SALES'] },
  { path: '/projects', label: 'Projects', roles: ['CEO', 'ADMIN', 'ESTIMATOR'] },
  { path: '/marketing', label: 'Marketing', roles: ['CEO', 'ADMIN', 'MARKETING'] },
  { path: '/finance', label: 'Finance', roles: ['CEO', 'ADMIN', 'BOOKKEEPER'] },
  { path: '/bookkeeping', label: 'Bookkeeping', roles: ['CEO', 'ADMIN', 'BOOKKEEPER'] },
  { path: '/personal', label: 'Personal', roles: ['CEO'] },
  { path: '/analytics', label: 'Analytics', roles: ['CEO', 'ADMIN', 'BOOKKEEPER', 'MARKETING'] },
  { path: '/royal-ai', label: 'Royal AI', roles: ['CEO', 'ADMIN', 'SALES', 'ESTIMATOR', 'MARKETING', 'BOOKKEEPER'] },
  { path: '/ai-team', label: 'AI Team', roles: ['CEO', 'ADMIN'] },
  { path: '/reports', label: 'Reports', roles: ['CEO', 'ADMIN', 'BOOKKEEPER', 'SALES', 'MARKETING'] },
  { path: '/settings', label: 'Settings', roles: ['CEO'] }
] as const;

export type Role = 'CEO' | 'ADMIN' | 'BOOKKEEPER' | 'SALES' | 'ESTIMATOR' | 'MARKETING' | 'VIEWER' | 'PENDING';

export function allowed(path: string, role: Role): boolean {
  const d = DEPARTMENTS.find((x) => x.path === path);
  if (!d) return false;
  return (d.roles as readonly string[]).includes(role);
}

export function departmentsFor(role: Role) {
  return DEPARTMENTS.filter((d) => (d.roles as readonly string[]).includes(role));
}

/** Loads the signed-in user's profile. Every page starts with this. */
export async function currentProfile(supabase: SupabaseClient) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, status, phone')
    .eq('id', user.id)
    .single();

  return { user, profile };
}
