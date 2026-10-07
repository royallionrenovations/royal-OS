import { supabaseServer } from '@/lib/supabase';
import RoyalChat from './chat';

export const dynamic = 'force-dynamic';

export default async function RoyalAiPage() {
  const sb = supabaseServer();

  const [convos, settings] = await Promise.all([
    sb.from('ai_conversations').select('id, title, created_at').order('created_at', { ascending: false }).limit(20),
    sb.from('company_settings').select('legal_name').single()
  ]);

  return (
    <div>
      <h1>Royal AI</h1>
      <p className="mut">
        {settings.data?.legal_name || 'Royal Lion Renovations LLC'} &middot; your business intelligence assistant
      </p>

      <RoyalChat />

      {convos.data && convos.data.length > 0 && (
        <div className="card">
          <h2>Recent conversations</h2>
          <table>
            <thead><tr><th>Started</th><th>First question</th></tr></thead>
            <tbody>
              {convos.data.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.created_at).toLocaleDateString('en-US')}</td>
                  <td>{c.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>What Royal will not do</h2>
        <p className="mut">
          It will not invent a number. Every figure it gives you is counted from your database a moment before it
          answers, and when something is missing it says so and names the page that would hold it. It is not a CPA or
          a lawyer, and it will tell you that when the question turns to tax or legal decisions.
        </p>
      </div>
    </div>
  );
}
