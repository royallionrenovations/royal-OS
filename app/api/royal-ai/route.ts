import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { ask, type ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Royal AI. The chat the CEO talks to.
 *
 * The context for every answer is assembled here from the database, on the
 * server. The model never sees the database itself and never queries it, so
 * there is nothing for it to invent: it can only restate what it was handed.
 */
export async function POST(req: Request) {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const question: string = (body?.question || '').trim();
  let conversationId: string | null = body?.conversationId || null;

  if (!question) {
    return NextResponse.json({ ok: false, message: 'Ask a question first.' }, { status: 400 });
  }

  // ---- gather the facts, all of them counted here ----
  const [txns, leads, ests, invs, accs, chan, proj, per, pay, settings] = await Promise.all([
    sb.from('transactions').select('txn_date, amount, type, category, description, vendor_customer, ownership').order('txn_date', { ascending: false }).limit(400),
    sb.from('leads').select('name, city, service_requested, status, ai_score, estimated_value, urgency, platform, created_at, ai_recommended_action').order('created_at', { ascending: false }).limit(150),
    sb.from('estimates').select('estimate_number, customer_name, project_title, total, total_cost, gross_margin, status, created_at').order('created_at', { ascending: false }).limit(120),
    sb.from('invoices').select('invoice_number, amount, status, due_date, kind').limit(200),
    sb.from('accounts').select('name, kind, balance, balance_as_of'),
    sb.from('marketing_channels').select('name, platform, spend, leads_count, won_count, revenue'),
    sb.from('projects').select('title, status, contract_total, actual_cost, start_date, target_end'),
    sb.from('personal_transactions').select('txn_date, amount, type, category').limit(200),
    sb.from('owner_distributions').select('paid_on, amount, kind').limit(100),
    sb.from('company_settings').select('legal_name, services, service_areas, minimum_gross_margin, target_gross_margin, tax_reserve_pct').single()
  ]);

  const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

  const rows = txns.data || [];
  const business = rows.filter((r) => r.ownership === 'BUSINESS');
  const personal = rows.filter((r) => r.ownership === 'PERSONAL');

  const sum = (list: any[], type: string) =>
    list.filter((r) => r.type === type).reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const byCategory: Record<string, number> = {};
  business
    .filter((r) => r.type === 'Expense')
    .forEach((r) => {
      byCategory[r.category] = (byCategory[r.category] || 0) + (Number(r.amount) || 0);
    });

  const income = sum(business, 'Income');
  const expense = sum(business, 'Expense');
  const cogs = ['Materials', 'Subcontract labor', 'Labor'].reduce((s, c) => s + (byCategory[c] || 0), 0);

  const context = [
    'COMPANY: ' + (settings.data?.legal_name || 'Royal Lion Renovations LLC'),
    'Services sold: ' + (settings.data?.services || []).join(', '),
    'Service area: ' + (settings.data?.service_areas || []).join(', '),
    'Target gross margin: ' + Math.round((settings.data?.target_gross_margin || 0) * 100) + '%',
    'Minimum gross margin: ' + Math.round((settings.data?.minimum_gross_margin || 0) * 100) + '%',
    '',
    'ALL RECORDED BUSINESS TRANSACTIONS (' + business.length + '):',
    'Income total: ' + money(income),
    'Expense total: ' + money(expense),
    'Materials and labor: ' + money(cogs),
    'Gross margin overall: ' + (income ? ((income - cogs) / income * 100).toFixed(1) + '%' : 'no income recorded'),
    'Net profit: ' + money(income - expense),
    'Expenses by category: ' + Object.entries(byCategory).map(([k, v]) => k + ' ' + money(v)).join(', '),
    'Most recent ten transactions:',
    ...business.slice(0, 10).map(
      (r) => '  ' + r.txn_date + ' | ' + r.type + ' | ' + r.description + ' | ' + (r.vendor_customer || '') + ' | ' + money(Number(r.amount))
    ),
    '',
    'PERSONAL TRANSACTIONS RECORDED SEPARATELY (' + personal.length + '):',
    'Personal income: ' + money(sum(personal, 'Income')),
    'Personal spending: ' + money(sum(personal, 'Expense')),
    '',
    'ACCOUNTS:',
    ...((accs.data || []).map((a) => '  ' + a.name + ' (' + a.kind + '): ' + money(Number(a.balance)) + ', as of ' + (a.balance_as_of || 'unknown'))),
    '',
    'OWNER PAY TAKEN: ' + money((pay.data || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)),
    '',
    'LEADS (' + (leads.data || []).length + '):',
    ...((leads.data || []).slice(0, 25).map(
      (l) =>
        '  ' + (l.name || 'unnamed') + ' | ' + (l.city || '') + ' | ' + (l.service_requested || '') + ' | ' + l.status +
        ' | score ' + (l.ai_score || 0) + ' | value ' + money(Number(l.estimated_value) || 0) + ' | ' + l.platform +
        (l.ai_recommended_action ? ' | action: ' + l.ai_recommended_action : '')
    )),
    '',
    'ESTIMATES (' + (ests.data || []).length + '):',
    ...((ests.data || []).slice(0, 20).map(
      (e) =>
        '  #' + e.estimate_number + ' ' + (e.customer_name || '') + ' | ' + (e.project_title || '') + ' | total ' +
        money(Number(e.total)) + ' | cost ' + money(Number(e.total_cost)) + ' | margin ' +
        ((Number(e.gross_margin) || 0) * 100).toFixed(1) + '% | ' + e.status
    )),
    '',
    'INVOICES:',
    'Unpaid total: ' + money((invs.data || []).filter((i) => ['SENT', 'PART_PAID', 'OVERDUE'].includes(i.status)).reduce((s, i) => s + (Number(i.amount) || 0), 0)),
    'Overdue: ' + money((invs.data || []).filter((i) => i.status === 'OVERDUE').reduce((s, i) => s + (Number(i.amount) || 0), 0)),
    '',
    'PROJECTS:',
    ...((proj.data || []).map((p) => '  ' + p.title + ' | ' + p.status + ' | contract ' + money(Number(p.contract_total)) + ' | cost so far ' + money(Number(p.actual_cost)))),
    '',
    'MARKETING:',
    ...((chan.data || []).map((c) => '  ' + c.name + ' (' + c.platform + ') | spend ' + money(Number(c.spend)) + ' | leads ' + c.leads_count + ' | won ' + c.won_count + ' | revenue ' + money(Number(c.revenue))))
  ].join('\n');

  const system = `You are Royal, the business intelligence assistant for ${settings.data?.legal_name || 'Royal Lion Renovations LLC'}, a residential remodeling company in Lee County, Florida. You answer the owner, who is the CEO.

You are given a CONTEXT block containing the company's real records. Every figure you may use is in that block.

Absolute rules:
1. Never invent, estimate, recall or assume a number that is not in the context. If the owner asks for something the context does not contain, say plainly that it is not recorded yet and tell them which page would hold it.
2. Do the arithmetic yourself from the context when the owner asks for a total, a percentage or a comparison, and show the figures you used.
3. You are not a CPA, lawyer, tax adviser or licensed financial professional. For tax, legal, investment or personal financial decisions, give the general reasoning and say to confirm it with their own CPA.
4. Answer in the fewest words that fully answer. Lead with the answer, then one sentence of meaning, then the action you recommend.
5. Never flatter, never pad, never open with filler.`;

  const history: ChatMessage[] = [];

  if (conversationId) {
    const { data: prior } = await sb
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);
    (prior || []).forEach((m) => {
      if (m.role === 'user' || m.role === 'assistant') {
        history.push({ role: m.role, content: m.content });
      }
    });
  } else {
    const { data: created } = await sb
      .from('ai_conversations')
      .insert({ user_id: user.id, title: question.slice(0, 60) })
      .select('id')
      .single();
    conversationId = created?.id || null;
  }

  const r = await ask(
    [
      { role: 'system', content: system },
      { role: 'user', content: 'CONTEXT (the company\'s real records):\n' + context },
      ...history,
      { role: 'user', content: question }
    ],
    { agentSlug: 'royal', purpose: 'chat', userId: user.id, maxTokens: 1200 }
  );

  if (!r.ok) {
    return NextResponse.json({ ok: false, message: r.message }, { status: 200 });
  }

  if (conversationId) {
    await sb.from('ai_messages').insert([
      { conversation_id: conversationId, role: 'user', content: question },
      {
        conversation_id: conversationId,
        role: 'assistant',
        content: r.text,
        tokens_in: r.tokensIn,
        tokens_out: r.tokensOut,
        cost_cents: r.costCents
      }
    ]);
  }

  return NextResponse.json({
    ok: true,
    answer: r.text,
    conversationId,
    costCents: r.costCents,
    model: r.model
  });
}
