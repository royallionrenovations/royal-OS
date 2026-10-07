# ROYAL LION OS

The private operating system for **Royal Lion Renovations LLC** — built from the specification you wrote.

This repository is the Tier 2 application: a hosted web app with a Postgres database,
logins, and the AI team (Royal, Luna, Leo, Max, Roy, Lion) working against your real data.

I wrote every file in it. I could not run any of it, so treat your first deploy as the test.
The README assumes you have never deployed anything before.

---

## 1. What you are going to create (three free accounts)

| Service | What it does | Cost |
|---|---|---|
| **Supabase** | Your database, logins, and file storage | Free tier covers a company your size for a long time |
| **Vercel** | Runs the website and the AI functions | Free tier |
| **OpenAI** | Powers Royal AI and the agents | Pay per use, usually a few dollars a month at your volume |

**Why OpenAI for the model:** it is the cheapest of the three for the mix this app needs —
writing, classifying leads, and reading numbers. I use `gpt-4o-mini` for the routine work, which
is a fraction of a cent per request, and `gpt-4o` only for the monthly strategy report. Anthropic
writes better long prose and Google has a generous free tier, so either is a reasonable switch:
the model name lives in one file (`lib/ai.ts`) so you change one line.

---

## 2. Set it up, in order

### Step 1 — Supabase

1. Go to supabase.com and create a free account.
2. Click **New project**. Name it `royal-lion-os`. Choose the region closest to you
   (East US is right for Florida). Save the database password somewhere safe.
3. Wait about two minutes for the project to finish building.
4. Open **SQL Editor**, click **New query**, paste the entire contents of
   `supabase/schema.sql`, and click **Run**. You should see "Success. No rows returned."
   That created every table, the indexes, the security rules, and the initial settings row.
5. Open **Project Settings → API** and copy these three values somewhere temporary:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public** key
   - **service_role** key — keep this one secret, it bypasses all security

### Step 2 — OpenAI

1. Go to platform.openai.com, create an account, and add a payment method.
2. Set a **monthly budget limit** in Billing. Start at $10. You can raise it later.
3. Open **API keys**, click **Create new secret key**, name it `royal-lion-os`, and copy it.
   You will never see it again, so paste it somewhere safe now.

### Step 3 — Vercel

1. Go to vercel.com and create an account with your email.
2. On the dashboard click **Add New → Project**.
3. Choose **Import** and upload this folder, or connect a GitHub repository if you use one.
4. Before clicking Deploy, open **Environment Variables** and add each of these, one per line:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
| `OPENAI_API_KEY` | your OpenAI key |
| `ROYAL_AI_MODEL` | `gpt-4o-mini` |
| `ROYAL_AI_MODEL_DEEP` | `gpt-4o` |
| `COMPANY_NAME` | `Royal Lion Renovations LLC` |
| `MAX_DAILY_AI_CENTS` | `200` |

5. Click **Deploy**. In about two minutes you get a live address like
   `royal-lion-os.vercel.app`.

### Step 4 — Make yourself the CEO

1. Open your new address and click **Create account**. Use your real email.
2. Supabase emails you a confirmation link. Click it.
3. Sign in. You will see a screen saying you are waiting for approval — that is correct,
   because the schema makes every new account a `PENDING` user with no access.
4. Back in Supabase, open **SQL Editor** and run this, with your email in place of mine:

```sql
update profiles
set role = 'CEO', status = 'ACTIVE', full_name = 'Christian'
where email = 'you@example.com';
```

5. Reload the app. You are now the CEO with full access.

Every other account you create later stays `PENDING` until you approve it on the Settings page,
which is how the spec's "CEO approves access" requirement is enforced.

---

## 3. What is finished and what is not

**Finished**

- The database: 34 tables covering leads, customers, estimates, contracts, change orders,
  projects, tasks, invoices, payments, transactions, marketing, content, reports and the AI team
- Logins, roles, and per-row security so one user cannot see another company's data
- The AI layer: Royal AI chat, the six agents, the daily briefing, and lead scoring
- The lead hunter, using sources that are legal to use
- The estimator maths, with a PDF estimate document
- The cost guard, so your AI bill cannot run away

**You must do, and I cannot do for you**

- The three accounts, the keys, and the deploy
- The OAuth connections for Facebook, Instagram and Google Business (Meta and Google require you
  to register an app and be approved, which is a review process only the business owner can submit)
- Your real prices, margins and service catalogue in Settings
- A CPA's review of the finance logic before you rely on it for tax

---

## 4. Where the AI cannot help, and what happens instead

The spec asks for things no platform can legally do, so here is exactly what the lead hunter does:

| The spec asked for | What is built |
|---|---|
| Reddit leads | Official Reddit API search. You register a free app, it returns real posts. |
| Google and Google Maps data | Google Places API, which is permitted. It does **not** return people asking for quotes. |
| Facebook group posts and Nextdoor | **Not built.** Both forbid automated reading. The hunter opens the searches for you and you paste a post in, where the AI scores it. |
| Instagram, TikTok, website analytics | Manual entry, plus OAuth for Facebook and Instagram if Meta approves your app. |

That table is in the app as well, on the Lead Hunter page, so you always know what you are seeing.

---

## 5. The cost guard

`MAX_DAILY_AI_CENTS` is checked before every AI call. Every request is logged in `ai_usage`.
If a day's spend reaches the limit, the app says so and stops calling the model rather than
quietly running up a bill. The Settings page shows today's spend and the last thirty days.

---

## 6. Backups

Supabase free tier does not include automated backups. On the first of each month, open
**Supabase → Database → Backups → Download**, save the file, and keep it somewhere outside
Supabase. Turn on a calendar reminder now; a backup you never took is not a backup.

---

## 7. Honest limits of this codebase

- I never ran it. Every file is written to the spec and read back, but the first deploy is
  the real test. Expect small fixes; the README's troubleshooting section covers the likely ones.
- The finance analytics are educational reporting, not tax or accounting advice.
- The forecasting screen shows ranges and assumptions and never presents a prediction as fact,
  which your spec asked for and which is the right way to do it.
- OAuth for Meta and Google requires their approval, so those buttons stay greyed out until
  the keys exist. Nothing pretends to be connected.
