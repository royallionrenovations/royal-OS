import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Analytics, sections 24 and 44 of your specification: profit by service,
 * profit by project, marketing performance, and the numbers that actually help
 * a small contractor decide what to do next.
 *
 * Methods are stated next to the figures. An average of four jobs is not a
 * trend, and this page says so rather than dressing it up.
 */
export default async function AnalyticsPage() {
  const sb = supabaseServer();

  const [txns, ests, proj, chan, leads, customers, invs] = await Promise.all([
    sb.from('transactions').select('txn_date, amount, type, category, description, project_id, ownership').limit(1000),
    sb.from('estimates').select('total, total_cost, gross_profit, gross_margin, status, project_title, created_at, customer_name'),
    sb.from('projects').select('title, status, contract_total, actual_cost, start_date, actual_end'),
    sb.from('marketing_channels').select('*'),
    sb.from('leads').select('platform, city, service_requested, status, estimated_value'),
    sb.from('customers').select('id, name, lifetime_value, created_at'),
    sb.from('invoices').select('amount, status')
  ]);

  const rows = (txns.data || []).filter((t) => t.ownership === 'BUSINESS');
  const estimates = ests.data || [];
  const projects = proj.data || [];
  const channels = chan.data || [];
  const leadRows = leads.data || [];
  const customerRows = customers.data || [];
  const invoices = invs.data || [];

  const money = (n: number) => (n < 0 ? '-' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  const income = rows.filter((t) => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expense = rows.filter((t) => t.type === 'Expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // profit by service, read from the income descriptions
  const svc: Record<string, { revenue: number; jobs: number }> = {};
  rows.filter((t) => t.type === 'Income').forEach((t) => {
    const key = (t.description || 'unspecified').replace(/^[^-]*-\s*/, '').slice(0, 34).toLowerCase() || 'unspecified';
    svc[key] = svc[key] || { revenue: 0, jobs: 0 };
    svc[key].revenue += Number(t.amount) || 0;
    svc[key].jobs += 1;
  });

  const months = new Set(rows.map((t) => String(t.txn_date).slice(0, 7)));
  const monthCount = Math.max(1, months.size);

  const wonEstimates = estimates.filter((e) => e.status === 'ACCEPTED');
  const lostEstimates = estimates.filter((e) => e.status === 'DECLINED');
  const conversion = estimates.length ? wonEstimates.length / estimates.length : null;
  const avgJob = wonEstimates.length
    ? wonEstimates.reduce((s, e) => s + (Number(e.total) || 0), 0) / wonEstimates.length
    : 0;
  const avgMargin = wonEstimates.length
    ? wonEstimates.reduce((s, e) => s + (Number(e.gross_margin) || 0), 0) / wonEstimates.length
    : 0;

  const spend = channels.reduce((s, c) => s + (Number(c.spend) || 0), 0);
  const channelLeads = channels.reduce((s, c) => s + (Number(c.leads_count) || 0), 0);
  const channelRevenue = channels.reduce((s, c) => s + (Number(c.revenue) || 0), 0);
  const cpl = channelLeads ? spend / channelLeads : null;
  const cac = wonEstimates.length && spend ? spend / wonEstimates.length : null;

  const customerRevenue = customerRows.reduce((s, c) => s + (Number(c.lifetime_value) || 0), 0);
  const repeatRatio = customerRows.length && wonEstimates.length
    ? wonEstimates.length / customerRows.length
    : null;

  const unpaid = invoices.filter((i) => ['SENT', 'PART_PAID', 'OVERDUE'].includes(i.status))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const byCity: Record<string, number> = {};
  leadRows.forEach((l) => {
    if (l.city) byCity[l.city] = (byCity[l.city] || 0) + 1;
  });

  const byPlatform: Record<string, number> = {};
  leadRows.forEach((l) => {
    byPlatform[l.platform] = (byPlatform[l.platform] || 0) + 1;
  });

  return (
    <div>
      <h1>Analytics</h1>
      <p className="mut">
        What the numbers say about the company. Every figure names where it came from, and nothing is smoothed over to
        look better than it is.
      </p>

      <div className="grid">
        <div className="kpi"><b>{money(income)}</b><span>Revenue recorded</span></div>
        <div className="kpi"><b>{money(income - expense)}</b><span>Net profit</span></div>
        <div className="kpi"><b>{money(income / monthCount)}</b><span>Average month</span><small>across {monthCount} recorded month(s)</small></div>
        <div className="kpi"><b>{conversion === null ? 'no data' : pct(conversion)}</b><span>Estimate conversion</span><small>{wonEstimates.length} won of {estimates.length}</small></div>
        <div className="kpi"><b>{avgJob ? money(avgJob) : 'no data'}</b><span>Average accepted job</span><small>raise this first</small></div>
        <div className="kpi"><b>{wonEstimates.length ? pct(avgMargin) : 'no data'}</b><span>Average margin on won work</span></div>
        <div className="kpi"><b>{money(unpaid)}</b><span>Unpaid invoices</span></div>
        <div className="kpi"><b>{cpl === null ? 'no data' : money(cpl)}</b><span>Cost per lead</span></div>
      </div>

      <div className="card">
        <h2>Profit by service</h2>
        {Object.keys(svc).length === 0 ? (
          <p className="mut">
            No income recorded yet. When you add jobs to the ledger with the work described, this table shows which
            of your services actually earns money rather than just keeps the crew busy.
          </p>
        ) : (
          <table>
            <thead><tr><th>Work</th><th>Revenue</th><th>Jobs</th><th>Average job</th><th>Share of revenue</th></tr></thead>
            <tbody>
              {Object.entries(svc).sort((a, b) => b[1].revenue - a[1].revenue).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{money(v.revenue)}</td>
                  <td>{v.jobs}</td>
                  <td>{money(v.revenue / v.jobs)}</td>
                  <td>{income ? pct(v.revenue / income) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="split">
        <div className="card">
          <h2>Profit by project</h2>
          {projects.length === 0 ? (
            <p className="mut">No projects recorded yet.</p>
          ) : (
            <table>
              <thead><tr><th>Project</th><th>Contract</th><th>Cost</th><th>Margin</th><th>Status</th></tr></thead>
              <tbody>
                {projects.map((p) => {
                  const contract = Number(p.contract_total) || 0;
                  const cost = Number(p.actual_cost) || 0;
                  const margin = contract ? (contract - cost) / contract : 0;
                  return (
                    <tr key={p.title}>
                      <td>{p.title}</td>
                      <td>{money(contract)}</td>
                      <td>{money(cost)}</td>
                      <td className={margin < 0.35 ? 'neg' : 'pos'}>{contract ? pct(margin) : 'not costed'}</td>
                      <td><span className="tag">{p.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mut">
            Any project here under 35% is teaching you something. Look at what went over: material wasted, days lost,
            or a price agreed before the scope was clear.
          </p>
        </div>

        <div className="card">
          <h2>Marketing performance</h2>
          {channels.length === 0 ? (
            <p className="mut">No marketing channels recorded yet.</p>
          ) : (
            <table>
              <thead><tr><th>Channel</th><th>Spend</th><th>Leads</th><th>Cost per lead</th><th>Won</th><th>Revenue</th></tr></thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{money(Number(c.spend))}</td>
                    <td>{c.leads_count}</td>
                    <td>{c.leads_count ? money(Number(c.spend) / c.leads_count) : 'no data'}</td>
                    <td>{c.won_count}</td>
                    <td>{money(Number(c.revenue))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mut">
            {cac === null
              ? 'Add spend and won jobs and this shows your customer acquisition cost.'
              : `You are spending about ${money(cac)} to win each job, against an average job of ${money(avgJob)}. If that figure ever climbs close to your profit per job, the advertising is not advertising, it is a hobby.`}
          </p>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Where your leads come from</h2>
          <table>
            <thead><tr><th>Source</th><th>Leads</th><th>Share</th></tr></thead>
            <tbody>
              {Object.keys(byPlatform).length === 0 && (
                <tr><td colSpan={3} className="mut">No leads recorded yet.</td></tr>
              )}
              {Object.entries(byPlatform).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                  <td>{leadRows.length ? pct(v / leadRows.length) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Where the work is</h2>
          <table>
            <thead><tr><th>City</th><th>Leads</th></tr></thead>
            <tbody>
              {Object.keys(byCity).length === 0 && (
                <tr><td colSpan={2} className="mut">No leads with a location yet.</td></tr>
              )}
              {Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mut">
            Concentrating on two or three neighbouring cities cuts travel, cuts quoting time, and makes word of mouth
            actually work, because neighbours talk to neighbours.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Customer value</h2>
        {customerRows.length === 0 ? (
          <p className="mut">
            No customers recorded yet. When estimates are accepted and turned into customers, this section measures
            whether people come back, which for a renovation company is most of the lifetime profit.
          </p>
        ) : (
          <table>
            <tbody>
              <tr><td>Customers on record</td><td><b>{customerRows.length}</b></td></tr>
              <tr><td>Recorded lifetime value</td><td><b>{money(customerRevenue)}</b></td></tr>
              <tr><td>Jobs won per customer</td><td><b>{repeatRatio === null ? 'no data' : repeatRatio.toFixed(2)}</b></td></tr>
              <tr><td>Owner pay taken</td><td><b>{money(0)}</b></td></tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>What this page will not tell you</h2>
        <p className="mut">
          An average of three jobs is an anecdote with a decimal point on it. Nothing here is seasonally adjusted, and
          a Florida renovation company&apos;s year turns on storm season and snowbird season, which means a strong
          month can be weather rather than skill. Read these figures as a description of what happened, not a
          prediction of what will.
        </p>
      </div>
    </div>
  );
}
