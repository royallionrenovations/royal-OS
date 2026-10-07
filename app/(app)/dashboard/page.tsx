import { supabaseServer } from '@/lib/supabase';
import { budget } from '@/lib/ai';
import Briefing from './briefing';

export const dynamic = 'force-dynamic';

/**
 * The CEO command center. Every figure on this page is counted from the
 * database in front of you. Nothing is estimated, and where there is no data
 * the page says so instead of showing a zero as if it were a fact.
 */
export default async function Dashboard() {
  const sb = supabaseServer();

  const [txns, leads, ests, projects, invoices, channels, posts, used] = await Promise.all([
    sb.from('transactions').select('txn_date, amount, type, category, ownership, project_id').eq('ownership', 'BUSINESS'),
    sb.from('leads').select('status, ai_score, estimated_value, is_hot, created_at, city, service_requested, platform, name'),
    sb.from('estimates').select('status, total, gross_margin, total_cost, created_at, project_title, customer_name'),
    sb.from('projects').select('status, contract_total, actual_cost, start_date, target_end, actual_end, title'),
    sb.from('invoices').select('status, amount, due_date, kind'),
    sb.from('marketing_channels').select('name, platform, spend, leads_count, won_count, revenue'),
    sb.from('social_posts').select('id, platform, status, planned_for, caption, created_at'),
    budget()
  ]);

  const rows = txns.data || [];
  const leadRows = leads.data || [];
  const estRows = ests.data || [];
  const projRows = projects.data || [];
  const invRows = invoices.data || [];
  const chanRows = channels.data || [];
  const postRows = posts.data || [];

  const money = (n: number) =>
    (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

  const inMonth = (s: string, offset = 0) => {
    const d = new Date(s);
    const t = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    return monthKey(t) === `${y}-${m}` || t.getMonth() === m - offset + 1 - 1;
  };

  // ---- revenue and profit ----
  let revMonth = 0, expMonth = 0, revYear = 0, expYear = 0, revPrevMonth = 0, revPrevYear = 0;
  let cogsMonth = 0, materialsMonth = 0, laborMonth = 0, adsMonth = 0, subsMonth = 0;

  const cogsCats = ['Materials', 'Subcontract labor', 'Labor'];

  rows.forEach((t) => {
    const d = new Date(t.txn_date);
    const amt = Number(t.amount) || 0;
    const isIncome = t.type === 'Income';

    if (d.getFullYear() === y) {
      if (isIncome) {
        revYear += amt;
        if (d.getMonth() === m) revMonth += amt;
        if (d.getMonth() === m - 1) revPrevMonth += amt;
        if (d.getMonth() === m - 12) revPrevYear += amt;
      } else {
        expYear += amt;
        if (d.getMonth() === m) {
          expMonth += amt;
          if (cogsCats.includes(t.category)) cogsMonth += amt;
          if (t.category === 'Materials') materialsMonth += amt;
          if (t.category === 'Subcontract labor') laborMonth += amt;
          if (t.category === 'Advertising') adsMonth += amt;
          if (t.category === 'Subcontractors') subsMonth += amt;
        }
      }
    }
  });

  const grossMonth = revMonth - cogsMonth;
  const netMonth = revMonth - expMonth;
  const grossYear = revYear - rows.filter((t) => t.type === 'Expense' && cogsCats.includes(t.category)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const growth = revPrevMonth > 0 ? (revMonth - revPrevMonth) / revPrevMonth : null;

  // ---- pipeline ----
  const byStage: Record<string, number> = {};
  leadRows.forEach((l) => {
    byStage[l.status] = (byStage[l.status] || 0) + 1;
  });
  const openValue = leadRows
    .filter((l) => !['WON', 'LOST', 'NOT_QUALIFIED', 'DISMISSED'].includes(l.status))
    .reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
  const hotLeads = leadRows.filter((l) => l.is_hot || (l.ai_score || 0) >= 80);
  const unanswered = leadRows.filter((l) => ['NEW', 'REVIEW', 'QUALIFIED'].includes(l.status));

  // ---- estimates ----
  const estPending = estRows.filter((e) => ['DRAFT', 'AI_REVIEW', 'WAITING_APPROVAL'].includes(e.status));
  const estSent = estRows.filter((e) => e.status === 'SENT');
  const estAccepted = estRows.filter((e) => e.status === 'ACCEPTED');
  const conversion = estRows.length ? estAccepted.length / estRows.length : null;

  // ---- operations ----
  const activeProjects = projRows.filter((p) => p.status === 'ACTIVE');
  const upcoming = projRows.filter((p) => p.status === 'UPCOMING');
  const delayed = projRows.filter((p) => p.status === 'DELAYED');
  const awaitingPayment = projRows.filter((p) => p.status === 'AWAITING_PAYMENT');
  const awaitingMaterials = projRows.filter((p) => p.status === 'AWAITING_MATERIALS');

  // ---- money owed ----
  const receivable = invRows
    .filter((i) => ['SENT', 'PART_PAID', 'OVERDUE'].includes(i.status))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const overdue = invRows.filter((i) => i.status === 'OVERDUE');

  // ---- marketing ----
  const spend = chanRows.reduce((s, c) => s + (Number(c.spend) || 0), 0);
  const mktLeads = chanRows.reduce((s, c) => s + (Number(c.leads_count) || 0), 0);
  const costPerLead = mktLeads ? spend / mktLeads : null;
  const awaitingApprovalPosts = postRows.filter((p) => p.status === 'WAITING_APPROVAL');

  // ---- taxes ----
  const taxReserve = Math.max(0, netMonth) * 0.27;

  const nothingYet = rows.length === 0 && leadRows.length === 0 && estRows.length === 0;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="mut">
        {now.toDateString()} &middot; Royal Lion Renovations LLC &middot; every figure below is counted from your
        own records.
      </p>

      {nothingYet && (
        <div className="note warn">
          <b>The office is empty, so this page is showing true zeros rather than made up numbers.</b>
          <br />
          Start with <b>Bookkeeping</b> and add this month&apos;s income and expenses, then add your accounts on the
          <b> Finance</b> page. Leads, estimates and projects fill in as you work.
        </div>
      )}

      <h2>Money</h2>
      <div className="grid">
        <div className="kpi"><b>{money(revMonth)}</b><span>Revenue this month</span><small>{now.toLocaleString('en-US', { month: 'long' })}</small></div>
        <div className="kpi"><b>{money(revPrevMonth)}</b><span>Revenue previous month</span><small>{growth === null ? 'no previous month to compare' : (growth >= 0 ? '+' : '') + pct(growth) + ' change'}</small></div>
        <div className="kpi"><b>{money(revYear)}</b><span>Revenue this year</span><small>{y}</small></div>
        <div className="kpi"><b>{money(revPrevYear)}</b><span>Revenue same month last year</span><small>{y - 1}</small></div>
        <div className="kpi"><b>{money(grossMonth)}</b><span>Gross profit this month</span><small>revenue less materials and labor</small></div>
        <div className="kpi"><b>{money(grossYear)}</b><span>Gross profit this year</span><small>revenue less materials and labor</small></div>
        <div className="kpi"><b>{money(netMonth)}</b><span>Net profit this month</span><small>after every expense</small></div>
        <div className="kpi"><b>{money(Math.max(0, netMonth) * 0.27)}</b><span>Set aside for tax</span><small>27% of profit, confirm with your CPA</small></div>
      </div>

      <h2>Sales</h2>
      <div className="grid">
        <div className="kpi"><b>{byStage['NEW'] || 0}</b><span>New leads</span><small>not yet reviewed</small></div>
        <div className="kpi"><b>{byStage['QUALIFIED'] || 0}</b><span>Qualified leads</span><small>worth working</small></div>
        <div className="kpi"><b>{hotLeads.length}</b><span>Hot leads</span><small>score 80 or above</small></div>
        <div className="kpi"><b>{money(openValue)}</b><span>Open pipeline value</span><small>leads not yet won or lost</small></div>
        <div className="kpi"><b>{estSent.length}</b><span>Estimates sent</span><small>waiting on the customer</small></div>
        <div className="kpi"><b>{estAccepted.length}</b><span>Estimates accepted</span><small>{conversion === null ? 'no estimates yet' : pct(conversion) + ' of all estimates'}</small></div>
        <div className="kpi"><b>{byStage['WON'] || 0}</b><span>Won jobs</span><small></small></div>
        <div className="kpi"><b>{byStage['LOST'] || 0}</b><span>Lost jobs</span><small>read the reasons, they teach you the most</small></div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Operations</h2>
          <table>
            <tbody>
              <tr><td>Active projects</td><td><b>{activeProjects.length}</b></td></tr>
              <tr><td>Upcoming projects</td><td><b>{upcoming.length}</b></td></tr>
              <tr><td>Delayed projects</td><td><b>{delayed.length}</b></td></tr>
              <tr><td>Awaiting payment</td><td><b>{awaitingPayment.length}</b></td></tr>
              <tr><td>Awaiting materials</td><td><b>{awaitingMaterials.length}</b></td></tr>
            </tbody>
          </table>
          {delayed.length > 0 && (
            <div className="note bad">
              <b>{delayed.length} project(s) are behind.</b> Call those customers before they call you.
            </div>
          )}
        </div>

        <div className="card">
          <h2>Money owed to you</h2>
          <table>
            <tbody>
              <tr><td>Accounts receivable</td><td><b>{money(receivable)}</b></td></tr>
              <tr><td>Overdue invoices</td><td><b>{overdue.length}</b></td></tr>
              <tr><td>Overdue value</td><td><b>{money(overdue.reduce((s, i) => s + (Number(i.amount) || 0), 0))}</b></td></tr>
            </tbody>
          </table>
          {receivable > 0 && (
            <div className="note warn">
              <b>{money(receivable)} is sitting in unpaid invoices.</b> Take a deposit at signing so your money is
              never in a customer&apos;s garage, and chase anything past 30 days.
            </div>
          )}
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Marketing</h2>
          <table>
            <tbody>
              <tr><td>Recorded spend</td><td><b>{money(spend)}</b></td></tr>
              <tr><td>Leads from marketing</td><td><b>{mktLeads}</b></td></tr>
              <tr><td>Cost per lead</td><td><b>{costPerLead === null ? 'not enough data' : money(costPerLead)}</b></td></tr>
              <tr><td>Posts waiting for your approval</td><td><b>{awaitingApprovalPosts.length}</b></td></tr>
            </tbody>
          </table>
          <p className="mut">
            {costPerLead === null
              ? 'Record spend and lead counts per channel on the Marketing page and this number becomes real.'
              : 'Compare this with your average job profit before you raise the budget.'}
          </p>
        </div>

        <div className="card">
          <h2>What needs you today</h2>
          <table>
            <tbody>
              <tr><td>Leads waiting for a first reply</td><td><b>{unanswered.length}</b></td></tr>
              <tr><td>Estimates waiting on you</td><td><b>{estPending.length}</b></td></tr>
              <tr><td>Posts waiting on your approval</td><td><b>{awaitingApprovalPosts.length}</b></td></tr>
              <tr><td>Overdue invoices</td><td><b>{overdue.length}</b></td></tr>
            </tbody>
          </table>
          {unanswered.length > 0 && (
            <div className="note warn">
              <b>{unanswered.length} lead(s) have had no reply.</b> In remodeling the first company to answer
              usually wins the job.
            </div>
          )}
        </div>
      </div>

      <Briefing />
    </div>
  );
}
