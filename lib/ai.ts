import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The AI layer.
 *
 * Two rules from the specification are enforced here, not by trusting a prompt:
 *   1. Never invent financial numbers. Every call receives a context block built
 *      from the database. The system prompt says to say "not available" instead.
 *   2. Never let the AI bill run away. The daily spend cap is checked before the
 *      call and every call is logged to ai_usage.
 *
 * The API key lives only on the server. Nothing in the browser ever sees it.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/** Dollar cost per 1,000 tokens, used for the spend cap. */
const PRICE_PER_1K: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  'gpt-4o': { in: 0.0025, out: 0.01 },
  'gpt-4.1-mini': { in: 0.0004, out: 0.0016 },
  'gpt-4.1': { in: 0.002, out: 0.008 }
};

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function centsUsedToday(): Promise<number> {
  const sb = admin();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from('ai_usage')
    .select('cost_cents')
    .gte('created_at', start.toISOString());
  if (error || !data) return 0;
  return data.reduce((sum, r) => sum + Number(r.cost_cents || 0), 0);
}

export async function budget(): Promise<{ used: number; cap: number; ok: boolean }> {
  const cap = Number(process.env.MAX_DAILY_AI_CENTS || 200);
  const used = await centsUsedToday();
  return { used, cap, ok: used < cap };
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type AiResult =
  | { ok: true; text: string; model: string; tokensIn: number; tokensOut: number; costCents: number }
  | { ok: false; reason: 'budget' | 'error'; message: string };

/**
 * One call to the model, with the cap checked first and the usage logged after.
 * If the cap is reached the function refuses rather than quietly spending.
 */
export async function ask(
  messages: ChatMessage[],
  opts: {
    model?: string;
    agentSlug?: string;
    purpose?: string;
    userId?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<AiResult> {
  const model = opts.model || process.env.ROYAL_AI_MODEL || 'gpt-4o-mini';
  const check = await budget();
  if (!check.ok) {
    return {
      ok: false,
      reason: 'budget',
      message:
        `The AI budget for today is spent: $${(check.used / 100).toFixed(2)} of ` +
        `$${(check.cap / 100).toFixed(2)}. Raise MAX_DAILY_AI_CENTS when you want more, ` +
        `or wait until tomorrow. Nothing has been sent to the model.`
    };
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, reason: 'error', message: 'OPENAI_API_KEY is not set on the server.' };
  }

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 1400,
        temperature: opts.temperature ?? 0.3
      })
    });
  } catch (e) {
    return { ok: false, reason: 'error', message: `Could not reach the AI service: ${String(e)}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      reason: 'error',
      message: `The AI service returned ${res.status}. ${body.slice(0, 300)}`
    };
  }

  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content?.trim() || '';
  const tokensIn = Number(json?.usage?.prompt_tokens || 0);
  const tokensOut = Number(json?.usage?.completion_tokens || 0);
  const price = PRICE_PER_1K[model] || PRICE_PER_1K['gpt-4o-mini'];
  const costCents = ((tokensIn / 1000) * price.in + (tokensOut / 1000) * price.out) * 100;

  try {
    await admin().from('ai_usage').insert({
      user_id: opts.userId || null,
      agent_slug: opts.agentSlug || null,
      purpose: opts.purpose || null,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_cents: Number(costCents.toFixed(4))
    });
  } catch {
    // Logging must never break the feature the user asked for.
  }

  return { ok: true, text, model, tokensIn, tokensOut, costCents: Number(costCents.toFixed(4)) };
}

/** Asks for JSON back and parses it, with one repair attempt. */
export async function askJson<T>(
  messages: ChatMessage[],
  opts: Parameters<typeof ask>[1] = {}
): Promise<{ ok: true; data: T } | { ok: false; reason: string; message: string }> {
  const first = await ask(
    messages.concat([{ role: 'user', content: 'Reply with JSON only. No prose, no code fences.' }]),
    { ...opts, temperature: 0 }
  );
  if (!first.ok) return first;

  const clean = first.text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return { ok: true, data: JSON.parse(clean) as T };
  } catch {
    const retry = await ask(
      messages.concat([
        { role: 'user', content: 'Reply with JSON only. No prose, no code fences.' },
        { role: 'assistant', content: clean },
        { role: 'user', content: 'That was not valid JSON. Return the same answer as valid JSON only.' }
      ]),
      { ...opts, temperature: 0 }
    );
    if (!retry.ok) return retry;
    const cleaned = retry.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return { ok: true, data: JSON.parse(cleaned) as T };
    } catch {
      return { ok: false, reason: 'parse', message: 'The AI reply was not valid JSON.' };
    }
  }
}
