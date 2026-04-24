# SMCCD Resource Tree

A visual resource tree for Cañada, CSM, and Skyline College students.
Submit a link → AI scrapes and cleans it → it appears as a node in the tree.

## Stack (all free)
- **Frontend**: React + Vite
- **Backend**: Vercel serverless functions
- **Database**: Supabase (free tier)
- **AI**: Groq API (free tier, Llama 3)
- **Hosting**: Vercel (free tier)

---

## Setup — do these steps in order

### 1. Get your free API keys

**Supabase**
1. Go to https://supabase.com and sign up
2. Create a new project (choose a region close to California)
3. Wait ~2 min for it to spin up
4. Go to Project Settings → API
5. Copy:
   - `Project URL` → this is your `SUPABASE_URL`
   - `anon public` key → this is your `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → this is your `SUPABASE_SERVICE_KEY` ⚠️ keep this secret

**Groq**
1. Go to https://console.groq.com and sign up (free, no credit card)
2. Go to API Keys → Create API Key
3. Copy it → this is your `GROQ_API_KEY`

---

### 2. Set up the database

1. In your Supabase project, go to **SQL Editor**
2. Click **New query**
3. Paste the entire contents of `supabase-schema.sql`
4. Click **Run**

This creates the `resources` table, search index, and seeds 3 starter resources.

---

### 3. Set up the project locally

```bash
# Clone or download this project, then:
cd smccd-resource-tree

# Install dependencies
npm install

# Create your local env file
cp .env.example .env.local
```

Open `.env.local` and fill in your Supabase values:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Run locally:
```bash
npm run dev
```

Open http://localhost:5173 — you should see the tree with your 3 seed resources.

> Note: The "Add link" button won't work locally because the `/api/scrape`
> serverless function only runs on Vercel. You can test it after deploying.

---

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (follow the prompts — say yes to defaults)
vercel
```

When it asks about settings:
- Framework: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

After your first deploy, add environment variables in the **Vercel dashboard**:
1. Go to your project → Settings → Environment Variables
2. Add all four:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `GROQ_API_KEY`
3. Redeploy: `vercel --prod`

---

### 5. Test it end-to-end

1. Open your deployed Vercel URL
2. Click **+ Add link**
3. Paste a real URL — try something like:
   - https://canadacollege.edu/scholarships
   - https://collegeofsanmateo.edu/internships
4. Pick the college and category
5. Click **Scrape & place**
6. Watch the node appear in the tree ✓

---

## Project structure

```
smccd-resource-tree/
├── api/
│   └── scrape.js          ← Vercel serverless function (scrape + AI + DB write)
├── src/
│   ├── components/
│   │   ├── ResourceTree.jsx   ← SVG tree renderer
│   │   ├── AddResourceModal.jsx
│   │   └── Tooltip.jsx
│   ├── hooks/
│   │   └── useResources.js    ← Supabase data + real-time subscription
│   ├── lib/
│   │   ├── supabase.js        ← Supabase client
│   │   └── constants.js       ← College/category colors and labels
│   ├── App.jsx
│   └── main.jsx
├── supabase-schema.sql    ← Run this in Supabase SQL editor
├── .env.example           ← Copy to .env.local and fill in
├── index.html
├── vite.config.js
└── package.json
```

## How the AI pipeline works

1. User submits a URL + picks college + picks category hint
2. `/api/scrape` fetches the page HTML server-side
3. HTML is stripped of scripts/styles/nav/footer with regex
4. Cleaned text (max 4000 chars) is sent to Groq (Llama 3)
5. Groq returns structured JSON: title, org, deadline, description, type, apply_url
6. JSON is validated and inserted into Supabase
7. Frontend receives the new node and re-renders the tree
8. Real-time subscription means all open browsers update simultaneously

## Known limitations (fine for a hackathon)

- **JS-rendered sites**: Sites that load content via JavaScript won't scrape well.
  Cheerio/fetch only sees static HTML. Workaround: Puppeteer (costs money on Vercel).
- **Anti-scraping**: Some sites block bots. The User-Agent header helps but isn't foolproof.
- **Groq rate limits**: Free tier allows ~30 requests/minute. More than enough for a hackathon.
