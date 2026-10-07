'use client';

import { useEffect, useState } from 'react';

/**
 * The AI CEO briefing. The numbers come from the server route, which counts them
 * from the database and refuses to let the model invent anything. If the AI
 * cannot run, this panel says why rather than showing a made up paragraph.
 */
export default function Briefing() {
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState('');
  const [blocked, setBlocked] = useState('');
  const [cost, setCost] = useState<string>('');

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const res = await fetch('/api/briefing', { method: 'POST' });
        const json = await res.json();
        if (gone) return;
        if (json.ok) {
          setBrief(json.briefing);
          setCost(json.costCents ? `$${(json.costCents / 100).toFixed(4)}` : '');
        } else {
          setBlocked(json.message || 'The briefing could not run.');
        }
      } catch (e) {
        if (!gone) setBlocked('Could not reach the server for the briefing.');
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
  }, []);

  return (
    <div className="card">
      <div className="spread">
        <h2>The AI CEO briefing</h2>
        <span className="mut">Royal &middot; reads your live numbers{cost ? ` &middot; last run ${cost}` : ''}</span>
      </div>

      {loading && <p className="mut">Royal is reading your numbers...</p>}

      {!loading && blocked && (
        <div className="note warn">
          <b>The briefing did not run.</b>
          <br />
          {blocked}
          <br />
          <span className="mut">
            Everything else on this page is counted directly from your database and is unaffected.
          </span>
        </div>
      )}

      {!loading && brief && <div className="note">{brief}</div>}

      {!loading && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setBlocked('');
            setBrief('');
            const res = await fetch('/api/briefing', { method: 'POST' });
            const json = await res.json();
            if (json.ok) {
              setBrief(json.briefing);
              setCost(json.costCents ? `$${(json.costCents / 100).toFixed(4)}` : '');
            } else {
              setBlocked(json.message || 'The briefing could not run.');
            }
            setLoading(false);
          }}
        >
          <button className="ghost" type="submit" disabled={loading}>
            Write it again
          </button>
        </form>
      )}
    </div>
  );
}
