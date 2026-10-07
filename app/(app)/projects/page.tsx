import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Customers, contracts and projects, sections 28 to 30 of your specification.
 * Kept on one page because in a company this size they are one story: a person,
 * a signed job, and the work happening at their house.
 */
export default async function ProjectsPage() {
  const sb = supabaseServer();

  const [customers, projects, contracts, changes, tasks, invoices] = await Promise.all([
    sb.from('customers').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('projects').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('contracts').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('change_orders').select('*').limit(200),
    sb.from('project_tasks').select('*').order('sort_order').limit(400),
    sb.from('invoices').select('*').limit(200)
  ]);

  const people = customers.data || [];
  const jobs = projects.data || [];
  const signed = contracts.data || [];
  const orders = changes.data || [];
  const taskRows = tasks.data || [];
  const invoiceRows = invoices.data || [];

  const money = (n: number) => (n < 0 ? '-' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

  const active = jobs.filter((p) => p.status === 'ACTIVE');
  const upcoming = jobs.filter((p) => p.status === 'UPCOMING');
  const delayed = jobs.filter((p) => p.status === 'DELAYED');
  const done = jobs.filter((p) => p.status === 'COMPLETE');

  const contractTotal = jobs.reduce((s, p) => s + (Number(p.contract_total) || 0), 0);
  const changeTotal = orders.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const costToDate = jobs.reduce((s, p) => s + (Number(p.actual_cost) || 0), 0);
  const billed = invoiceRows.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const collected = invoiceRows.filter((i) => i.status === 'PAID').reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return (
    <div>
      <h1>Projects</h1>
      <p className="mut">
        Customers, signed contracts, the work in progress, and the change orders that quietly decide whether a job
        makes money.
      </p>

      <div className="grid">
        <div className="kpi"><b>{people.length}</b><span>Customers</span></div>
        <div className="kpi"><b>{active.length}</b><span>Active projects</span></div>
        <div className="kpi"><b>{upcoming.length}</b><span>Upcoming</span></div>
        <div className="kpi"><b>{delayed.length}</b><span>Delayed</span></div>
        <div className="kpi"><b>{money(contractTotal + changeTotal)}</b><span>Total contracted</span><small>including change orders</small></div>
        <div className="kpi"><b>{money(costToDate)}</b><span>Cost to date</span></div>
        <div className="kpi"><b>{money(billed - collected)}</b><span>Billed but not collected</span></div>
      </div>

      {delayed.length > 0 && (
        <div className="note bad">
          <b>{delayed.length} project(s) are behind schedule.</b> In remodeling a delayed job is usually a materials
          problem or a labour problem, and both get worse the longer they are ignored. Call the customer before they
          call you.
        </div>
      )}

      <div className="card">
        <h2>The work in progress</h2>
        {jobs.length === 0 ? (
          <p className="mut">
            No projects recorded yet. A project starts life as an accepted estimate, so once you accept an estimate
            and sign the contract, the job appears here.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th><th>Status</th><th>Start</th><th>Target end</th>
                <th>Contract</th><th>Cost to date</th><th>Margin so far</th><th>Change orders</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((p) => {
                const contract = Number(p.contract_total) || 0;
                const cost = Number(p.actual_cost) || 0;
                const margin = contract ? (contract - cost) / contract : 0;
                const myChanges = orders.filter((c) => c.project_id === p.id);
                const changeSum = myChanges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
                const behind = p.target_end && !p.actual_end && new Date(p.target_end) < new Date();
                return (
                  <tr key={p.id}>
                    <td>
                      <b>{p.title}</b>
                      <br />
                      <span className="mut">{p.address || ''}</span>
                    </td>
                    <td>
                      <span className="tag">{p.status.replace(/_/g, ' ')}</span>
                      {behind ? <><br /><span className="neg">past target date</span></> : null}
                    </td>
                    <td className="mut">{p.start_date || ''}</td>
                    <td className="mut">{p.target_end || ''}</td>
                    <td>{money(contract)}</td>
                    <td>{money(cost)}</td>
                    <td className={margin < 0.35 ? 'neg' : 'pos'}>{contract ? (margin * 100).toFixed(1) + '%' : 'not costed'}</td>
                    <td>
                      {myChanges.length === 0 ? (
                        <span className="mut">none</span>
                      ) : (
                        <>
                          {myChanges.length} worth {money(changeSum)}
                          <br />
                          <span className="mut">
                            {myChanges.filter((c) => c.status === 'APPROVED').length} approved,{' '}
                            {myChanges.filter((c) => c.status !== 'APPROVED').length} not
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="split">
        <div className="card">
          <h2>Customers</h2>
          {people.length === 0 ? (
            <p className="mut">
              No customers recorded yet. When you win an estimate, save the person here: a customer list is a list of
              people who already trust you to work in their home, which is the most valuable asset a company like
              this has.
            </p>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Where</th><th>Source</th><th>Lifetime value</th></tr></thead>
              <tbody>
                {people.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                      <br />
                      <span className="mut">{c.phone || ''} {c.email || ''}</span>
                    </td>
                    <td className="mut">{[c.city, c.state].filter(Boolean).join(', ')}</td>
                    <td><span className="tag">{c.lead_source || 'unknown'}</span></td>
                    <td>{money(Number(c.lifetime_value) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Change orders, the quiet profit killer</h2>
          {orders.length === 0 ? (
            <p className="mut">
              No change orders yet. When a customer asks for extra work mid job, put it here before you do it. Work
              done on a handshake is the most common way a profitable job turns into a favour.
            </p>
          ) : (
            <table>
              <thead><tr><th>What changed</th><th>Amount</th><th>Status</th><th>Paid</th></tr></thead>
              <tbody>
                {orders.map((c) => (
                  <tr key={c.id}>
                    <td className="mut">{c.description}</td>
                    <td>{money(Number(c.amount))}</td>
                    <td><span className="tag">{c.status}</span></td>
                    <td>{c.paid ? 'yes' : <span className="neg">no</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mut">
            Approved and unpaid change orders total{' '}
            <b>{money(orders.filter((c) => c.status === 'APPROVED' && !c.paid).reduce((s, c) => s + (Number(c.amount) || 0), 0))}</b>.
            That is finished work you have not been paid for.
          </p>
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Contracts</h2>
          {signed.length === 0 ? (
            <p className="mut">No contracts on record yet.</p>
          ) : (
            <table>
              <thead><tr><th>Title</th><th>Signed</th><th>Original</th><th>Current</th><th>Status</th></tr></thead>
              <tbody>
                {signed.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title || ''}</td>
                    <td className="mut">{c.signed_at ? new Date(c.signed_at).toLocaleDateString('en-US') : 'not signed'}</td>
                    <td>{money(Number(c.original_total))}</td>
                    <td>{money(Number(c.current_total))}</td>
                    <td><span className="tag">{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Tasks</h2>
          {taskRows.length === 0 ? (
            <p className="mut">
              No tasks yet. A short checklist per job is what stops the small things, a missing transition strip, a
              skipped baseboard, from turning into a call back on your own time.
            </p>
          ) : (
            <table>
              <thead><tr><th>Task</th><th>Due</th><th>Who</th><th>Done</th></tr></thead>
              <tbody>
                {taskRows.slice(0, 30).map((t) => (
                  <tr key={t.id} className={t.done ? 'dead' : ''}>
                    <td>{t.title}</td>
                    <td className="mut">{t.due_date || ''}</td>
                    <td className="mut">{t.assigned_to || ''}</td>
                    <td>{t.done ? 'yes' : 'no'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>What is missing here</h2>
        <p className="mut">
          There is no photo storage on this page yet and no scheduling calendar. Both are worth having, and both need
          the file bucket switched on in Supabase. Until then, keep job photos on your phone, where you can
          actually find them, and use the marketing page when you want them in a post.
        </p>
      </div>
    </div>
  );
}
