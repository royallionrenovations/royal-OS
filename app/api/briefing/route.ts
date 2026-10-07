import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { ask, type ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The system prompt for contract generation. It is sent to their model, not
 * printed anywhere the customer sees, and it keeps the AI inside the boundary
 * the owner set: residential remodeling in Lee County, Florida.
 */
const HOUSE_STYLE = `You are Royal, the business intelligence assistant for Royal Lion Renovations LLC,
a residential remodeling and renovation company in Lee County, Florida. The owner is the CEO and you answer to them.

Rules you must never break:
1. Use only the figures given to you in the CONTEXT block below. Never invent, estimate or recall a number that is not there.
2. If a figure is missing, say plainly that it is not available and name which page would hold it.
3. You are not a CPA, lawyer or financial adviser. When a question touches tax, legal or investment decisions, say so and recommend confirming with their own CPA.
4. Be brief. Lead with the number or the answer, then one sentence of what it means, then one recommended action.
5. Never pad, never flatter, never use filler phrases.`;

type BriefingContext = {
  greeting: string;
  revenue: string;
  netProfit: string;
  grossMargin: string;
  openPipeline: string;
  hotLeads: number;
  unanswered: number;
  estimatesWaiting: number;
  overdueInvoices: number;
  cashOnHand: string;
  taxReserve: string;
  leadingService: string | null;
  adSpend: string;
  costPerLead: string | null;
  projectsActive: number;
  projectsDelayed: number;
  ownerPay: string;
  personalSpend: string;
  notes: string[];
};

/** Every number is counted here, on the server, from the real tables. */
async function buildContext(): Promise<BriefingContext> {
  const sb = supabaseServer();

  const [txns, leads, ests, invs, accs, chan, proj, per, pay] = await Promise.all([
    sb.from('transactions').select('txn_date, amount, type, category, description').eq('ownership', 'BUSINESS'),
    sb.from('leads').select('status, ai_score, estimated_value, is_hot'),
    sb.from('estimates').select('status'),
    sb.from('invoices').select('status, amount, due_date'),
    sb.from('accounts').select('balance, kind'),
    sb.from('marketing_channels').select('spend, leads_count'),
    sb.from('projects').select('status'),
    sb.from('personal_transactions').select('type, amount, category, txn_date'),
    sb.from('owner_distributions').select('amount, paid_on')
  ]);

  const rows = txns.data || [];
  const leadRows = leads.data || [];
  const estRows = ests.data || [];
  const invRows = invs.data || [];
  const accRows = accs.data || [];
  const chanRows = chan.data || [];
  const projRows = proj.data || [];
  const perRows = per.data || [];
  const payRows = pay.data || [];

  const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let revenue = 0, expenses = 0, cogs = 0, cash = 0, taxHeld = 0;
  const serviceRevenue: Record<string, number> = {};

  accRows.forEach((a) => {
    const b = Number(a.balance) || 0;
    cash += b;
    if (a.kind === 'TAX_RESERVE') taxHeld += b;
  });

  rows.forEach((t) => {
    const d = new Date(t.txn_date);
    if (d.getMonth() !== thisMonth || d.getFullYear() !== thisYear) return;
    const amt = Number(t.amount) || 0;
    if (t.type === 'Income') {
      revenue += amt;
      const key = (t.description || 'other').replace(/^[^-]*-\s*/, '').slice(0, 28).toLowerCase() || 'other';
      serviceRevenue[key] = (serviceRevenue[key] || 0) + amt;
    } else {
      expenses += amt;
      if (['Materials', 'Subcontract labor', 'Labor'].includes(t.category)) cogs += amt;
    }
  });

  const grossMargin = revenue ? (revenue - cogs) / revenue : 0;
  const netProfit = revenue - expenses;

  let openPipeline = 0, hot = 0, unanswered = 0;
  leadRows.forEach((l) => {
    if (!['WON', 'LOST', 'NOT_QUALIFIED', 'DISMISSED'].includes(l.status)) {
      openPipeline += Number(l.estimated_value) || 0;
    }
    if (l.is_hot || (l.ai_score || 0) >= 80) hot += 1;
    if (['NEW', 'REVIEW', 'QUALIFIED'].includes(l.status)) unanswered += 1;
  });

  const estimatesWaiting = estRows.filter((e) => ['DRAFT', 'AI_REVIEW', 'WAITING_APPROVAL'].includes(e.status)).length;
  const overdueInvoices = invRows.filter((i) => i.status === 'OVERDUE').length;

  const adSpend = chanRows.reduce((s, c) => s + (Number(c.spend) || 0), 0);
  const adLeads = chanRows.reduce((s, c) => s + (Number(c.leads_count) || 0), 0);

  const ownerPay = payRows
    .filter((p) => new Date(p.paid_on).getMonth() === thisMonth)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const personalSpend = perRows
    .filter((p) => p.type === 'Expense' && new Date(p.txn_date).getMonth() === thisMonth)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const leadingService = Object.keys(serviceRevenue).sort((a, b) => serviceRevenue[b] - serviceRevenue[a])[0] || null;

  const notes: string[] = [];
  if (!rows.length) notes.push('No business transactions are recorded yet, so revenue figures are genuinely zero rather than missing.');
  if (grossMargin && grossMargin < 0.35) notes.push('Gross margin is below the 35% floor set in Settings.');
  if (overdueInvoices) notes.push(overdueInvoices + ' invoice(s) are past their due date.');
  if (hot) notes.push(hot + ' lead(s) are scoring 80 or above and deserve a call today.');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return {
    greeting,
    revenue: money(revenue),
    netProfit: money(netProfit),
    grossMargin: pct(grossMargin),
    openPipeline: money(openPipeline),
    hotLeads: hot,
    unanswered,
    estimatesWaiting,
    cashOnHand: money(cash),
    taxReserve: money(Math.max(0, netProfit) * 0.27) + ' suggested, ' + money(taxHeld) + ' actually in the tax reserve',
    leadingService,
    adSpend: money(adSpend),
    costPerLead: adLeads ? money(adSpend / adLeads) : null,
    projectsActive: projRows.filter((p) => p.status === 'ACTIVE').length,
    projectsDelayed: projRows.filter((p) => p.status === 'DELAYED').length,
    ownerPay: money(ownerPay),
    personalSpend: money(personalSpend),
    notes
  };
}

export async function POST() {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const c = await buildContext();

  const contextBlock = [
    'CONTEXT. Every figure below was counted from the company database a moment ago.',
    'Month: ' + new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    'Revenue this month: ' + c.revenue,
    'Net profit this month: ' + c.netProfit,
    'Gross margin this month: ' + c.grossMargin,
    'Cash across all recorded accounts: ' + c.cashOnHand,
    'Tax position: ' + c.taxReserve,
    'Open pipeline value: ' + c.openPipeline,
    'Hot leads (score 80+): ' + c.hotLeads,
    'Leads with no reply yet: ' + c.unanswered,
    'Estimates waiting for the CEO: ' + c.estimatesWaiting,
    'Overdue invoices: ' + c.overdueInvoices,
    'Active projects: ' + c.projectsActive,
    'Delayed projects: ' + c.projectsDelayed,
    'Advertising spend recorded: ' + c.adSpend,
    'Cost per lead: ' + (c.costPerLead || 'not enough data'),
    'Strongest revenue line this month: ' + (c.leadingService || 'not enough data'),
    'Owner pay taken this month: ' + c.ownerPay,
    'Personal spending recorded this month: ' + c.personalSpend,
    'Notes from the system: ' + (c.notes.join(' | ') || 'none')
  ].join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: HOUSE_STYLE },
    {
      role: 'user',
      content:
        contextBlock +
        '\n\nWrite the daily briefing for the CEO. Start with the greeting above. ' +
        'Keep it under 160 words. Follow this shape:\n' +
        '- Two or three sentences on how the business is doing, using the numbers.\n' +
        '- Anything that needs attention, named with its figure.\n' +
        '- Then a numbered list of at most four priorities for today, each one a real action, each one drawn from the context.\n' +
        'If a figure is unavailable, say so instead of guessing.'
    }
  ];

  const result = await ask(messages, {
    agentSlug: 'royal',
    purpose: 'daily_briefing',
    userId: user.id,
    maxTokens: 700,
    temperature: 0.4
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message, context: c });
  }

  return NextResponse.json({ ok: true, briefing: result.text, costCents: result.costCents, context: c });
}

export async function GET() {
  return POST();
}
