'use client';

import { useState } from 'react';

/**
 * Royal AI. The chat the CEO actually talks to.
 * The answer is written from a context block the server assembles from the
 * database, so if a figure is missing the assistant says so rather than
 * inventing one. The suggested questions are the ones from your specification.
 */
export default function RoyalChat() {
  const [q, setQ] = useState('');
  const [log, setLog] = useState<{ role: 'you' | 'royal'; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [conv, setConv] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const starters = [
    'How is my business doing?',
    'Which lead should I call first?',
    'What are my most profitable services?',
    'How much should I save for taxes?',
    'Who has not paid me?',
    'What should I focus on today?',
    'How many estimates do I need to close to reach $50,000 this month?',
    'What are my worst performing marketing channels?'
  ];

  async function send(question: string) {
    if (!question.trim()) return;
    setLog((l) => [...l, { role: 'you', text: question }]);
    setQ('');
    setBusy(true);
    setNote('');
    try {
      const res = await fetch('/api/royal-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationId: conv })
      });
      const json = await res.json();
      if (json.ok) {
        setLog((l) => [...l, { role: 'royal', text: json.answer }]);
        setConv(json.conversationId);
      } else {
        setNote(json.message || 'Royal could not answer.');
      }
    } catch {
      setNote('Could not reach the server.');
    }
    setBusy(false);
  }

  return (
    <>
      <div className="card">
        <h2>Ask Royal</h2>
        <p className="mut">
          Royal reads your own records on the server before answering. It cannot see anything you have not entered,
          and it is told to say so rather than guess.
        </p>

        <div className="row" style={{ marginBottom: 10 }}>
          {starters.map((s) => (
            <button key={s} className="ghost tiny" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(q);
          }}
        >
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask anything about the company"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button type="submit" disabled={busy || !q.trim()}>
              {busy ? 'Royal is reading your numbers...' : 'Ask Royal'}
            </button>
            {log.length > 0 && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setLog([]);
                  setConv(null);
                }}
              >
                Start a new conversation
              </button>
            )}
          </div>
        </form>

        {note && <div className="note warn">{note}</div>}
      </div>

      {log.map((m, i) => (
        <div key={i} className={`note ${m.role === 'royal' ? '' : 'good'}`}>
          <b>{m.role === 'royal' ? 'Royal' : 'You'}</b>
          <br />
          <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
        </div>
      ))}
    </>
  );
}
