import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Personal finance, section 26 of your specification.
 *
 * Completely separate from the business books, on its own tables, visible only
 * to the CEO. The point of the separation is not privacy for its own sake: if
 * personal spending sits inside the company ledger, your profit figure is
 * fiction and your tax bill is wrong in whichever direction hurts more.
 */
export default async function PersonalPage() {
  const sb = supabaseServer();

  const [accounts, txns, pay, goals] = await Promise.all([
    sb.from('personal_accounts').select('*').order('kind'),
    sb.from('personal_transactions').select('*').order('txn_date', { ascending: false }).limit(300),
    sb.from('owner_distributions').select('*').order('paid_on', { ascending: false }).limit(60),
    sb.from('personal_goals').select('*').order('created_at')
  ]);

  const accs = accounts.data || [];
  const rows = txns.data || [];
  const distributions = pay.data || [];
  const goalRows = goals.data || [];

  const money = (n: number) => (n < 0 ? '-' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  const assets = accs.filter((a) => ['CHECKING', 'SAVINGS', 'INVESTMENT', 'HOUSE'].includes(a.kind))
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const debts = accs.filter((a) => a.kind === 'DEBT').reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const netWorth = assets - debts;

  const income = rows.filter((t) => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const spending = rows.filter((t) => t.type === 'Expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const ownerPay = distributions.reduce((s, d) => s + (Number(d.amount) || 0), 0);

  const byCat: Record<string, number> = {};
  rows.filter((t) => t.type === 'Expense').forEach((t) => {
    byCat[t.category] = (byCat[t.category] || 0) + (Number(t.amount) || 0);
  });

  const debtAccounts = accs.filter((a) => a.kind === 'DEBT' && Number(a.interest_rate) > 0);
  const expensive = debtAccounts.filter((a) => Number(a.interest_rate) >= 10);
  const yearlyInterest = debtAccounts.reduce(
    (s, a) => s + (Number(a.balance) || 0) * (Number(a.interest_rate) / 100), 0
  );

  const savings = accs.filter((a) => a.kind === 'SAVINGS').reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const sixMonths = spending ? (spending / Math.max(1, new Set(rows.map((r) => String(r.txn_date).slice(0, 7))).size)) * 6 : 0;

  return (
    <div>
      <h1>Personal</h1>
      <p className="mut">
        Your own money, held on its own tables and visible only to you. It never touches the company books.
      </p>

      <div className="grid">
        <div className="kpi"><b>{money(assets)}</b><span>Assets recorded</span></div>
        <div className="kpi"><b>{money(debts)}</b><span>Debt recorded</span></div>
        <div className="kpi"><b>{netWorth >= 0 ? money(netWorth) : '-' + money(Math.abs(netWorth)).slice(1)}</b><span>Net worth</span></div>
        <div className="kpi"><b>{money(ownerPay)}</b><span>Owner pay from the company</span><small>what the business has actually paid you</small></div>
        <div className="kpi"><b>{money(income)}</b><span>Personal income recorded</span></div>
        <div className="kpi"><b>{money(spending)}</b><span>Personal spending recorded</span></div>
      </div>

      {accs.length === 0 && rows.length === 0 && (
        <div className="note warn">
          <b>Nothing recorded here yet.</b> Add your accounts and what you pay yourself, and this page turns into the
          picture of your own finances rather than the company&apos;s. Until then, the numbers above are true zeros.
        </div>
      )}

      <div className="split">
        <div className="card">
          <h2>Your accounts</h2>
          {accs.length === 0 ? (
            <p className="mut">No accounts recorded.</p>
          ) : (
            <table>
              <thead><tr><th>Account</th><th>Kind</th><th>Balance</th><th>Rate</th></tr></thead>
              <tbody>
                {accs.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td><span className="tag">{a.kind}</span></td>
                    <td>{money(Number(a.balance))}</td>
                    <td>{a.interest_rate ? pct(Number(a.interest_rate)) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Debt, in plain numbers</h2>
          {debtAccounts.length === 0 ? (
            <p className="mut">No debt recorded. If you have any, add it here, because the interest figure below is one of the most useful numbers you will read.</p>
          ) : (
            <>
              <p>
                Your recorded debt costs about <b>{money(yearlyInterest)}</b> a year in interest, which is{' '}
                <b>{money(yearlyInterest / 12)}</b> a month.
              </p>
              {expensive.length > 0 && (
                <div className="note bad">
                  <b>{expensive.length} account(s) are charging 10% or more.</b> Clearing those is a guaranteed
                  return that beats almost any investment, so they come before saving or investing anywhere else.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="split">
        <div className="card">
          <h2>Where your money goes</h2>
          {Object.keys(byCat).length === 0 ? (
            <p className="mut">No spending recorded yet.</p>
          ) : (
            <table>
              <thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
              <tbody>
                {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{money(v)}</td>
                    <td>{spending ? pct(v / spending) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Your emergency fund</h2>
          <p>
            You hold <b>{money(savings)}</b> in savings.
            {sixMonths > 0
              ? ` Six months of your recorded spending would be ${money(sixMonths)}, so you are at ${pct(savings / sixMonths)} of that.`
              : ' Once you have a month or two of spending recorded, this shows how many months your savings would cover.'}
          </p>
          <p className="mut">
            The order that usually works: one month of expenses in cash, then any debt above 10%, then three to six
            months of expenses, then investing. Doing them out of order is why people with good incomes still feel
            broke.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Goals</h2>
        {goalRows.length === 0 ? (
          <p className="mut">No goals recorded. A goal with an amount and a date is easier to hit than an intention.</p>
        ) : (
          <table>
            <thead><tr><th>Goal</th><th>Target</th><th>Saved</th><th>Progress</th><th>By</th></tr></thead>
            <tbody>
              {goalRows.map((g) => (
                <tr key={g.id}>
                  <td>{g.title}</td>
                  <td>{money(Number(g.target_amount))}</td>
                  <td>{money(Number(g.saved_amount))}</td>
                  <td>{Number(g.target_amount) ? pct(Number(g.saved_amount) / Number(g.target_amount)) : ''}</td>
                  <td className="mut">{g.target_date || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Owner pay history</h2>
        {distributions.length === 0 ? (
          <p className="mut">Nothing recorded yet.</p>
        ) : (
          <table>
            <thead><tr><th>Paid</th><th>Kind</th><th>Amount</th></tr></thead>
            <tbody>
              {distributions.slice(0, 15).map((d) => (
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
        <h2>Personal transactions</h2>
        {rows.length === 0 ? (
          <p className="mut">
            Nothing recorded. When you pay for something personal from a business account, record it here as well,
            and record the matching owner distribution. That is what keeps the two sets of books honest.
          </p>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
            <tbody>
              {rows.slice(0, 60).map((t) => (
                <tr key={t.id}>
                  <td>{t.txn_date}</td>
                  <td>{t.description}</td>
                  <td>{t.type === 'Expense' ? t.category : ''}</td>
                  <td className={t.type === 'Income' ? 'pos' : 'neg'}>{money(Number(t.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Where this page stops</h2>
        <p className="mut">
          It does not know your mortgage terms, your tax position, your retirement accounts or your insurance. It is a
          clear view of what you have entered and nothing more, and it is not financial advice. For anything with
          real money on it, insurance, retirement, buying property, talk to a professional who can see the whole
          picture.
        </p>
      </div>
    </div>
  );
}
