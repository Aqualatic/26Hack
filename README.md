# SMCCD Resource Map

A visual, interactive map of student resources across the San Mateo County Community College District (SMCCD), including Cañada College, College of San Mateo (CSM), and Skyline College. Resources are displayed as a force-directed bubble graph where students can explore internships, scholarships, clubs, events, and other opportunities by school, category, and academic major.

## What It Does

The application aggregates student resources from across the three SMCCD colleges and presents them in an explorable visual interface. Instead of browsing separate college websites, students see all opportunities in one place, clustered by school and connected to relevant categories and majors.

Key features:

- **Visual Bubble Map**: A force-simulated graph where each resource is a bubble, colored by category and connected to its home school. District-wide resources anchor to the SMCCD center node.
- **Live Search**: Filter resources by title, organization, description, college name, category, or major-related keywords.
- **Smart Filters**: Hide categories or majors you are not interested in via a blacklist filter panel.
- **AI-Powered Link Scraping**: Submit any URL containing student resources. The system automatically scrapes the page, extracts structured data, classifies the college and category, and places it on the map.
- **Real-Time Sync**: When anyone adds a resource, it appears live on all open browsers via Supabase real-time subscriptions.
- **Dark/Light Theme**: Toggle between dark and light modes, with preference saved locally.

## Architecture

### Frontend

- **React 18** with Vite for fast development and optimized builds.
- **SVG-based rendering**: The bubble map is rendered entirely with SVG, using a custom force-directed layout engine that runs in a fixed coordinate space and auto-fits to the viewport.
- **No external charting libraries**: The graph simulation, pan/zoom, drag interactions, and edge rendering are all implemented natively with React hooks and SVG.

### Backend

- **Vercel Serverless Functions**: A single API route at `/api/scrape` handles the ingestion pipeline.
- **Supabase**: PostgreSQL database with real-time change subscriptions for the `resources` table.
- **Groq API**: Provides fast inference access to open-source language models for the extraction step.

### Data Flow

1. A student or administrator pastes a URL into the "Add link" modal.
2. The frontend sends the URL to `/api/scrape`.
3. The serverless function fetches the page content via the Jina AI Reader, which handles both static and many JavaScript-rendered pages by returning cleaned plain text.
4. The cleaned text is sent to the Groq API running the `llama-3.1-8b-instant` model with a detailed extraction prompt.
5. The AI returns structured JSON for each resource found, including auto-detected college and category.
6. The server normalizes, validates, and inserts the data into Supabase.
7. Supabase broadcasts the insert event to all subscribed clients.
8. The React frontend receives the new resource and re-renders the bubble map.

## The Scraping Pipeline in Detail

### Step 1: Page Retrieval via Jina AI Reader

When a URL is submitted, the backend does not fetch raw HTML directly. Instead, it calls the Jina AI Reader service:

```
https://r.jina.ai/{submitted_url}
```

Jina AI Reader is an external service that visits the target URL, renders the page if necessary, strips boilerplate (navigation, footers, ads, scripts), and returns the meaningful article or listing content as plain text. This avoids the complexity of parsing raw HTML and handles many JavaScript-rendered sites that a simple `fetch` would miss. The backend trims the result to the first 6,000 characters to stay within model context limits.

### Step 2: Structured Extraction via Groq AI

The cleaned text is sent to the Groq API with the following configuration:

- **Model**: `llama-3.1-8b-instant`
- **Temperature**: 0.1 (low creativity, high adherence to instructions)
- **Max tokens**: 2,000

The system prompt instructs the model to act as a data extractor for SMCCD student resources. It is given strict rules to:

- Auto-detect the college from page content (Cañada, CSM, Skyline, or SMCCD for district-wide).
- Auto-detect the resource type (internship, scholarship, club, event, or other).
- Extract a title, organization name, deadline in YYYY-MM-DD format (null if not present or past), a 2-3 sentence description, and a direct application URL.
- Filter out past deadlines.
- Return **only** valid JSON with no markdown fences or explanatory text.

The user message includes the source URL and the cleaned page content.

### Step 3: JSON Parsing with Fallbacks

Because language models occasionally wrap JSON in markdown code blocks or produce malformed output, the backend attempts multiple parsing strategies:

1. Parse the raw response directly.
2. Strip markdown fences and re-parse.
3. Wrap in array brackets and re-parse.
4. Extract the first JSON object or array found via regex.

If all parsing attempts fail, the system falls back to creating a minimal resource entry from the URL itself so nothing is lost.

### Step 4: Normalization and Validation

Before writing to the database, each extracted item is normalized:

- **College mapping**: The AI-detected college is validated against the allowed set. District-wide (`smccd`) and unknown values default to CSM for storage, though the frontend still displays them appropriately.
- **Type mapping**: The detected type is validated against the allowed categories. Invalid types default to `other`.
- **Deadline filtering**: Only future deadlines in strict `YYYY-MM-DD` format are kept. Past deadlines are set to `null`.
- **Defaults applied**: Missing titles become "Untitled Resource", missing organizations become `null`, and missing descriptions become `null`. The original source URL and a scrape timestamp are attached.

### Step 5: Database Insert and Real-Time Broadcast

The normalized items are inserted into the `resources` table in Supabase using the service role key. The insert operation returns the full row data, which is sent back to the frontend as the API response. Simultaneously, Supabase's real-time Postgres changes channel broadcasts the new row to all listening clients, causing the bubble map to update live without a page refresh.

