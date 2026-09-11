# Inventory Mommy

Identify items from photos, get an AI price estimate, save a listing draft, and file them on a shelf or bin.

No eBay developer account is required. The app does **not** post to eBay — you copy the draft yourself. Prices come from live web search of eBay and other marketplaces, then the app sets your price **$1 below the lowest comp**.

## Setup

```bash
npm install
npx prisma db push
```

Put your OpenAI key in `.env`:

```
OPENAI_API_KEY=sk-...
APP_PASSWORD=   # optional
```

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On your phone (same Wi‑Fi), use `http://YOUR_MAC_IP:3000`.

## Deploy to Netlify

This app needs a **hosted database**. Local SQLite (`file:../data/app.db`) does not work on Netlify.

1. Push this repo to GitHub (or GitLab / Bitbucket).
2. In [Netlify](https://app.netlify.com): **Add new site → Import an existing project**.
3. Build settings (also in `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node: `20`
4. Add environment variables (Site settings → Environment variables):
   - `DATABASE_URL` — hosted Postgres or Turso URL (not a local file)
   - `OPENAI_API_KEY`
   - `SESSION_SECRET` — long random string
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SERPAPI_KEY` (optional)
   - `NEXT_PUBLIC_APP_URL` — your Netlify URL, e.g. `https://your-site.netlify.app`
5. Deploy. After first deploy, run Prisma against the hosted DB (`prisma db push`) so tables exist.

Until `DATABASE_URL` points at a hosted DB, the site will build but login/inventory will fail.

## How to use it

1. **Add New Item** — photos + hint → identify → details → listing draft → bin.
2. **Inventory** — search and filter All / Listed / Unlisted / Sold / Draft.
3. Mark an item **Listed**, then **Orders** → pick it from the bin.
4. **Settings** — shelves and boxes (bins).

## Data

- Database: `data/app.db`
- Photos: `data/uploads/`
