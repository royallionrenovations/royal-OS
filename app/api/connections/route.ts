import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { budget } from '@/lib/ai';

export const dynamic = 'force-dynamic';

/**
 * The guard rails for AI spending, and the honest reporting of which parts of
 * this system are live. Both are shown to the CEO rather than hidden.
 */
export async function GET() {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const { used, cap } = await budget();

  const { data: usage } = await sb
    .from('ai_usage')
    .select('agent_slug, purpose, cost_cents, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const byAgent: Record<string, { runs: number; cents: number }> = {};
  (usage || []).forEach((u) => {
    const k = u.agent_slug || 'royal';
    byAgent[k] = byAgent[k] || { runs: 0, cents: 0 };
    byAgent[k].runs += 1;
    byAgent[k].cents += Number(u.cost_cents) || 0;
  });

  const connections = [
    { name: 'OpenAI', live: !!process.env.OPENAI_API_KEY, what: 'Power for Royal AI and every agent in the team room.' },
    { name: 'Supabase', live: !!process.env.NEXT_PUBLIC_SUPABASE_URL, what: 'Your database, logins and files.' },
    { name: 'Reddit', live: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET), what: 'Real posts asking for renovation work, through the official API.' },
    { name: 'Google Places', live: !!process.env.GOOGLE_PLACES_KEY, what: 'Local builders, property managers and suppliers as potential partners. Not homeowners.' },
    { name: 'Facebook and Instagram', live: !!(process.env.META_APP_ID && process.env.META_APP_SECRET), what: 'Publishing and page metrics. Meta must approve your app first, so this stays off until they do.' },
    { name: 'Nextdoor', live: false, what: 'Not available. Nextdoor forbids automated access, so this app opens the searches for you to read instead.' },
    { name: 'TikTok', live: false, what: 'Not available for automation. Manual entry.' }
  ];

  return NextResponse.json({
    ok: true,
    budget: { usedCents: used, capCents: cap, remainingCents: Math.max(0, cap - used) },
    byAgent,
    connections,
    note:
      'Anything marked off is off because the code refuses to break that platform\u2019s rules or because a key is missing, not because it silently failed.'
  });
}
