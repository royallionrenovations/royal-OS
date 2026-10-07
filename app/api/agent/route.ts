import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { ask, type ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Runs one of the specialist agents: Luna (leads), Leo (estimates), Max
 * (marketing), Roy (finance) or Lion (strategy).
 *
 * The prompt for each agent is stored in the ai_agents table, so you can edit
 * how your team thinks without touching any code. This route supplies the facts
 * for whichever department the agent belongs to.
 */
export async function POST(req: Request) {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const slug: string = (body?.slug || '').trim();
  const extra: string = (body?.context || '').trim();
  if (!slug) return NextResponse.json({ ok: false, message: 'Which agent?' }, { status: 400 });

  const { data: agent } = await sb.from('ai_agents').select('*').eq('slug', slug).single();
  if (!agent) return NextResponse.json({ ok: false, message: 'No such agent.' }, { status: 404 });
  if (agent.status === 'PAUSED') {
    return NextResponse.json({ ok: false, message: agent.name + ' is paused. Turn the seat on in Settings.' });
  }

  const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

  let facts = '';

  if (slug === 'roy' || slug === 'lion' || slug === 'leo') {
    const [txns, accs, invs, ests, proj, per] = await Promise.all([
      sb.from('transactions').select('txn_date, amount, type, category, description, ownership').order('txn_date', { ascending: false }).limit(300),
      sb.from('accounts').select('name, kind, balance'),
      sb.from('invoices').select('amount, status, due_date'),
      sb.from('estimates').select('estimate_number, customer_name, total, total_cost, gross_margin, status, project_title'),
      sb.from('projects').select('title, status, contract_total, actual_cost'),
      sb.from('personal_transactions').select('amount, type, category')
    ]);

    const business = (txns.data || []).filter((t) => t.ownership === 'BUSINESS');
    const income = business.filter((t) => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const expense = business.filter((t) => t.type === 'Expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cats: Record<string, number> = {};
    business.filter((t) => t.type === 'Expense').forEach((t) => {
      cats[t.category] = (cats[t.category] || 0) + (Number(t.amount) || 0);
    });

    facts = [
      'BUSINESS INCOME: ' + money(income),
      'BUSINESS EXPENSES: ' + money(expense),
      'NET PROFIT: ' + money(income - expense),
      'EXPENSES BY CATEGORY: ' + Object.entries(cats).map(([k, v]) => k + ' ' + money(v)).join(', '),
      'CASH BY ACCOUNT: ' + (accs.data || []).map((a) => a.name + ' ' + money(Number(a.balance))).join(', '),
      'UNPAID INVOICES: ' + money((invs.data || []).filter((i) => ['SENT', 'PART_PAID', 'OVERDUE'].includes(i.status)).reduce((s, i) => s + (Number(i.amount) || 0), 0)),
      'OVERDUE INVOICES: ' + (invs.data || []).filter((i) => i.status === 'OVERDUE').length,
      'PERSONAL INCOME: ' + money((per.data || []).filter((p) => p.type === 'Income').reduce((s, p) => s + (Number(p.amount) || 0), 0)),
      'PERSONAL SPENDING: ' + money((per.data || []).filter((p) => p.type === 'Expense').reduce((s, p) => s + (Number(p.amount) || 0), 0)),
      'ESTIMATES: ' + (ests.data || []).length + ' on record',
      'PROJECTS: ' + (proj.data || []).map((p) => p.title + ' ' + p.status + ' contract ' + money(Number(p.contract_total)) + ' cost ' + money(Number(p.actual_cost))).join(' | ')
    ].join('\n');
  }

  if (slug === 'leo') {
    const { data: est } = await sb
      .from('estimates')
      .select('*, estimate_lines(*)')
      .eq('status', 'WAITING_APPROVAL')
      .order('created_at', { ascending: false })
      .limit(3);

    facts +=
      '\n\nESTIMATES AWAITING REVIEW:\n' +
      ((est || []).length
        ? est!
            .map(
              (e) =>
                '#' + e.estimate_number + ' ' + (e.customer_name || '') + ' ' + (e.project_title || '') +
                '\ntotal ' + money(Number(e.total)) + ' cost ' + money(Number(e.total_cost)) +
                '\nmargin ' + ((Number(e.gross_margin) || 0) * 100).toFixed(1) + '%' +
                '\nlines: ' + (e.estimate_lines || []).map((l: any) => l.description + ' ' + l.quantity + ' ' + l.unit + ' @ ' + money(Number(l.unit_cost))).join('; ')
            )
            .join('\n\n')
        : 'none awaiting review');
  }

  if (slug === 'luna') {
    const { data: leads } = await sb
      .from('leads')
      .select('name, city, service_requested, status, ai_score, estimated_value, urgency, platform, source_content')
      .order('created_at', { ascending: false })
      .limit(40);

    facts =
      'LEADS ON RECORD (' + (leads || []).length + '):\n' +
      (leads || [])
        .map(
          (l) =>
            '-' + (l.name || 'unnamed') + ' | ' + (l.city || '') + ' | ' + (l.service_requested || '') + ' | ' + l.status +
            ' | score ' + (l.ai_score || 0) + ' | ' + money(Number(l.estimated_value) || 0) + ' | ' + l.platform
        )
        .join('\n');
  }

  if (slug === 'max') {
    const [chan, posts, sits] = await Promise.all([
      sb.from('marketing_channels').select('*'),
      sb.from('social_posts').select('id, platform, status, caption, planned_for, engagement').limit(60),
      sb.from('leads').select('platform, city, service_requested, status').limit(300)
    ]);

    const byPlatform: Record<string, number> = {};
    (sits.data || []).forEach((l) => {
      byPlatform[l.platform] = (byPlatform[l.platform] || 0) + 1;
    });

    facts =
      'CHANNELS:\n' +
      (chan.data || []).map((c) => c.name + ' (' + c.platform + ') spend ' + money(Number(c.spend)) + ' leads ' + c.leads_count + ' won ' + c.won_count).join('\n') +
      '\n\nPOSTS ON RECORD: ' + (posts.data || []).length +
      '\nPUBLISHED: ' + (posts.data || []).filter((p) => p.status === 'PUBLISHED').length +
      '\n\nLEADS BY SOURCE: ' + Object.entries(byPlatform).map(([k, v]) => k + ' ' + v).join(', ');
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: agent.system_prompt },
    {
      role: 'user',
      content:
        'FACTS FROM THE COMPANY DATABASE (your only source of numbers):\n' +
        (facts || 'no department data supplied') +
        (extra ? '\n\nTHE CEO ASKS: ' + extra : '\n\nGive your standard report for this department.')
    }
  ];

  const r = await ask(messages, {
    model: agent.model || process.env.ROYAL_AI_MODEL,
    agentSlug: agent.slug,
    purpose: 'agent_run',
    userId: user.id,
    maxTokens: 1200,
    temperature: 0.4
  });

  if (!r.ok) return NextResponse.json({ ok: false, message: r.message });

  await sb.from('ai_agents').update({ last_run_at: new Date().toISOString().slice(0, 19) }).eq('slug', slug);

  return NextResponse.json({ ok: true, agent: agent.name, answer: r.text, costCents: r.costCents });
}
