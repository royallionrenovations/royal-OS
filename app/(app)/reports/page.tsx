import { supabaseServer } from '@/lib/supabase';
import { budget } from '@/lib/ai';

export const dynamic = 'force-dynamic';

/**
 * Reports, sections 37 and 45 of your specification.
 *
 * Each report is generated on request rather than on a schedule, because a
 * scheduled job needs a Vercel cron entry and a decision from you about when you
 * want to read it. The figures come from your records; the commentary comes from
 * the agent whose department it belongs to.
 */
export default async function ReportsPage() {
  const sb = supabaseServer();

  const [reports, settings, b, agents] = await Promise.all([
    sb.from('reports').select('*').order('created_at', { ascending: false }).limit(40),
    sb.from('company_settings').select('legal_name, service_areas, services').single(),
    budget(),
    sb.from('ai_agents').select('slug, name, department, status')
  ]);

  const rows = reports.data || [];
  const money = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <h1>Reports</h1>
      <p className="mut">
        The written summaries your agents produce. Each one stores a copy, so you can see what you were told last
        month next to what actually happened.
      </p>

      <div className="grid">
        <div className="kpi"><b>{rows.length}</b><span>Reports on record</span></div>
        <div className="kpi"><b>{rows.filter((r) => r.status === 'NEW').length}</b><span>Unread</span></div>
        <div className="kpi"><b>{money(b.used / 100)}</b><span>AI spent today</span><small>of {money(b.cap / 100)} allowed</small></div>
        <div className="kpi"><b>{(agents.data || []).filter((a) => a.status === 'ACTIVE').length}</b><span>Live agents</span></div>
      </div>

      {!b.ok && (
        <div className="note bad">
          <b>Today&apos;s AI budget is spent</b>, so no new report can be written until tomorrow. Raise
          MAX_DAILY_AI_CENTS if you want a higher limit. Nothing was charged without telling you.
        </div>
      )}

      <div className="card">
        <h2>What the office can write for you</h2>
        <p className="mut">
          Every report is written from your own figures, gathered on the server before the model sees anything. It is
          handed the numbers and told to say so when something is missing, so a report will never invent a total.
        </p>
        <table>
          <thead><tr><th>Report</th><th>Who writes it</th><th>What it covers</th></tr></thead>
          <tbody>
            <tr>
              <td><b>CEO daily briefing</b></td>
              <td>Royal</td>
              <td>The briefing on the Dashboard: how the business is doing, what needs attention, and today&apos;s priorities.</td>
            </tr>
            <tr>
              <td><b>Marketing report</b></td>
              <td>Max</td>
              <td>What worked, what failed, which channel produces the cheapest leads, and what to post this week.</td>
            </tr>
            <tr>
              <td><b>Lead report</b></td>
              <td>Luna</td>
              <td>The pipeline, which leads to call first, where they came from, and what that says about where to hunt.</td>
            </tr>
            <tr>
              <td><b>Finance report</b></td>
              <td>Roy</td>
              <td>Margin, cash, what you are owed, what is leaking, and what to do with the profit. Educational, not tax advice.</td>
            </tr>
            <tr>
              <td><b>Estimate review</b></td>
              <td>Leo</td>
              <td>A risk opinion on each estimate awaiting your approval: material risk, site risk, and what to confirm.</td>
            </tr>
            <tr>
              <td><b>Strategy review</b></td>
              <td>Lion</td>
              <td>The whole company: up to three moves in priority order, with the reasoning and what could go wrong.</td>
            </tr>
          </tbody>
        </table>
        <p className="mut">
          Run them from the <b>AI Team</b> page, where each seat has its own button and its own cost line.
        </p>
      </div>

      <div className="card">
        <h2>Reports on record</h2>
        {rows.length === 0 ? (
          <p className="mut">
            Nothing yet. The first briefing is written when you open the Dashboard. Everything else you ask for on the
            AI Team page, and it lands here.
          </p>
        ) : (
          <table>
            <thead><tr><th>When</th><th>Report</th><th>Written by</th><th>Body</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mut">{new Date(r.created_at).toLocaleDateString('en-US')}</td>
                  <td><b>{r.title}</b><br /><span className="tag">{r.kind.replace(/_/g, ' ')}</span></td>
                  <td>{r.data?.agent || ''}</td>
                  <td className="mut" style={{ whiteSpace: 'pre-wrap' }}>{r.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Why there is no scheduled email yet</h2>
        <p className="mut">
          Your specification asks for weekly and monthly reports sent automatically. That needs two things that do not
          exist yet: a scheduled job on Vercel, which is a few lines in a config file, and somewhere for the email to
          be sent from, which means an email service account you own. Both are worth doing and neither is guessable
          from my side, because they need your accounts. When you want it, ask and I will add it.
        </p>
      </div>

      <div className="card">
        <h2>On the accuracy of these reports</h2>
        <p className="mut">
          A report is only as good as the records behind it. If a month of jobs is missing from the ledger, the report
          will describe a smaller company than you actually run, and it will do so confidently. Read the figure, then
          spot check it against your bank at the end of each month before you make a decision on it.
        </p>
      </div>
    </div>
  );
}
