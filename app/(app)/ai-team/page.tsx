import { supabaseServer } from '@/lib/supabase';
import { budget } from '@/lib/ai';
import AgentRunner from './runner';

export const dynamic = 'force-dynamic';

/**
 * The AI team room. Your specification names six agents and insists nothing is
 * published or changed without the CEO approving it. This page is the roster:
 * each agent's job, whether its seat is switched on, and a button to run it.
 *
 * Honest note about the seats: a seat marked ACTIVE means the agent runs when
 * you press its button here. Nothing in this system runs on a timer by itself,
 * and it cannot publish to a social platform. Where the specification asks for
 * agents that act while you sleep, that needs a scheduler on Vercel plus the
 * platform's own publishing approval, which is the next stage after the deploy.
 */
export default async function AiTeamPage() {
  const sb = supabaseServer();

  const [agents, usage, b] = await Promise.all([
    sb.from('ai_agents').select('*').order('department'),
    sb.from('ai_usage').select('agent_slug, cost_cents, created_at').order('created_at', { ascending: false }).limit(300),
    budget()
  ]);

  const rows = agents.data || [];
  const money = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const spend: Record<string, number> = {};
  (usage.data || []).forEach((u) => {
    const k = u.agent_slug || 'royal';
    spend[k] = (spend[k] || 0) + Number(u.cost_cents || 0) / 100;
  });

  const active = rows.filter((a) => a.status === 'ACTIVE');

  return (
    <div>
      <h1>AI Team</h1>
      <p className="mut">
        Six seats, one job each. You switch a seat on, you run it, and you approve what it produces. Nothing acts
        behind your back.
      </p>

      <div className="grid">
        <div className="kpi"><b>{active.length} / {rows.length}</b><span>Seats switched on</span></div>
        <div className="kpi">
          <b>{money(rows.filter((a) => a.status === 'ACTIVE').reduce((s, a) => s + (Number(a.monthly_cost) || 0), 0))}</b>
          <span>Planned monthly cost</span><small>your own estimate per seat</small>
        </div>
        <div className="kpi">
          <b>{money((b.used) / 100)}</b>
          <span>Spent on AI today</span><small>of {money(b.cap / 100)} allowed</small>
        </div>
        <div className="kpi">
          <b>{money(Object.values(spend).reduce((s, v) => s + v, 0))}</b>
          <span>Spent on AI, recent runs</span>
        </div>
      </div>

      {!b.ok && (
        <div className="note bad">
          <b>Today&apos;s AI budget is spent.</b> The agents will refuse to run until tomorrow, or until you raise
          MAX_DAILY_AI_CENTS. Nothing was quietly charged.
        </div>
      )}

      <AgentRunner agents={rows} spend={spend} />

      <div className="card">
        <h2>The seats</h2>
        <table>
          <thead>
            <tr><th>Seat</th><th>Department</th><th>One job</th><th>Status</th><th>Planned cost</th><th>Last run</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.slug}>
                <td><b>{a.name}</b></td>
                <td>{a.department}</td>
                <td className="mut">{a.job}</td>
                <td><span className="tag">{a.status}</span></td>
                <td>{money(Number(a.monthly_cost) || 0)}</td>
                <td className="mut">{a.last_run_at ? new Date(a.last_run_at).toLocaleString('en-US') : 'never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mut">
          The planned cost column is your own estimate of what the seat is worth to the company. The real AI cost is
          the spending figures above, which are measured from every call actually made.
        </p>
      </div>

      <div className="card">
        <h2>What these agents will not do</h2>
        <ul className="mut">
          <li>They will not invent a number. Every figure is passed to them from your database.</li>
          <li>They will not publish to social media, send email or text anyone. They produce drafts and opinions for you to approve.</li>
          <li>Max will not invent reviews, awards or certifications for Royal Lion.</li>
          <li>Luna will not suggest contacting anyone in a way that breaks a platform&apos;s rules or telemarketing law.</li>
          <li>Roy and Lion will tell you they are not your CPA when a question turns to tax.</li>
        </ul>
      </div>
    </div>
  );
}
