import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { ask, type ChatMessage } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The Lead Hunter.
 *
 * The specification is firm about this and it is right to be: no scraping, no
 * bypassing authentication, no evading rate limits, no spamming. So this route
 * only ever calls a public API that the owner has registered for themselves,
 * using their own key. If a key is missing the source reports that plainly
 * instead of pretending to search.
 *
 * Sources and their honest status:
 *   Reddit        - official API, works with a free registered app
 *   Google Places - official API, but it returns businesses, not people asking
 *                   for quotes, so it is for finding partner builders and
 *                   suppliers rather than homeowners
 *   Facebook      - not automated anywhere in this app. Meta forbids it.
 *   Nextdoor      - not automated anywhere in this app. It forbids it.
 *   Instagram     - not automated. Manual entry only.
 *   TikTok        - not automated. Manual entry only.
 *
 * What the CEO gets for the closed sources: a set of prepared searches that open
 * in his own browser, and the paste-and-score box, which is what the Leads page
 * uses for anything found by hand.
 */

type Found = {
  source: string;
  title: string;
  url: string;
  text: string;
  author: string | null;
  posted_at: string | null;
  city: string | null;
};

async function fromReddit(sub: string, query: string): Promise<{ found: Found[]; status: string }> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;

  if (!id || !secret) {
    return {
      found: [],
      status:
        'Reddit needs a free app of your own. Create one at reddit.com/prefs/apps (type: script), then save the id and secret in Settings.'
    };
  }

  try {
    const auth = Buffer.from(`${id}:${secret}`).toString('base64');
    const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'royal-lion-os/1.0'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenRes.ok) {
      return { found: [], status: `Reddit refused the login (${tokenRes.status}). Check the id and secret.` };
    }

    const token = (await tokenRes.json()).access_token as string;
    const url =
      `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/search?` +
      `q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=month&limit=25`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'royal-lion-os/1.0' }
    });
    if (!res.ok) return { found: [], status: `Reddit search failed (${res.status}). Try again shortly.` };

    const json = await res.json();
    const posts = (json?.data?.children || []).map((c: any) => c.data);

    return {
      found: posts.map((p: any) => ({
        source: 'Reddit',
        title: p.title || '',
        url: 'https://www.reddit.com' + (p.permalink || ''),
        text: (p.title || '') + '\n' + (p.selftext || ''),
        author: p.author ? 'u/' + p.author : null,
        posted_at: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
        city: null
      })),
      status: `${posts.length} post(s) returned from r/${sub} in the last month.`
    };
  } catch (e) {
    return { found: [], status: `Reddit could not be reached: ${String(e)}` };
  }
}

async function fromPlaces(city: string, query: string): Promise<{ found: Found[]; status: string }> {
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) {
    return {
      found: [],
      status:
        'Google Places needs a key from your own Google Cloud project. This source returns businesses such as builders, property managers and suppliers, not homeowners asking for quotes, so it is for finding partners.'
    };
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating'
      },
      body: JSON.stringify({ textQuery: `${query} in ${city} FL`, maxResultCount: 20 })
    });

    if (!res.ok) return { found: [], status: `Google Places returned ${res.status}. Check the key and billing.` };

    const json = await res.json();
    const places = json.places || [];

    return {
      found: places.map((p: any) => ({
        source: 'Google Places',
        title: p.displayName?.text || 'Business',
        url: p.websiteUri || '',
        text:
          `${p.displayName?.text || ''} | ${p.formattedAddress || ''} | ` +
          `${p.nationalPhoneNumber || ''} | rating ${p.rating || 'none'}`,
        author: null,
        posted_at: null,
        city
      })),
      status: `${places.length} business(es) found in ${city}. These are potential partners or competitors, not homeowners.`
    };
  } catch (e) {
    return { found: [], status: `Google Places could not be reached: ${String(e)}` };
  }
}

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const city: string = body?.city || 'Fort Myers';
  const service: string = body?.service || 'flooring';
  const which: string[] = body?.sources || ['reddit', 'google_places'];

  const report: { source: string; status: string; found: Found[] }[] = [];

  for (const s of which) {
    if (s === 'reddit') {
      const subs = ['FortMyers', 'CapeCoral', 'Naples', 'Florida'];
      const query = `${service} OR flooring OR tile OR remodel OR bathroom`;
      let all: Found[] = [];
      const notes: string[] = [];
      for (const sub of subs) {
        const r = await fromReddit(sub, query);
        all = all.concat(r.found);
        notes.push(`r/${sub}: ${r.status}`);
      }
      report.push({ source: 'Reddit', status: notes.join(' '), found: all });
    } else if (s === 'google_places') {
      const r = await fromPlaces(city, `${service} contractor`);
      report.push({ source: 'Google Places', status: r.status, found: r.found });
    } else {
      report.push({
        source: s,
        status:
          s === 'facebook'
            ? 'Facebook is not automated anywhere in this app. Meta forbids reading its groups, so use the prepared searches and paste what you find into the scoring box.'
            : s === 'nextdoor'
              ? 'Nextdoor is not automated. Its rules forbid it. Use the prepared searches and paste what you find.'
              : 'Not automated. Manual entry only.',
        found: []
      });
    }
  }

  const found = report.flatMap((r) => r.found);

  // Duplicate guard, as the specification asks.
  const seen: string[] = [];
  const fresh: Found[] = [];
  for (const f of found) {
    if (!f.url) continue;
    const { data } = await sb.from('leads').select('id').eq('url', f.url).limit(1);
    if (data && data.length) {
      seen.push(f.url);
      continue;
    }
    fresh.push(f);
  }

  return NextResponse.json({
    ok: true,
    report,
    found: fresh,
    skippedAsDuplicate: seen.length,
    next: fresh.length
      ? 'Score these with Luna, then anything real lands in your pipeline.'
      : 'Nothing new came back from the permitted sources. The prepared searches on this page cover the rest.'
  });
}
