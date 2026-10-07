import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Bookkeeping. The ledger your specification describes, with the fields it
 * asked for, and the AI suggestions shown as suggestions rather than applied.
 *
 * The rule from your specification is enforced by the shape of this page:
 * anything the AI notices is presented as a suggestion you approve or dismiss.
 * Nothing here edits a financial record on its own.
 */
export default async function BookkeepingPage() {
  const sb = supabaseServer();

  const [txns, accs, suggestions, settings] = await Promise.all([
    sb.from('transactions').select('*').order('txn_date', { ascending: false }).limit(300),
    sb.from('accounts').select('*').order('kind'),
    sb.from('bookkeeping_suggestions').select('*').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(50),
    sb.from('company_settings').select('services').single()
  ]);

  const rows = txns.data || [];
  const accounts = accs.data || [];
  const open = suggestions.data || [];

  const money = (n: number) => (n < 0 ? '-' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

  const business = rows.filter((t) => t.ownership === 'BUSINESS');
  const income = business.filter((t) => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const expense = business.filter((t) => t.type === 'Expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const categories = [
    'Materials', 'Subcontract labor', 'Labor', 'Fuel', 'Vehicle', 'Advertising', 'Software',
    'Insurance', 'Equipment', 'Tools', 'Office expenses', 'Bank fees', 'Payment processing',
    'Taxes', 'Rent', 'Utilities', 'Permits and licences', 'Education', 'Accounts payable', 'Other expenses'
  ];

  const money_in = rows.filter((t) => t.type === 'Income' && !t.receipt_url).length;
  const missingReceipts = rows.filter((t) => t.type === 'Expense' && !t.receipt_url).length;

  return (
    <div>
      <h1>Bookkeeping</h1>
      <p className="mut">
        The business ledger. Personal money belongs on the Personal page, not here, and the two are stored separately
        so they cannot drift into each other.
      </p>

      <div className="grid">
        <div className="kpi"><b>{rows.length}</b><span>Transactions</span></div>
        <div className="kpi"><b>{money(income)}</b><span>Income</span></div>
        <div className="kpi"><b>{money(expense)}</b><span>Expenses</span></div>
        <div className="kpi"><b>{money(income - expense)}</b><span>Net</span></div>
        <div className="kpi"><b>{open.length}</b><span>AI suggestions open</span></div>
        <div className="kpi"><b>{missingReceipts}</b><span>Missing receipts</span></div>
      </div>

      {open.length > 0 && (
        <div className="card">
          <h2>Suggestions for you to decide</h2>
          <p className="mut">
            These are things the bookkeeper agent or the checks noticed. Nothing has been changed in your records:
            each one waits for you to approve or dismiss it.
          </p>
          <table>
            <thead><tr><th>Severity</th><th>What was noticed</th><th>Detail</th></tr></thead>
            <tbody>
              {open.map((s) => (
                <tr key={s.id}>
                  <td className={s.severity === 'bad' ? 'neg' : s.severity === 'warn' ? 'warn' : 'mut'}>
                    {s.severity.toUpperCase()}
                  </td>
                  <td><b>{s.title}</b><br /><span className="tag">{s.kind.replace(/_/g, ' ')}</span></td>
                  <td className="mut">{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>What the ledger holds, and why each field is there</h2>
        <table>
          <thead><tr><th>Field</th><th>Why you want it filled in</th></tr></thead>
          <tbody>
            <tr><td>Date</td><td>Monthly and year to date reporting, and forecasting.</td></tr>
            <tr><td>Description</td><td>So a receipt can be matched months later without guessing.</td></tr>
            <tr><td>Amount and type</td><td>Income or expense. The whole P&amp;L is built from these two.</td></tr>
            <tr><td>Category</td><td>Decides your gross margin and shows where the money leaks.</td></tr>
            <tr><td>Vendor or customer</td><td>Repeats and unpaid balances show up from this.</td></tr>
            <tr><td>Business or personal</td><td>Kept apart so your books stay clean at tax time.</td></tr>
            <tr><td>Project</td><td>Profit per job, which is how you find the work that actually pays.</td></tr>
            <tr><td>Payment method</td><td>Card fees, and which account to reconcile against.</td></tr>
            <tr><td>Receipt</td><td>No receipt means the deduction can be refused. {missingReceipts} expense(s) are missing one.</td></tr>
            <tr><td>AI category suggestion</td><td>Speeds the entry up. You still confirm it, because a wrong category quietly distorts every margin on this page.</td></tr>
          </tbody>
        </table>
      </div>

      {accounts.length > 0 && (
        <div className="card">
          <h2>Your accounts</h2>
          <table>
            <thead><tr><th>Account</th><th>Kind</th><th>Institution</th><th>Balance</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td><span className="tag">{a.kind}</span></td>
                  <td className="mut">{a.institution || ''}</td>
                  <td>{money(Number(a.balance))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>The ledger</h2>
        {rows.length === 0 ? (
          <p className="mut">
            Nothing recorded yet. This is where the office starts: add this month&apos;s income and expenses and
            every other page begins filling in behind them, because they all read from here.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Description</th><th>Category</th>
                <th>Vendor or customer</th><th>Amount</th><th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.txn_date}</td>
                  <td>{t.type}</td>
                  <td>{t.description}</td>
                  <td>{t.type === 'Expense' ? t.category : ''}</td>
                  <td className="mut">{t.vendor_customer || ''}</td>
                  <td className={t.type === 'Income' ? 'pos' : 'neg'}>{money(Number(t.amount))}</td>
                  <td>{t.receipt_url ? 'yes' : <span className="neg">missing</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>What this page cannot do</h2>
        <p className="mut">
          It does not read your bank. Nobody but you should enter your transactions, unless you later connect a bank
          feed through an account aggregator, which is a separate service with its own cost. It also does not file
          anything. It organises the numbers so your CPA spends their time advising you instead of tidying up, which
          is where their fee actually earns its money.
        </p>
      </div>
    </div>
  );
}
