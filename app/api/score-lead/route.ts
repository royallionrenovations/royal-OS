import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { askJson, type ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Lead scoring, as the specification asks: a score from 0 to 100 with reasons
 * and a recommended action, judged against this company's real service list
 * and service area.
 *
 * What this route deliberately does NOT do: fetch anything. The browser sends
 * the text that the owner pasted or that a permitted API returned. So no rule
 * of any platform is broken by the act of scoring.
 */

type Scored = {
  score: number;
  reasons: string[];
  service_match: string | null;
  city: string | null;
  urgency: 'Emergency' | 'This week' | 'This month' | 'Flexible' | 'Unknown';
  estimated_value: number;
  recommended_action: string;
  summary: string;
  is_real_opportunity: boolean;
};

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const items: { url?: string; text?: string; platform?: string }[] = body?.items || [];
  if (!items.length) {
    return NextResponse.json({ ok: false, message: 'Paste at least one post or listing to score.' }, { status: 400 });
  }

  const { data: settings } = await sb
    .from('company_settings')
    .select('services, service_areas, minimum_gross_margin, target_gross_margin')
    .single();

  const services: string[] = settings?.services || [];
  const areas: string[] = settings?.service_areas || [];

  const system = `You score inbound renovation opportunities for Royal Lion Renovations LLC, a residential remodeling company in Lee County, Florida.
Services the company actually sells: ${services.join(', ')}.
Service area: ${areas.join(', ')}.

Score each item 0 to 100 using these weights:
- Explicitly requesting renovation, remodel or repair work (heavy)
- Match to one of the services above (heavy)
- Location inside the service area (heavy)
- Budget or project size signals (moderate)
- Timeline or urgency (moderate)
- Signs of a real homeowner or business rather than an advertisement, a contractor fishing for work, or a spam post (heavy)

Score bands: 95 extremely hot, 80 hot, 65 strong, 50 moderate, 30 weak, 10 unlikely.

Rules: never invent a name, phone number or email. If the item is an advertisement, another contractor offering services, or has nothing to do with renovation, set is_real_opportunity to false and score it below 20. Estimate a project value only from the stated size or scope, and use 0 when nothing is stated.

Return JSON with this exact shape:
{"results":[{"score":0,"reasons":["..."],"service_match":"...","city":"...","urgency":"Unknown","estimated_value":0,"recommended_action":"...","summary":"...","is_real_opportunity":true}]}`;

  const content = items
    .map((it, i) =>
      `ITEM ${i + 1}\nplatform: ${it.platform || 'unknown'}\nurl: ${it.url || 'none provided'}\ntext:\n${(it.text || '').slice(0, 4000)}`
    )
    .join('\n\n---\n\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: content + '\n\nScore every item. Return one result object per item, in the same order.' }
  ];

  const r = await askJson<{ results: Scored[] }>(messages, {
    agentSlug: 'luna',
    purpose: 'lead_scoring',
    userId: user.id,
    maxTokens: 2600
  });

  if (!r.ok) {
    return NextResponse.json({ ok: false, message: r.message });
  }

  const results = Array.isArray(r.data.results) ? r.data.results : [];

  // Store the honest ones. Anything the model judged not a real opportunity is
  // returned to the screen as a rejection rather than filling the pipeline.
  const saved: string[] = [];
  const rejected: number[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const s = results[i];
    if (!s) continue;

    if (!s.is_real_opportunity) {
      rejected.push(i);
      continue;
    }

    const score = Math.max(0, Math.min(100, Number(s.score) || 0));
    const { data, error } = await sb
      .from('leads')
      .insert({
        platform: item.platform || 'Pasted',
        url: item.url || null,
        source_content: (item.text || '').slice(0, 8000),
        city: s.city || null,
        service_requested: s.service_match || null,
        project_description: s.summary || null,
        estimated_value: Number(s.estimated_value) || 0,
        urgency: s.urgency || 'Unknown',
        ai_summary: s.summary || null,
        ai_score: score,
        ai_score_reasons: s.reasons || [],
        ai_recommended_action: s.recommended_action || null,
        is_hot: score >= 80,
        status: score >= 50 ? 'QUALIFIED' : 'NEW'
      })
      .select('id')
      .single();

    if (!error && data) saved.push(data.id);
  }

  return NextResponse.json({
    ok: true,
    scored: results,
    saved,
    rejectedIndexes: rejected,
    note:
      saved.length + ' lead(s) added to the pipeline. ' +
      (rejected.length ? rejected.length + ' item(s) were judged not to be real opportunities and were not saved. ' : '') +
      'Anything scoring 80 or more is marked hot on the Leads page.'
  });
}
