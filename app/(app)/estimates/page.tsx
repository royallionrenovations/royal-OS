import { supabaseServer } from '@/lib/supabase';
import { computeEstimate, type EstimateInput } from '@/lib/estimate';

export const dynamic = 'force-dynamic';

/**
 * Estimates. The builder and the AI review, side by side.
 *
 * Every number shown here is calculated by the same function the save endpoint
 * uses, so what you see is exactly what gets stored.
 */
export default async function EstimatesPage() {
  const sb = supabaseServer();

  const [list, settings, prices] = await Promise.all([
    sb.from('estimates').select('*').order('created_at', { ascending: false }).limit(100),
    sb.from('company_settings').select('*').single(),
    sb.from('price_book').select('*').eq('active', true).order('service')
  ]);

  const rows = list.data || [];
  const money = (n: number) => (n < 0 ? '-' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  // A worked example using the company's own settings, so the owner can see the
  // maths immediately rather than staring at an empty form.
  const s = settings.data;
  const exampleInput: EstimateInput = {
    material_cost: 3900,
    waste_pct: Number(s?.waste_pct ?? 0.05),
    labor_cost: 3450,
    subcontract_cost: 0,
    disposal_cost: 250,
    travel_cost: 60,
    equipment_cost: 120,
    overhead_pct: Number(s?.overhead_pct ?? 0.08),
    contingency_pct: Number(s?.contingency_pct ?? 0.05),
    payment_fee_pct: Number(s?.payment_fee_pct ?? 0.029),
    target_margin: Number(s?.target_gross_margin ?? 0.4),
    discount: 0,
    tax_rate: 0
  };
  const demo = computeEstimate(
    exampleInput,
    Number(s?.minimum_gross_margin ?? 0.35),
    Number(s?.default_deposit_pct ?? 0.4)
  );

  const pending = rows.filter((r) => r.status === 'WAITING_APPROVAL');
  const accepted = rows.filter((r) => r.status === 'ACCEPTED');
  const avgMargin = rows.length
    ? rows.reduce((sum, r) => sum + (Number(r.gross_margin) || 0), 0) / rows.length
    : 0;

  return (
    <div>
      <h1>Estimates</h1>
      <p className="mut">
        The estimator builds the cost, the margin sets the price, and Leo reviews the risk before anything goes out.
      </p>

      <div className="grid">
        <div className="kpi"><b>{rows.length}</b><span>Estimates on record</span></div>
        <div className="kpi"><b>{pending.length}</b><span>Waiting for your approval</span></div>
        <div className="kpi"><b>{accepted.length}</b><span>Accepted</span></div>
        <div className="kpi"><b>{rows.length ? pct(avgMargin) : 'no data'}</b><span>Average margin</span></div>
        <div className="kpi"><b>{money(rows.reduce((t, r) => t + (Number(r.total) || 0), 0))}</b><span>Total quoted</span></div>
      </div>

      <div className="card">
        <h2>A worked example, using your own settings</h2>
        <p className="mut">
          This is the arithmetic the estimator runs. Change your rates in Settings and this changes with them.
        </p>
        <div className="split">
          <table>
            <tbody>
              <tr><td>Materials</td><td>{money(exampleInput.material_cost)}</td></tr>
              <tr><td>Waste at {pct(exampleInput.waste_pct)}</td><td>{money(demo.waste_cost)}</td></tr>
              <tr><td>Labor</td><td>{money(exampleInput.labor_cost)}</td></tr>
              <tr><td>Disposal and travel</td><td>{money(exampleInput.disposal_cost + exampleInput.travel_cost)}</td></tr>
              <tr><td>Overhead at {pct(exampleInput.overhead_pct)}</td><td>{money(demo.overhead_cost)}</td></tr>
              <tr><td>Contingency at {pct(exampleInput.contingency_pct)}</td><td>{money(demo.contingency_cost)}</td></tr>
              <tr><td>Card fees at {pct(exampleInput.payment_fee_pct)}</td><td>{money(demo.payment_fee_cost)}</td></tr>
              <tr><td><b>Your cost</b></td><td><b>{money(demo.total_cost)}</b></td></tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr><td><b>Price to the customer</b></td><td><b>{money(demo.total)}</b></td></tr>
              <tr><td>Gross profit</td><td className="pos">{money(demo.gross_profit)}</td></tr>
              <tr><td>Gross margin</td><td><b>{pct(demo.gross_margin)}</b></td></tr>
              <tr><td>Deposit at signing</td><td>{money(demo.deposit)}</td></tr>
              <tr><td>Balance on completion</td><td>{money(demo.balance)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mut">
          The margin sets the price like this because a 40% margin means 40% of the price is profit, not 40% added to
          the cost. Those are different sums, and using the wrong one is how a contractor works a job for nothing.
        </p>
        {demo.warnings.length > 0 && (
          <div className="note warn">
            <b>Leo would flag this:</b>
            <ul>
              {demo.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Your price book</h2>
        <p className="mut">
          These are the material and labor rates the builder starts from. Update them in Settings whenever your
          suppliers change their prices, which in this trade is often.
        </p>
        {prices.data && prices.data.length > 0 ? (
          <table>
            <thead><tr><th>Service</th><th>Unit</th><th>Material</th><th>Labor</th></tr></thead>
            <tbody>
              {prices.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.service}</td>
                  <td>{p.unit}</td>
                  <td>{money(Number(p.material_unit_cost))}</td>
                  <td>{money(Number(p.labor_unit_cost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mut">
            Your price book is empty. Add your own rates on the Settings page and the estimator will use them. Until
            then, estimates begin from the example figures above.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Estimates</h2>
        <table>
          <thead>
            <tr><th>No.</th><th>Customer</th><th>Project</th><th>Price</th><th>Cost</th><th>Margin</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="mut">
                  No estimates yet. The builder writes them from the Estimates page once your price book is filled in.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.estimate_number}</td>
                <td>{r.customer_name || ''}</td>
                <td>{r.project_title || ''}</td>
                <td>{money(Number(r.total))}</td>
                <td>{money(Number(r.total_cost))}</td>
                <td className={(Number(r.gross_margin) || 0) < 0.35 ? 'neg' : 'pos'}>{pct(Number(r.gross_margin) || 0)}</td>
                <td>
                  <span className="tag">{r.status.replace(/_/g, ' ')}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
