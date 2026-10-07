'use client';

import { useState } from 'react';

type Found = {
  source: string;
  title: string;
  url: string;
  text: string;
  author: string | null;
  posted_at: string | null;
  city: string | null;
};

type Scored = {
  score: number;
  reasons: string[];
  service_match: string | null;
  city: string | null;
  urgency: string;
  estimated_value: number;
  recommended_action: string;
  summary: string;
  is_real_opportunity: boolean;
};

/**
 * The hunter itself. Two halves:
 *   1. Run the permitted sources (Reddit through the official API, Google Places).
 *   2. Paste anything you found by hand and let Luna score it.
 * Both feed the same scoring route, so the judgement is consistent.
 */
export default function Hunt({ areas, services }: { areas: string[]; services: string[] }) {
  const [city, setCity] = useState(areas[0] || 'Fort Myers');
  const [service, setService] = useState(services[0] || 'flooring');
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState<{ source: string; status: string; found: Found[] }[]>([]);
  const [found, setFound] = useState<Found[]>([]);
  const [scored, setScored] = useState<Scored[]>([]);
  const [note, setNote] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteResult, setPasteResult] = useState<Scored | null>(null);

  async function hunt() {
    setBusy('hunt');
    setReport([]);
    setFound([]);
    setScored([]);
    setNote('');
    const res = await fetch('/api/hunt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, service, sources: ['reddit', 'google_places', 'facebook', 'nextdoor'] })
    });
    const json = await res.json();
    setBusy('');
    if (!json.ok) { setNote(json.message || 'The hunt did not run.'); return; }
    setReport(json.report || []);
    setFound(json.found || []);
    setNote(json.next + (json.skippedAsDuplicate ? ` ${json.skippedAsDuplicate} duplicate(s) skipped.` : ''));
  }

  async function scoreFound() {
    if (!found.length) return;
    setBusy('score');
    const res = await fetch('/api/score-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: found.map((f) => ({ url: f.url, text: f.text, platform: f.source })) })
    });
    const json = await res.json();
    setBusy('');
    if (!json.ok) { setNote(json.message || 'Scoring did not run.'); return; }
    setScored(json.scored || []);
    setNote(json.note || '');
  }

  async function scorePaste() {
    if (!paste.trim()) return;
    setBusy('paste');
    setPasteResult(null);
    const res = await fetch('/api/score-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ text: paste, platform: 'Pasted by hand' }] })
    });
    const json = await res.json();
    setBusy('');
    if (!json.ok) { setNote(json.message || 'Scoring did not run.'); return; }
    setPasteResult((json.scored || [])[0] || null);
    setNote(json.note || '');
  }

  return (
    <>
      <div className="card">
        <h2>Run the hunter</h2>
        <div className="row">
          <label>
            City
            <select value={city} onChange={(e) => setCity(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
              {areas.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>
            Work
            <select value={service} onChange={(e) => setService(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
              {services.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <button onClick={hunt} disabled={busy === 'hunt'}>
            {busy === 'hunt' ? 'Searching permitted sources...' : 'Search for opportunities'}
          </button>
          {found.length > 0 && (
            <button className="ghost" onClick={scoreFound} disabled={busy === 'score'}>
              {busy === 'score' ? 'Luna is scoring...' : `Score ${found.length} with Luna`}
            </button>
          )}
        </div>

        {note && <div className="note warn">{note}</div>}

        {report.map((r) => (
          <div key={r.source} className="note">
            <b>{r.source}</b>: {r.status}
          </div>
        ))}
      </div>

      {found.length > 0 && (
        <div className="card">
          <h2>{found.length} item(s) found</h2>
          <table>
            <thead><tr><th>Item</th><th>Source</th><th>Posted</th><th></th></tr></thead>
            <tbody>
              {found.map((f, i) => (
                <tr key={i}>
                  <td>
                    <b>{f.title}</b>
                    <br />
                    <span className="mut">{f.text.slice(0, 220)}</span>
                  </td>
                  <td><span className="tag">{f.source}</span></td>
                  <td className="mut">{f.posted_at ? new Date(f.posted_at).toLocaleDateString('en-US') : 'unknown'}</td>
                  <td>{f.url && <a href={f.url} target="_blank" rel="noreferrer">Open</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scored.length > 0 && (
        <div className="card">
          <h2>Luna&apos;s judgement</h2>
          <table>
            <thead><tr><th>Score</th><th>What it is</th><th>Why</th><th>Recommended action</th></tr></thead>
            <tbody>
              {scored.map((s, i) => (
                <tr key={i} className={s.score >= 80 ? 'hot' : ''}>
                  <td><b>{s.score}</b><br /><span className="mut">{s.score >= 80 ? 'HOT' : s.score >= 50 ? 'worth a reply' : 'weak'}</span></td>
                  <td>
                    {s.is_real_opportunity ? (s.summary || '') : <span className="neg">Not a real opportunity</span>}
                    <br />
                    <span className="mut">{s.city || ''} {s.service_match || ''}</span>
                  </td>
                  <td className="mut">{(s.reasons || []).join('. ')}</td>
                  <td>{s.recommended_action || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mut">
            Anything scoring 50 or more and judged a real opportunity was added to your pipeline above. The rest were
            left out on purpose, so the list stays worth your time.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Paste a post you found</h2>
        <p className="mut">
          Found something in a Facebook group, on Nextdoor, or in a message? Paste the text here. Luna scores it the
          same way, and it lands in your pipeline if it is real work.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste the whole post, including the location if it is mentioned"
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={scorePaste} disabled={busy === 'paste'}>
            {busy === 'paste' ? 'Luna is reading it...' : 'Score it'}
          </button>
        </div>

        {pasteResult && (
          <div className={`note ${pasteResult.score >= 80 ? '' : pasteResult.score >= 50 ? 'warn' : 'bad'}`}>
            <b>Score {pasteResult.score}</b>
            {pasteResult.is_real_opportunity ? '' : ' - judged not a real opportunity'}
            <br />
            {pasteResult.summary}
            <br />
            <b>Why:</b> {(pasteResult.reasons || []).join('. ')}
            <br />
            <b>Do this:</b> {pasteResult.recommended_action}
            {pasteResult.estimated_value ? (
              <>
                <br />
                <b>Value as stated:</b> ${pasteResult.estimated_value.toLocaleString('en-US')}
              </>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
