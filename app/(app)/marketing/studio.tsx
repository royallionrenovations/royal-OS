'use client';

import { useState } from 'react';

type Draft = {
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  media_plan: string;
  reel_concept: string;
  short_version: string;
  long_version: string;
};

/**
 * The Content Studio. Max writes, using the company's own posts history as
 * evidence of what has worked. Nothing here publishes.
 */
export default function ContentStudio({ areas, services }: { areas: string[]; services: string[] }) {
  const [platform, setPlatform] = useState('Facebook');
  const [contentType, setContentType] = useState('Before/After');
  const [city, setCity] = useState(areas[0] || 'Fort Myers');
  const [service, setService] = useState(services[0] || 'Luxury vinyl plank flooring');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState('');

  const types = [
    'Before/After', 'Educational', 'Promotional', 'Customer Story', 'Behind the Scenes',
    'Founder Story', 'FAQ', 'Local SEO', 'Seasonal', 'Offer', 'Project Showcase'
  ];

  async function write() {
    setBusy(true);
    setDraft(null);
    setNote('');
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, contentType, city, service, brief })
      });
      const json = await res.json();
      if (json.ok) {
        setDraft(json.draft);
        setNote(json.note || '');
      } else {
        setNote(json.message || 'Max could not write that.');
      }
    } catch {
      setNote('Could not reach the server.');
    }
    setBusy(false);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setNote('Copied. Paste it into the platform when you are ready.');
  }

  return (
    <div className="card">
      <h2>Content Studio</h2>
      <p className="mut">
        Max writes it, you approve it, and you paste it where you want it. Add your real job photos before posting:
        a before and after picture does more than any caption.
      </p>

      <div className="row">
        <label>
          Platform
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            {['Facebook', 'Instagram', 'Instagram Reel', 'TikTok', 'Google Business Profile'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Type of content
          <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>
          City
          <select value={city} onChange={(e) => setCity(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            {areas.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label>
          Work to show
          <select value={service} onChange={(e) => setService(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            {services.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <label>
          Anything specific to include, optional
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="For example: a finished bathroom in Cape Coral, tub to shower conversion, took four days"
            style={{ marginTop: 4 }}
          />
        </label>
      </div>

      <div className="row">
        <button onClick={write} disabled={busy}>{busy ? 'Max is writing...' : 'Write a post'}</button>
      </div>

      {note && <div className="note warn">{note}</div>}

      {draft && (
        <div className="note">
          <b>Hook</b>
          <br />
          {draft.hook}
          <br />
          <br />
          <b>Caption</b>
          <br />
          <span style={{ whiteSpace: 'pre-wrap' }}>{draft.caption}</span>
          <br />
          <br />
          <b>Call to action</b>
          <br />
          {draft.cta}
          <br />
          <br />
          <b>Hashtags</b>
          <br />
          {(draft.hashtags || []).join(' ')}
          <br />
          <br />
          <b>What to photograph</b>
          <br />
          {draft.media_plan}
          {draft.reel_concept ? (
            <>
              <br />
              <br />
              <b>Reel concept</b>
              <br />
              {draft.reel_concept}
            </>
          ) : null}
          <br />
          <br />
          <b>Short version for stories</b>
          <br />
          {draft.short_version}
          <br />
          <br />
          <b>Long version</b>
          <br />
          <span style={{ whiteSpace: 'pre-wrap' }}>{draft.long_version}</span>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="ghost tiny" onClick={() => copy(`${draft.hook}\n\n${draft.caption}\n\n${draft.cta}\n\n${(draft.hashtags || []).join(' ')}`)}>
              Copy the post
            </button>
            <button className="ghost tiny" onClick={() => copy(`${draft.short_version}\n\n${(draft.hashtags || []).join(' ')}`)}>
              Copy the short version
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
