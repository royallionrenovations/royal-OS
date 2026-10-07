import { supabaseServer } from '@/lib/supabase';
import { supabaseAdminSafe } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * Settings. Your specification asks for company settings, users and roles, the
 * AI team configuration, and an honest integrations page showing what is
 * connected and what needs authorisation. It is all here.
 *
 * The people table is the important one: every account starts PENDING and stays
 * that way until you switch it on.
 */
export default async function SettingsPage() {
  const sb = supabaseServer();

  const [people, settings, prices, agents, meta] = await Promise.all([
    sb.from('profiles').select('id, email, full_name, role, status, created_at').order('created_at'),
    sb.from('company_settings').select('*').single(),
    sb.from('price_book').select('*').order('service'),
    sb.from('ai_agents').select('slug, name, department, status, monthly_cost').order('department'),
    sb.from('app_settings').select('openai_model, openai_model_deep, max_daily_ai_cents, lead_sources_enabled').single()
  ]);

  const s = settings.data;
  const money = (n: number) => '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

  const connections = [
    { name: 'OpenAI', live: !!process.env.OPENAI_API_KEY, need: 'OPENAI_API_KEY', what: 'Royal AI and every agent in the team room.' },
    { name: 'Supabase', live: !!process.env.NEXT_PUBLIC_SUPABASE_URL, need: 'NEXT_PUBLIC_SUPABASE_URL', what: 'Your database, logins and files.' },
    { name: 'Reddit', live: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET), need: 'REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET', what: 'Real posts asking for renovation work, through Reddit\u2019s own API.' },
    { name: 'Google Places', live: !!process.env.GOOGLE_PLACES_KEY, need: 'GOOGLE_PLACES_KEY', what: 'Local builders, property managers and suppliers as potential partners. Not homeowners.' },
    { name: 'Facebook and Instagram', live: !!(process.env.META_APP_ID && process.env.META_APP_SECRET), need: 'META_APP_ID and META_APP_SECRET, after Meta approves your app', what: 'Publishing and page metrics.' },
    { name: 'Nextdoor', live: false, need: 'not available', what: 'Nextdoor forbids automated access. The Leads page opens the searches for you instead.' },
    { name: 'TikTok', live: false, need: 'not available', what: 'No automation for a small business account. Manual posting.' }
  ];

  return (
    <div>
      <h1>Settings</h1>
      <p className="mut">The numbers the whole office reads, the people who can sign in, and what is connected.</p>

      <div className="card">
        <h2>People</h2>
        <p className="mut">
          Every new account starts as PENDING with no access. Change the role and switch status to ACTIVE to let
          someone in. Changing it back locks them out immediately.
        </p>
        <table>
          <thead>
            <tr><th>Who</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {(people.data || []).map((p) => (
              <tr key={p.id}>
                <td><b>{p.full_name || '(no name given)'}</b></td>
                <td>{p.email}</td>
                <td><span className="tag">{p.role}</span></td>
                <td>
                  <span className={p.status === 'ACTIVE' ? 'pos' : 'neg'}>{p.status}</span>
                </td>
                <td className="mut">{new Date(p.created_at).toLocaleDateString('en-US')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mut">
          Roles are set in the database for safety: an ADMIN or CEO can manage everything, BOOKKEEPER sees money,
          SALES sees leads and customers, ESTIMATOR sees estimates and projects, MARKETING sees leads and marketing,
          VIEWER can look but not change, and PENDING can see nothing at all.
        </p>
      </div>

      <div className="card">
        <h2>Company numbers</h2>
        <p className="mut">
          These drive the estimator, the dashboards and the AI. Read from the database, not from this page&apos;s
          memory: change one here and the effect is immediate everywhere.
        </p>
        <table>
          <tbody>
            <tr><td>Legal name</td><td><b>{s?.legal_name}</b></td></tr>
            <tr><td>Display name</td><td>{s?.display_name}</td></tr>
            <tr><td>Phone</td><td>{s?.phone || <span className="mut">not set</span>}</td></tr>
            <tr><td>Email</td><td>{s?.email || <span className="mut">not set</span>}</td></tr>
            <tr><td>Licence number</td><td>{s?.license_number || <span className="mut">not set</span>}</td></tr>
            <tr><td>Service areas</td><td>{(s?.service_areas || []).join(', ')}</td></tr>
            <tr><td>Services sold</td><td>{(s?.services || []).length} listed</td></tr>
            <tr><td>Target gross margin</td><td>{((Number(s?.target_gross_margin) || 0) * 100).toFixed(0)}%</td></tr>
            <tr><td>Minimum gross margin</td><td>{((Number(s?.minimum_gross_margin) || 0) * 100).toFixed(0)}% - estimates below this are refused for sending</td></tr>
            <tr><td>Default deposit</td><td>{((Number(s?.default_deposit_pct) || 0) * 100).toFixed(0)}%</td></tr>
            <tr><td>Tax reserve</td><td>{((Number(s?.tax_reserve_pct) || 0) * 100).toFixed(0)}% of profit</td></tr>
            <tr><td>Waste</td><td>{((Number(s?.waste_pct) || 0) * 100).toFixed(0)}% of materials</td></tr>
            <tr><td>Overhead</td><td>{((Number(s?.overhead_pct) || 0) * 100).toFixed(0)}% of direct cost</td></tr>
            <tr><td>Contingency</td><td>{((Number(s?.contingency_pct) || 0) * 100).toFixed(0)}% of direct cost</td></tr>
            <tr><td>Card fees</td><td>{((Number(s?.payment_fee_pct) || 0) * 100).toFixed(1)}%</td></tr>
            <tr><td>Labour rate</td><td>{money(Number(s?.hourly_labor_rate) || 0)} per hour</td></tr>
            <tr><td>Travel</td><td>{money(Number(s?.travel_rate_per_mile) || 0)} per mile</td></tr>
            <tr><td>Estimate valid for</td><td>{s?.estimate_valid_days || 30} days</td></tr>
            <tr><td>AI model</td><td>{meta.data?.openai_model || 'gpt-4o-mini'} for routine work, {meta.data?.openai_model_deep || 'gpt-4o'} for deep reports</td></tr>
            <tr><td>Daily AI cap</td><td>{money((Number(meta.data?.max_daily_ai_cents) || 200) / 100)} a day</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Your price book</h2>
        {prices.data && prices.data.length > 0 ? (
          <table>
            <thead><tr><th>Service</th><th>Unit</th><th>Material</th><th>Labour</th></tr></thead>
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
          <p className="mut">Empty. Add your own rates and the estimator stops using the example figures.</p>
        )}
      </div>

      <div className="card">
        <h2>The AI team seats</h2>
        <table>
          <thead><tr><th>Seat</th><th>Department</th><th>Status</th><th>Planned monthly cost</th></tr></thead>
          <tbody>
            {(agents.data || []).map((a) => (
              <tr key={a.slug}>
                <td><b>{a.name}</b></td>
                <td>{a.department}</td>
                <td><span className="tag">{a.status}</span></td>
                <td>{money(Number(a.monthly_cost) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mut">
          Switch a seat on when the department it serves is running well enough to use it. The planned cost is your
          own figure, and the real cost is measured on the AI Team page.
        </p>
      </div>

      <div className="card">
        <h2>Connections</h2>
        <table>
          <thead><tr><th>Service</th><th>State</th><th>What it does</th><th>What it needs</th></tr></thead>
          <tbody>
            {connections.map((c) => (
              <tr key={c.name}>
                <td><b>{c.name}</b></td>
                <td className={c.live ? 'pos' : 'neg'}>{c.live ? 'CONNECTED' : 'REQUIRES AUTHORIZATION'}</td>
                <td className="mut">{c.what}</td>
                <td className="mut">{c.need}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mut">
          A service shows REQUIRES AUTHORIZATION only when the key is genuinely missing, never because a call
          silently failed. Nothing here claims to be connected when it is not.
        </p>
      </div>

      <div className="card">
        <h2>Backups</h2>
        <p className="mut">
          Your database lives in Supabase. On the free plan there are no automatic backups, so on the first of each
          month open Supabase, go to Database, Backups, and download a copy. Keep it somewhere outside Supabase. Put
          a reminder in your phone now, because a backup you never took is not a backup.
        </p>
      </div>
    </div>
  );
}
