import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import Hunt from './hunt';

export const dynamic = 'force-dynamic';

/**
 * Leads. Your specification asks for the AI Lead Hunter and for lead
 * intelligence, scoring, saved searches and alerts. All of that is here.
 *
 * The one place this page is deliberately narrower than the specification is
 * Facebook and Nextdoor. Both forbid automated reading of their content, so
 * rather than pretend, this page provides prepared searches for you to open and
 * a paste box that scores whatever you find by hand. The AI still does the
 * judging, which is the part that saves you time.
 */
export default async function LeadsPage() {
  const sb = supabaseServer();
  const { profile } = await currentProfile(sb);

  const [leads, searches, settings] = await Promise.all([
    sb.from('leads').select('*').order('created_at', { ascending: false }).limit(200),
    sb.from('saved_searches').select('*').order('created_at', { ascending: false }),
    sb.from('company_settings').select('service_areas, services').single()
  ]);

  const rows = leads.data || [];
  const areas: string[] = settings.data?.service_areas || [];
  const services: string[] = settings.data?.services || [];

  const money = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');

  const stageOrder = [
    'NEW', 'REVIEW', 'QUALIFIED', 'CONTACTED', 'REPLIED',
    'ESTIMATE_REQUESTED', 'ESTIMATE_SENT', 'WON', 'LOST', 'NOT_QUALIFIED', 'DISMISSED'
  ];

  const byStage: Record<string, number> = {};
  rows.forEach((l) => { byStage[l.status] = (byStage[l.status] || 0) + 1; });

  const openValue = rows
    .filter((l) => !['WON', 'LOST', 'NOT_QUALIFIED', 'DISMISSED'].includes(l.status))
    .reduce((s, l) => s + (Number(l.estimated_value) || 0), 0);
  const hot = rows.filter((l) => l.is_hot);
  const won = byStage['WON'] || 0;
  const lost = byStage['LOST'] || 0;

  const prepared = areas.slice(0, 6).flatMap((city) => [
    {
      label: `Facebook: ${city}`,
      href: `https://www.google.com/search?tbs=qdr:m&q=${encodeURIComponent(
        `site:facebook.com "${services[0] || 'flooring'}" OR "recommend" OR "quote" ${city} FL`
      )}`,
      why: 'Groups where neighbours ask for recommendations. Open it, read the newest posts, and paste anything real into the box below.'
    },
    {
      label: `Nextdoor and local groups: ${city}`,
      href: `https://www.google.com/search?tbs=qdr:m&q=${encodeURIComponent(
        `${city} FL "looking for" contractor OR "recommend" flooring OR tile OR remodel`
      )}`,
      why: 'Nextdoor and community boards. Same routine: read, then paste the find into the scoring box.'
    }
  ]);

  return (
    <div>
      <h1>Leads</h1>
      <p className="mut">
        The AI Lead Hunter finds and scores opportunities. Luna judges every one before it reaches your pipeline.
      </p>

      <div className="grid">
        <div className="kpi"><b>{rows.length}</b><span>Leads on record</span></div>
        <div className="kpi"><b>{hot.length}</b><span>Hot leads</span><small>score 80 or above</small></div>
        <div className="kpi"><b>{money(openValue)}</b><span>Open pipeline</span><small>not yet won or lost</small></div>
        <div className="kpi"><b>{byStage['NEW'] || 0}</b><span>Waiting for review</span></div>
        <div className="kpi"><b>{(won + lost) ? Math.round((won / (won + lost)) * 100) + '%' : 'no data'}</b><span>Win rate</span></div>
      </div>

      <Hunt areas={areas} services={services} />

      <div className="card">
        <h2>Searches to run yourself</h2>
        <p className="mut">
          Facebook and Nextdoor forbid automated reading, so this app does not touch them. These open in your own
          browser instead. When you find a real post, copy the text into the scoring box above and Luna will rate it.
        </p>
        <table>
          <tbody>
            {prepared.map((p) => (
              <tr key={p.label}>
                <td>
                  <a href={p.href} target="_blank" rel="noreferrer">{p.label}</a>
                  <br />
                  <span className="mut">{p.why}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Hot leads</h2>
        {hot.length === 0 ? (
          <p className="mut">
            No lead has scored 80 or above yet. Score a post above and any strong one appears here with the reason
            Luna gave.
          </p>
        ) : (
          <table>
            <thead>
              <tr><th>Lead</th><th>Score</th><th>Where</th><th>Value</th><th>Why</th><th>Action</th></tr>
            </thead>
            <tbody>
              {hot.map((l) => (
                <tr key={l.id} className="hot">
                  <td>
                    <b>{l.name || 'Unnamed'}</b>
                    <br />
                    <span className="mut">{l.service_requested || ''}</span>
                  </td>
                  <td><b>{l.ai_score || 0}</b></td>
                  <td>{l.city || ''}<br /><span className="tag">{l.platform}</span></td>
                  <td>{l.estimated_value ? money(Number(l.estimated_value)) : 'not stated'}</td>
                  <td className="mut">{(l.ai_score_reasons || []).join('. ')}</td>
                  <td>{l.ai_recommended_action || 'Reply today.'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Pipeline</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          {stageOrder.map((s) => (
            <span key={s} className="tag">{s.replace(/_/g, ' ')}: {byStage[s] || 0}</span>
          ))}
        </div>
        <table>
          <thead>
            <tr><th>Lead</th><th>Stage</th><th>City</th><th>Service</th><th>Score</th><th>Value</th><th>Source</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="mut">Nothing here yet. Run the hunter above, or paste a post you found.</td></tr>
            )}
            {rows.map((l) => (
              <tr key={l.id} className={l.is_hot ? 'hot' : ''}>
                <td>
                  {l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.name || 'Open source'}</a> : (l.name || 'Unnamed')}
                  {l.urgency && l.urgency !== 'Unknown' ? <><br /><span className="tag">{l.urgency}</span></> : null}
                </td>
                <td>{l.status.replace(/_/g, ' ')}</td>
                <td>{l.city || ''}</td>
                <td>{l.service_requested || ''}</td>
                <td>{l.ai_score || 0}</td>
                <td>{l.estimated_value ? money(Number(l.estimated_value)) : ''}</td>
                <td><span className="tag">{l.platform}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {searches.data && searches.data.length > 0 && (
        <div className="card">
          <h2>Saved searches</h2>
          <table>
            <thead><tr><th>Name</th><th>Last run</th><th>Results</th></tr></thead>
            <tbody>
              {searches.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.last_run_at ? new Date(s.last_run_at).toLocaleDateString('en-US') : 'never'}</td>
                  <td>{s.last_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