## Project Structure

```
27Hack/
├── api/
│   └── scrape.js                  # Vercel serverless: Jina fetch -> Groq extraction -> Supabase insert
├── src/
│   ├── components/
│   │   ├── BubbleMap.jsx          # Main SVG force-directed graph, pan/zoom, node rendering
│   │   ├── DetailCard.jsx         # Resource detail popup overlay
│   │   ├── FilterPanel.jsx        # Blacklist filter dropdown
│   │   └── AddResourceModal.jsx   # URL submission modal
│   ├── hooks/
│   │   ├── useResources.js        # Supabase fetch + real-time INSERT subscription
│   │   └── useTheme.jsx           # Dark/light theme context with localStorage persistence
│   ├── lib/
│   │   ├── constants.js           # College data, category colors, major patterns, search aliases
│   │   ├── graph.js               # Graph builder + force simulation engine
│   │   ├── helpers.js             # Shared utilities: isActive, detectMajors, deadlineLabel, style helpers
│   │   ├── supabase.js            # Supabase client initialization
│   │   └── theme.js               # Dark and light color token definitions
│   ├── App.jsx                    # Root layout: header, search, theme toggle, modal orchestration
│   ├── main.jsx                   # React root render with ThemeProvider
│   └── critical.css               # Base body styles and theme-aware background
├── index.html                     # HTML shell with font preloads and theme hydration script
├── vite.config.js                 # Vite + React plugin
├── vercel.json                    # API route rewrites
└── package.json
```

## Setup

### Prerequisites

- Node.js 18 or higher
- A free Supabase account
- A free Groq account
- Vercel CLI (optional, for deployment)

### 1. Obtain API Keys

**Supabase**

1. Create a project at https://supabase.com (US West region recommended).
2. Go to Project Settings -> API.
3. Copy:
   - `Project URL` -> `VITE_SUPABASE_URL`
   - `anon public` key -> `VITE_SUPABASE_ANON_KEY`
   - `service_role` key -> `SUPABASE_SERVICE_KEY` (keep secret, never expose to the frontend)

**Groq**

1. Sign up at https://console.groq.com (no credit card required).
2. Create an API key.
3. Copy it -> `GROQ_API_KEY`

### 2. Initialize the Database

1. In your Supabase project, open the **SQL Editor**.
2. Create a new query and paste the contents of `supabase-schema.sql` (if available) or run the following:

```sql
create table resources (
  id bigint generated by default as identity primary key,
  title text not null,
  organization text,
  deadline date,
  description text,
  type text not null check (type in ('internship', 'scholarship', 'club', 'event', 'other')),
  college text not null check (college in ('canada', 'csm', 'skyline', 'smccd')),
  category text,
  source_url text,
  apply_url text,
  scraped_at timestamp with time zone default now()
);

-- Optional: enable real-time for this table
alter publication supabase_realtime add table resources;
```

### 3. Local Development

```bash
# Clone the repository and navigate into it
cd 27Hack

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

Fill in `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run the dev server:

```bash
npm run dev
```

Open http://localhost:5173. The tree will load existing resources from Supabase. Note that the `/api/scrape` endpoint requires Vercel's serverless runtime, so the "Add link" feature only works after deploying or when running via `vercel dev`.

### 4. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

When prompted:
- Framework: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

After the first deploy, add all four environment variables in the Vercel dashboard under Project Settings -> Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `GROQ_API_KEY`

Redeploy:

```bash
vercel --prod
```

### 5. End-to-End Test

1. Open your deployed Vercel URL.
2. Click "+ Add link".
3. Paste a URL such as `https://canadacollege.edu/scholarships` or `https://collegeofsanmateo.edu/internships`.
4. Click "Scrape & place".
5. The backend fetches the page via Jina, extracts resources via Groq, writes them to Supabase, and the new node appears on the map.

## How the Graph Works

The bubble map is built on a custom force-directed simulation that runs in a fixed 1040x740 coordinate space. The layout is deterministic: the SMCCD district node sits at the center, the three schools anchor to fixed positions around it, and resources are seeded in organized angular sectors around their home school. A physics simulation then refines the layout with repulsion, spring forces, gravity, and a restoring force that keeps pinned nodes in place. After the simulation completes, the bounding box is auto-scaled and centered to fit the user's viewport.

Nodes are connected by edges: each resource links to its home school (or the district node), its category, and up to two detected majors. Edge colors reflect the source node's category or school color. Clicking a resource opens a detail card with full information, deadline urgency indicators, and a direct apply link when available.

## Major Detection

The system detects relevant academic majors by scanning resource titles, organizations, and descriptions against a keyword pattern list. For example, words like "programming," "software," or "cybersecurity" trigger a "Computer Science" major label. Words like "nursing," "biology," or "pre-med" trigger "Health Sciences." Up to two majors are attached to each resource to keep the map readable.

## Known Limitations

- **JavaScript-heavy sites**: While Jina AI Reader handles many dynamic pages, some heavily JavaScript-dependent sites may still return incomplete content.
- **Anti-scraping protections**: Certain websites block automated readers. There is no guarantee every URL will succeed.
- **Groq rate limits**: The free tier allows approximately 30 requests per minute, which is sufficient for individual use and small-team testing.
- **AI extraction accuracy**: The language model may occasionally misclassify a college, miscategorize a resource type, or miss embedded deadlines. Manual verification is recommended for critical data.

