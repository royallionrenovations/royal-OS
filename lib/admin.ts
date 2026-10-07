import { createClient } from '@supabase/supabase-js';

/**
 * A service-role client for the few server tasks that must bypass row level
 * security: writing the AI usage ledger and reading aggregate figures for a
 * report.
 *
 * The service role key bypasses every security rule in the database, so it is
 * only ever used inside route handlers on the server. It is never imported into
 * a client component, and it is never sent to the browser.
 */
let cached: ReturnType<typeof createClient> | null = null;

export function supabaseAdmin() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase server keys are missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Returns null instead of throwing, for pages that can render without it. */
export function supabaseAdminSafe() {
  try {
    return supabaseAdmin();
  } catch {
    return null;
  }
}
