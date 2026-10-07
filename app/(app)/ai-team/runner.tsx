'use client';

import { useState } from 'react';

type Agent = {
  slug: string;
  name: string;
  department: string;
  job: string;
  status: string;
  monthly_cost: number;
};

/**
 * Runs an agent and shows the answer. Each agent has a button, because the CEO
 * runs the team rather than the team running the company.
 */
export default function AgentRunner({ agents, spend }: { agents: Agent[]; spend: Record<string, number> }) {
  const [active, setActive] = useState<string>(agents[0]?.slug || 'royal');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [extra, setExtra] = useState('');

  async function run() {
    setBusy(true);
    setAnswer('');
    setNote('');
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: active, context: extra })
      });
      const json = await res.json();
      if (json.ok) {
        setAnswer(json.answer);
        setNote(`${json.agent} ran. Cost this run: $${((json.costCents || 0) / 100).toFixed(4)}.`);
      } else {
        setNote(json.message || 'The agent could not run.');
      }
    } catch {
      setNote('Could not reach the server.');
    }
    setBusy(false);
  }

  const chosen = agents.find((a) => a.slug === active);

  return (
    <div className="card">
      <h2>Run an agent</h2>
      <div className="row">
        <select value={active} onChange={(e) => setActive(e.target.value)} disabled={busy}>
          {agents.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.name} - {a.department}
              {a.status === 'PAUSED' ? ' (paused)' : ''}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={busy || chosen?.status === 'PAUSED'}>
          {busy ? 'Working...' : `Run ${chosen?.name || ''}`}
        </button>
        {chosen && (
          <span className="mut">
            {chosen.job} &middot; recorded AI cost so far ${(spend[chosen.slug] || 0).toFixed(2)}
          </span>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <label>
          Add a specific question or instruction, optional
          <textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="For example: focus on the Cape Coral leads this week"
            style={{ marginTop: 4 }}
            disabled={busy}
          />
        </label>
      </div>

      {note && <div className="note warn">{note}</div>}
      {answer && <div className="note">{answer}</div>}
    </div>
  );
}
