import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { askJson, type ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The Content Studio: Max writes a post, and it lands in WAITING_APPROVAL.
 * This route never publishes anything. Your specification is explicit that the
 * AI generates, the CEO reviews, and only then does anything go out, so there
 * is no code path here that publishes.
 */

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

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const platform: string = body?.platform || 'Facebook';
  const contentType: string = body?.contentType || 'Before/After';
  const brief: string = (body?.brief || '').trim();
  const city: string = body?.city || 'Fort Myers';
  const service: string = body?.service || 'flooring';

  const { data: settings } = await sb
    .from('company_settings')
    .select('display_name, legal_name, phone, service_areas, services')
    .single();

  // What has actually worked, from your own records. Max is told this, so the
  // advice is based on your data rather than generic marketing theory.
  const [posts, chan] = await Promise.all([
    sb.from('social_posts').select('platform, content_type, status, engagement').eq('status', 'PUBLISHED').limit(120),
    sb.from('marketing_channels').select('name, platform, spend, leads_count')
  ]);

  const published = posts.data || [];
  const byType: Record<string, number> = {};
  published.forEach((p) => {
    const t = p.content_type || 'Other';
    byType[t] = (byType[t] || 0) + (Number(p.engagement) || 0);
  });
  const bestType = Object.keys(byType).sort((a, b) => byType[b] - byType[a])[0] || null;

  const record =
    published.length === 0
      ? 'This company has no post history recorded yet, so you have no performance data to lean on. Write from your understanding of the trade.'
      : 'Recorded performance from this company: ' +
        Object.entries(byType).map(([k, v]) => `${k} total engagement ${v}`).join(', ') +
        '. Best performing type so far: ' + bestType + '.';

  const system = `You write social media content for ${settings?.display_name || 'Royal Lion Renovations'}, a family owned flooring and remodeling company in Southwest Florida, run by Christian and Coral. Serviced areas: ${(settings?.service_areas || []).join(', ')}. Work they do: ${(settings?.services || []).join(', ')}.

How to write:
- Sound like a real crew talking about real work. Not an advertisement, not a robot, no marketing filler.
- Never invent a review, a certification, an award, a customer name or a photo you do not know exists.
- Use the city name in the caption and in the hashtags, because that is what makes local people find them.
- Hashtags: three to five, local ones first, no hashtag spam.
- Keep the promise modest and true. They are a small company, and honesty sells better here than hype.
- ${record}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    {
      role: 'user',
      content:
        `Platform: ${platform}\nContent type: ${contentType}\nCity: ${city}\nWork to show: ${service}\n` +
        (brief ? `What the CEO wants included: ${brief}\n` : '') +
        '\nReturn JSON with this exact shape:\n' +
        '{' +
        '"hook":"one line that stops the scroll",' +
        '"caption":"the caption, three to six lines, plain language",' +
        '"cta":"one clear action",' +
        '"hashtags":["#Three","#ToFive","#Tags"],' +
        '"media_plan":"what photo or video to attach, in one sentence",' +
        '"reel_concept":"if this suits a short video, the five second beats, otherwise an empty string",' +
        '"short_version":"a two line version for stories",' +
        '"long_version":"a full version with a little more detail"' +
        '}'
    }
  ];

  const r = await askJson<Draft>(messages, {
    agentSlug: 'max',
    purpose: 'content_draft',
    userId: user.id,
    maxTokens: 1500,
    temperature: 0.7
  });

  if (!r.ok) return NextResponse.json({ ok: false, message: r.message });

  const d = r.data;
  const { data: saved, error } = await sb
    .from('social_posts')
    .insert({
      platform,
      content_type: contentType,
      hook: d.hook || null,
      caption: d.caption || null,
      cta: d.cta || null,
      hashtags: Array.isArray(d.hashtags) ? d.hashtags.join(' ') : String(d.hashtags || ''),
      media_plan: d.media_plan || null,
      reel_concept: d.reel_concept || null,
      status: 'WAITING_APPROVAL',
      created_by: user.id
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ ok: false, message: error.message });

  return NextResponse.json({
    ok: true,
    postId: saved?.id,
    draft: d,
    note: 'Saved as waiting for your approval. Nothing is published from this app.'
  });
}
