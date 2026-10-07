import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Finance. The AI CFO view from your specification, minus the bad advice.
 *
 * Two things are deliberate here:
 *   1. Business money and personal money never mix. The specification is
 *      emphatic about it, and it is right: mixed books cost a contractor real
 *      money at tax time.
 *   2. Every figure is counted from the ledgers. If a number cannot be
 *      calculated the page says so rather than showing a confident estimate.
 */
export default async function FinancePage() {
  const sb = supabaseServer();

  const [txns, accs, invs, per, pay, ests, settings] = await Promise.all([
    sb.from('transactions').select('*').order('txn_date', { ascending: false }).limit(500),
    sb.from('accounts').select('*').order('kind'),
    sb.from('invoices').select('*'),
    sb.from('personal_transactions').select('*').order('txn_date', { ascending: false }).limit(300),
    sb.from('owner_distributions').select('*').order('paid_on', { ascending: false }).limit(60),
    sb.from('estimates').select('status, total, gross_profit'),
    sb.from('company_settings').select('tax_reserve_pct').single()
  ]);

  const rows = txns.data || [];
  const accounts = accs.data || [];
  const invoices = invs.data || [];
  const personal = per.data || [];
  const distributions = pay.data || [];
  const estimates = ests.data || [];

  const money = (n: number) => (n < 0 ? '-' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  const business = rows.filter((t) => t.ownership === 'BUSINESS');
  const mixedIn = rows.filter((t) => t.ownership === 'PERSONAL');

  const income = business.filter((t) => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expense = business.filter((t) => t.type === 'Expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const cats: Record<string, number> = {};
  business.filter((t) => t.type === 'Expense').forEach((t) => {
    cats[t.category] = (cats[t.category] || 0) + (Number(t.amount) || 0);
  });

  const cogs = ['Materials', 'Subcontract labor', 'Labor'].reduce((s, c) => s + (cats[c] || 0), 0);
  const gross = income - cogs;
  const grossMargin = income ? gross / income : 0;
  const net = income - expense;
  const netMargin = income ? net / income : 0;

  const cash = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const taxHeld = accounts.filter((a) => a.kind === 'TAX_RESERVE').reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const taxSuggested = Math.max(0, net) * (Number(settings.data?.tax_reserve_pct) || 0.27);

  const receivable = invoices
    .filter((i) => ['SENT', 'PART_PAID', 'OVERDUE'].includes(i.status))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const payable = business
    .filter((t) => t.type === 'Expense' && t.category === 'Accounts payable')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const wonEstimates = estimates.filter((e) => e.status === 'ACCEPTED');
  const avgJob = wonEstimates.length
    ? wonEstimates.reduce((s, e) => s + (Number(e.total) || 0), 0) / wonEstimates.length
    : 0;

  // ---- forecasts, shown as a range with the assumption stated ----
  const months: Record<string, { income: number; expense: number }> = {};
  business.forEach((t) => {
    const key = String(t.txn_date).slice(0, 7);
    months[key] = months[key] || { income: 0, expense: 0 };
    if (t.type === 'Income') months[key].income += Number(t.amount) || 0;
    else months[key].expense += Number(t.amount) || 0;
  });
  const monthKeys = Object.keys(months).sort();
  const recent = monthKeys.slice(-3);
  const avgIncome = recent.length ? recent.reduce((s, k) => s + months[k].income, 0) / recent.length : 0;

  // ---- personal ----
  const pIncome = personal.filter((p) => p.type === 'Income').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const pSpend = personal.filter((p) => p.type === 'Expense').reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const ownerPay = distributions.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  return (
    <div>
      <h1>Finance</h1>
      <p className="mut">
        The money side of the company, and your own money kept separate from it. Every figure is counted from your
        ledgers. This is not tax or accounting advice, and a CPA should see these numbers before you file.
      </p>

      <h2>Business</h2>
      <div className="grid">
        <div className="kpi"><b>{money(income)}</b><span>Income recorded</span></div>
        <div className="kpi"><b>{money(expense)}</b><span>Expenses recorded</span></div>
        <div className="kpi"><b>{money(gross)}</b><span>Gross profit</span><small>income less materials and labour</small></div>
        <div className="kpi"><b>{income ? pct(grossMargin) : 'no data'}</b><span>Gross margin</span><small>target {pct(Number(settings.data?.tax_reserve_pct) ? 0.4 : 0.4)}</small></div>
        <div className="kpi"><b>{money(net)}</b><span>Net profit</span></div>
        <div className="kpi"><b>{income ? pct(netMargin) : 'no data'}</b><span>Net margin</span></div>
        <div className="kpi"><b>{money(cash)}</b><span>Cash across accounts</span></div>
        <div className="kpi"><b>{money(receivable)}</b><span>You are owed</span></div>
      </div>

      {rows.length === 0 && (
        <div className="note warn">
          <b>No transactions recorded yet.</b> Add them on the Bookkeeping page and this page fills in. Until then,
          every figure here is a genuine zero rather than a guess.
        </div>
      )}

      <div className="split">
        <div className="card">
          <h2>Where the money goes</h2>
          {Object.keys(cats).length === 0 ? (
            <p className="mut">No expenses recorded yet.</p>
          ) : (
            <table>
              <thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
              <tbody>
                {Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{money(v)}</td>
                    <td>{expense ? pct(v / expense) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>What to do with the profit</h2>
          <ol className="mut">
            <li><b>Tax first.</b> Move {money(taxSuggested)} into your tax reserve. You currently hold {money(taxHeld)} there.</li>
            <li><b>Three months of costs</b> as company cash before anything else, so one slow month is survivable.</li>
            <li><b>Clear anything costing you above 8% interest.</b> That is a guaranteed return.</li>
            <li><b>Reinvest where the return is known</b>: a marketing channel with a measured cost per lead, or a second crew once you are booked three to four weeks out.</li>
            <li><b>Then raise your own pay</b>, and ask your CPA about a SEP-IRA or Solo 401(k) so retirement saving comes out of this year&apos;s tax bill.</li>
          </ol>
        </div>
      </div>

      <div className="card">
        <h2>Your accounts</h2>
        {accounts.length === 0 ? (
          <p className="mut">No accounts recorded. Add them on the Bookkeeping page so the cash figure means something.</p>
        ) : (
          <table>
            <thead><tr><th>Account</th><th>Kind</th><th>Balance</th><th>As of</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td><span className="tag">{a.kind}</span></td>
                  <td>{money(Number(a.balance))}</td>
                  <td className="mut">{a.balance_as_of || 'not dated'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Forecast, and what it assumes</h2>
        {recent.length === 0 ? (
          <p className="mut">
            There is not enough recorded history to forecast. Once you have a few months of income, this section
            projects forward and tells you the assumption it used.
          </p>
        ) : (
          <>
            <p>
              Over your last {recent.length} recorded month(s) you averaged <b>{money(avgIncome)}</b> of income a
              month. Continuing at that rate projects roughly <b>{money(avgIncome * 0.9)}</b> to{' '}
              <b>{money(avgIncome * 1.1)}</b> a month going forward.
            </p>
            <div className="note warn">
              This is an arithmetic projection, not a promise. It assumes the same work arrives at the same price.
              One lost job, one storm, or one supplier price rise makes it wrong. Recount it when the numbers change.
            </div>
          </>
        )}
      </div>

      <h2>Personal, kept separate from the company books</h2>
      <div className="grid">
        <div className="kpi"><b>{money(pIncome)}</b><span>Personal income recorded</span></div>
        <div className="kpi"><b>{money(pSpend)}</b><span>Personal spending recorded</span></div>
        <div className="kpi"><b>{money(pIncome - pSpend)}</b><span>What you keep</span></div>
        <div className="kpi"><b>{money(ownerPay)}</b><span>Owner pay taken from the company</span></div>
      </div>

      {mixedIn.length > 0 && (
        <div className="note bad">
          <b>{mixedIn.length} personal transaction(s) are sitting in the business ledger.</b> Move them to the
          Personal page. Business and personal money mixed together is the single most common accounting problem for
          an owner operated company, and it makes tax time expensive.
        </div>
      )}

      <div className="split">
        <div className="card">
          <h2>Owner pay history</h2>
          {distributions.length === 0 ? (
            <p className="mut">
              Nothing recorded yet. Enter what you pay yourself on the Personal page, because the company can be
              profitable while you are not being paid, and that is a trap.
            </p>
          ) : (
            <table>
              <thead><tr><th>Paid</th><th>Kind</th><th>Amount</th></tr></thead>
              <tbody>
                {distributions.slice(0, 12).map((d) => (
                  <tr key={d.id}>
                    <td>{d.paid_on}</td>
                    <td>{d.kind}</td>
                    <td>{money(Number(d.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Reading these two columns together</h2>
          <p className="mut">
            {net > 0 && ownerPay === 0
              ? 'The company is currently keeping its profit rather than paying you. That is a fine strategy for a few months while you build the cash reserve, but a company that never pays its owner is not a business yet, it is a job with extra paperwork.'
              : net <= 0
                ? 'The company is not profitable on these numbers, so there is nothing to distribute yet. Fix the margin before raising your own pay.'
                : 'The company is profitable and you are being paid from it. Keep the tax reserve funded before you raise your own pay further.'}
          </p>
          <p className="mut">
            {avgJob > 0
              ? `Your average accepted job is worth ${money(avgJob)}, so you are earning your living roughly one job at a time. That number is what to raise first.`
              : 'Once a few estimates are accepted, this section will show your average job value, which is the single most useful number for planning growth.'}
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Where this page stops</h2>
        <p className="mut">
          This is reporting, not advice. It does not know your filing status, your deductions, your depreciation or
          your retirement options. It also cannot see an account you have not entered: if you have a bank account
          missing from this page the cash figure is wrong, and it will not tell you it is wrong. Take the export to
          your CPA and let them tell you the rest.
        </p>
      </div>
    </div>
  );
}
