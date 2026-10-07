import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Sales, section 30 of your specification. The pipeline in one place: what came
 * in, what was quoted, what was won, and what the money is doing in between.
 */
export default async function SalesPage() {
  const sb = supabaseServer();

  const [leads, ests, invs, pays] = await Promise.all([
    sb.from('leads').select('id, name, city, service_requested, status, ai_score, estimated_value, platform, created_at, urgency, ai_recommended_action').order('created_at', { ascending: false }).limit(300),
    sb.from('estimates').select('estimate_number, customer_name, project_title, total, total_cost, gross_margin, status, created_at, sent_at, lead_id').order('created_at', { ascending: false }).limit(200),
    sb.from('invoices').select('invoice_number, amount, status, due_date, kind, customer_id, created_at').order('created_at', { ascending: false }).limit(200),
    sb.from('payments').select('amount, method, received_at, fee_amount').limit(300)
  ]);

  const leadRows = leads.data || [];
  const estimates = ests.data || [];
  const invoices = invs.data || [];
  const payments = pays.data || [];

  const money = (n: number) => (n < 0 ? '-' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  const stages = [
    'NEW', 'REVIEW', 'QUALIFIED', 'CONTACTED', 'REPLIED',
    'ESTIMATE_REQUESTED', 'ESTIMATE_SENT', 'WON', 'LOST', 'NOT_QUALIFIED', 'DISMISSED'
  ];
  const byStage: Record<string, { count: number; value: number }> = {};
  stages.forEach((s) => { byStage[s] = { count: 0, value: 0 }; });
  leadRows.forEach((l) => {
    if (!byStage[l.status]) byStage[l.status] = { count: 0, value: 0 };
    byStage[l.status].count += 1;
    byStage[l.status].value += Number(l.estimated_value) || 0;
  });

  const won = byStage['WON'].count;
  const lost = byStage['LOST'].count;
  const winRate = won + lost ? won / (won + lost) : null;
  const openValue = Object.entries(byStage)
    .filter(([k]) => !['WON', 'LOST', 'NOT_QUALIFIED', 'DISMISSED'].includes(k))
    .reduce((s, [, v]) => s + v.value, 0);

  const sent = estimates.filter((e) => e.status === 'SENT');
  const accepted = estimates.filter((e) => e.status === 'ACCEPTED');
  const declined = estimates.filter((e) => e.status === 'DECLINED');
  const estWin = accepted.length + declined.length ? accepted.length / (accepted.length + declined.length) : null;

  const quotedValue = accepted.reduce((s, e) => s + (Number(e.total) || 0), 0);
  const avgAccepted = accepted.length ? quotedValue / accepted.length : 0;

  const billed = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const collected = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const outstanding = invoices
    .filter((i) => ['SENT', 'PART_PAID', 'OVERDUE'].includes(i.status))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const feesPaid = payments.reduce((s, p) => s + (Number(p.fee_amount) || 0), 0);

  const depositsTaken = invoices
    .filter((i) => i.kind === 'DEPOSIT' && i.status === 'PAID')
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const followUp = leadRows.filter((l) => ['NEW', 'REVIEW', 'QUALIFIED'].includes(l.status));
  const staleQuotes = sent.filter((e) => {
    const when = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
    return (Date.now() - when.getTime()) / 86400000 > 7;
  });

  return (
    <div>
      <h1>Sales</h1>
      <p className="mut">
        Everything between a first enquiry and money in the bank, with the gaps named rather than smoothed over.
      </p>

      <div className="grid">
        <div className="kpi"><b>{money(openValue)}</b><span>Open pipeline</span><small>not yet won or lost</small></div>
        <div className="kpi"><b>{winRate === null ? 'no data' : pct(winRate)}</b><span>Lead win rate</span><small>{won} won, {lost} lost</small></div>
        <div className="kpi"><b>{sent.length}</b><span>Estimates out</span></div>
        <div className="kpi"><b>{estWin === null ? 'no data' : pct(estWin)}</b><span>Quote acceptance</span><small>{accepted.length} of {accepted.length + declined.length} decided</small></div>
        <div className="kpi"><b>{avgAccepted ? money(avgAccepted) : 'no data'}</b><span>Average accepted job</span></div>
        <div className="kpi"><b>{money(outstanding)}</b><span>Billed and unpaid</span></div>
        <div className="kpi"><b>{money(depositsTaken)}</b><span>Deposits collected</span><small>money that cannot be lost to a slow payer</small></div>
        <div className="kpi"><b>{money(feesPaid)}</b><span>Card fees paid</span></div>
      </div>

      {followUp.length > 0 && (
        <div className="note bad">
          <b>{followUp.length} lead(s) have had no reply yet.</b> The first company to answer usually gets the job in
          this trade, so this list is your highest value work this morning, ahead of any paperwork.
          {followUp[0].ai_recommended_action ? ` Luna suggests, for the top one: ${followUp[0].ai_recommended_action}` : ''}
        </div>
      )}

      {staleQuotes.length > 0 && (
        <div className="note warn">
          <b>{staleQuotes.length} estimate(s) have been sitting with a customer for more than a week.</b> A quote that
          is not chased becomes a quote the customer forgot. One call each, in order of value.
        </div>
      )}

      <div className="card">
        <h2>The pipeline</h2>
        <table>
          <thead><tr><th>Stage</th><th>Leads</th><th>Value as stated</th><th>Share of pipeline</th></tr></thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s}>
                <td>{s.replace(/_/g, ' ')}</td>
                <td>{byStage[s].count}</td>
                <td>{byStage[s].value ? money(byStage[s].value) : ''}</td>
                <td className="mut">
                  {openValue && !['WON', 'LOST', 'NOT_QUALIFIED', 'DISMISSED'].includes(s)
                    ? pct(byStage[s].value / openValue)
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mut">
          The value column only counts a lead if the customer stated a size or budget. Where nothing was stated the
          cell is blank rather than a guess, because a pipeline full of invented figures is worse than an empty one.
        </p>
      </div>

      <div className="split">
        <div className="card">
          <h2>Leads that need you today</h2>
          {followUp.length === 0 ? (
            <p className="mut">Every lead has been answered. That is the right position to be in.</p>
          ) : (
            <table>
              <thead><tr><th>Lead</th><th>Stage</th><th>Score</th><th>First move</th></tr></thead>
              <tbody>
                {followUp.slice(0, 20).map((l) => (
                  <tr key={l.id} className={(l.ai_score || 0) >= 80 ? 'hot' : ''}>
                    <td>
                      <b>{l.name || 'Unnamed'}</b>
                      <br />
                      <span className="mut">{l.city || ''} {l.service_requested || ''}</span>
                    </td>
                    <td>{l.status.replace(/_/g, ' ')}</td>
                    <td>{l.ai_score || 0}</td>
                    <td className="mut">{l.ai_recommended_action || 'Reply today with a time to measure.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Estimates out</h2>
          {sent.length === 0 ? (
            <p className="mut">No estimate is with a customer right now.</p>
          ) : (
            <table>
              <thead><tr><th>Customer</th><th>Amount</th><th>Margin</th><th>Waiting</th></tr></thead>
              <tbody>
                {sent.map((e) => {
                  const when = e.sent_at ? new Date(e.sent_at) : new Date(e.created_at);
                  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
                  return (
                    <tr key={e.estimate_number}>
                      <td>
                        <b>{e.customer_name || ''}</b>
                        <br />
                        <span className="mut">{e.project_title || ''}</span>
                      </td>
                      <td>{money(Number(e.total))}</td>
                      <td className={(Number(e.gross_margin) || 0) < 0.35 ? 'neg' : 'pos'}>
                        {pct(Number(e.gross_margin) || 0)}
                      </td>
                      <td className={days > 7 ? 'neg' : 'mut'}>
                        {days} day{days === 1 ? '' : 's'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Invoices and payments</h2>
          <table>
            <tbody>
              <tr><td>Billed in total</td><td><b>{money(billed)}</b></td></tr>
              <tr><td>Collected</td><td className="pos"><b>{money(collected)}</b></td></tr>
              <tr><td>Still owed</td><td className="neg"><b>{money(outstanding)}</b></td></tr>
              <tr><td>Card or processing fees</td><td>{money(feesPaid)}</td></tr>
            </tbody>
          </table>
          <p className="mut">
            Fees of {money(feesPaid)} across {payments.length} payment(s) are a real cost of getting paid by card.
            The estimator already adds card fees into your cost, which is why the price you quote covers them.
          </p>
        </div>

        <div className="card">
          <h2>Where the leaks are</h2>
          <ul className="mut">
            {followUp.length > 0 && <li><b>Unanswered leads:</b> {followUp.length}. Each one is a job you paid to find.</li>}
            {staleQuotes.length > 0 && <li><b>Unchased quotes:</b> {staleQuotes.length}. Follow up once, then decide.</li>}
            {outstanding > 0 && <li><b>Unpaid invoices:</b> {money(outstanding)}. Deposits at signing stop most of this.</li>}
            {declined.length > 0 && <li><b>Declined quotes:</b> {declined.length}. Ask why on every single one, then write the answer down. That list is your best sales training.</li>}
            {followUp.length === 0 && staleQuotes.length === 0 && outstanding === 0 && declined.length === 0 && (
              <li>Nothing is leaking right now on these numbers. Keep it that way by working this page every morning.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>What this page cannot tell you</h2>
        <p className="mut">
          It cannot tell you why a customer said no, because that only lives in the conversation you had with them.
          It also cannot chase anyone for you. The speed at which you answer is the single biggest lever on your win
          rate, and it is the one thing no software can do in your place.
        </p>
      </div>
    </div>
  );
}
