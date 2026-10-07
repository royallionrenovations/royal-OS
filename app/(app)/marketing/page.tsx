import { supabaseServer } from '@/lib/supabase';
import ContentStudio from './studio';

export const dynamic = 'force-dynamic';

/**
 * Marketing. Your specification asks for analytics, an AI content studio, and
 * an approval chain where nothing publishes without the CEO. The approval chain
 * is here in full. The publishing step is deliberately not: posting to Facebook,
 * Instagram or TikTok requires that platform's own API approval, which only the
 * account owner can obtain. Until that exists, this page produces the content
 * and hands it to you to paste, rather than pretending to post.
 */
export default async function MarketingPage() {
  const sb = supabaseServer();

  const [chan, posts, metrics, settings, leads] = await Promise.all([
    sb.from('marketing_channels').select('*').order('name'),
    sb.from('social_posts').select('*').order('created_at', { ascending: false }).limit(120),
    sb.from('social_metrics').select('*').order('metric_date', { ascending: false }).limit(200),
    sb.from('company_settings').select('service_areas, services').single(),
    sb.from('leads').select('platform, city, status, estimated_value').limit(400)
  ]);

  const money = (n: number) => '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
  const pct = (n: number) => (Math.round(n * 1000) / 10).toFixed(1) + '%';

  const channels = chan.data || [];
  const postRows = posts.data || [];
  const metricRows = metrics.data || [];
  const leadRows = leads.data || [];

  const spend = channels.reduce((s, c) => s + (Number(c.spend) || 0), 0);
  const mktLeads = channels.reduce((s, c) => s + (Number(c.leads_count) || 0), 0);
  const mktWon = channels.reduce((s, c) => s + (Number(c.won_count) || 0), 0);
  const mktRevenue = channels.reduce((s, c) => s + (Number(c.revenue) || 0), 0);
  const cpl = mktLeads ? spend / mktLeads : null;
  const roi = spend ? (mktRevenue - spend) / spend : null;

  const bySource: Record<string, number> = {};
  leadRows.forEach((l) => { bySource[l.platform] = (bySource[l.platform] || 0) + 1; });

  const waiting = postRows.filter((p) => p.status === 'WAITING_APPROVAL');
  const published = postRows.filter((p) => p.status === 'PUBLISHED');
  const approved = postRows.filter((p) => ['APPROVED', 'SCHEDULED'].includes(p.status));

  const bestByEngagement = published
    .filter((p) => p.engagement)
    .sort((a, b) => (Number(b.engagement) || 0) - (Number(a.engagement) || 0))
    .slice(0, 5);

  return (
    <div>
      <h1>Marketing</h1>
      <p className="mut">
        Max writes, you approve, and only then does anything go out. Your numbers decide what gets promoted.
      </p>

      <div className="grid">
        <div className="kpi"><b>{money(spend)}</b><span>Recorded ad spend</span></div>
        <div className="kpi"><b>{mktLeads}</b><span>Leads from marketing</span></div>
        <div className="kpi"><b>{cpl === null ? 'no data' : money(cpl)}</b><span>Cost per lead</span><small>spend divided by leads</small></div>
        <div className="kpi"><b>{roi === null ? 'no data' : pct(roi)}</b><span>Return on ad spend</span><small>revenue less spend</small></div>
        <div className="kpi"><b>{waiting.length}</b><span>Waiting for your approval</span></div>
        <div className="kpi"><b>{published.length}</b><span>Published</span></div>
      </div>

      {channels.length === 0 && (
        <div className="note warn">
          <b>No marketing channel has any data yet</b>, so cost per lead and return on spend cannot be calculated.
          Record what you spend and how many leads each channel brought in, and these four numbers become real
          instead of blank.
        </div>
      )}

      <ContentStudio areas={settings.data?.service_areas || []} services={settings.data?.services || []} />

      <div className="card">
        <h2>Content calendar</h2>
        <p className="mut">
          Drafts wait here until you approve them. Approving a post means you are happy with the words; it does not
          post anything.
        </p>
        <table>
          <thead>
            <tr><th>Platform</th><th>Type</th><th>Hook</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {postRows.length === 0 && (
              <tr><td colSpan={5} className="mut">No content yet. Write a post above and it lands here for approval.</td></tr>
            )}
            {postRows.map((p) => (
              <tr key={p.id}>
                <td><span className="tag">{p.platform}</span></td>
                <td>{p.content_type || ''}</td>
                <td>
                  <b>{p.hook || ''}</b>
                  <br />
                  <span className="mut" style={{ whiteSpace: 'pre-wrap' }}>{p.caption || ''}</span>
                  {p.hashtags ? <><br /><span className="mut">{p.hashtags}</span></> : null}
                  {p.media_plan ? <><br /><span className="mut">Photo: {p.media_plan}</span></> : null}
                </td>
                <td>
                  <span className="tag">{p.status.replace(/_/g, ' ')}</span>
                  {p.planned_for ? <><br /><span className="mut">for {p.planned_for}</span></> : null}
                </td>
                <td className="mut">
                  {p.status === 'WAITING_APPROVAL'
                    ? 'Approve it in Settings, or copy the text and post it yourself.'
                    : p.status === 'PUBLISHED'
                      ? 'Published'
                      : 'Ready'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="split">
        <div className="card">
          <h2>Where your leads come from</h2>
          <table>
            <thead><tr><th>Source</th><th>Leads</th></tr></thead>
            <tbody>
              {Object.keys(bySource).length === 0 && (
                <tr><td colSpan={2} className="mut">No leads recorded yet.</td></tr>
              )}
              {Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mut">
            The channel that produces your cheapest leads is where the next dollar should go, not the one with the
            most followers.
          </p>
        </div>

        <div className="card">
          <h2>Your best performing posts</h2>
          {bestByEngagement.length === 0 ? (
            <p className="mut">
              No engagement recorded yet. Add your post numbers on this page and Max will start comparing what works
              against what does not.
            </p>
          ) : (
            <table>
              <thead><tr><th>Post</th><th>Engagement</th></tr></thead>
              <tbody>
                {bestByEngagement.map((p) => (
                  <tr key={p.id}>
                    <td>{p.hook || p.platform}</td>
                    <td>{p.engagement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {metricRows.length > 0 && (
        <div className="card">
          <h2>Social metrics on record</h2>
          <table>
            <thead><tr><th>Date</th><th>Platform</th><th>Followers</th><th>Reach</th><th>Engagement</th><th>Leads</th></tr></thead>
            <tbody>
              {metricRows.slice(0, 20).map((m) => (
                <tr key={m.id}>
                  <td>{m.metric_date}</td>
                  <td>{m.platform}</td>
                  <td>{m.followers ?? ''}</td>
                  <td>{m.reach ?? ''}</td>
                  <td>{m.engagement ?? ''}</td>
                  <td>{m.leads ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>What is not connected, and why</h2>
        <p className="mut">
          Instagram, Facebook and TikTok publishing need each platform to approve an application from the business
          owner. Until you have those approvals, this page writes the content and you paste it in. Nothing here
          pretends a post went out when it did not.
        </p>
      </div>
    </div>
  );
}
