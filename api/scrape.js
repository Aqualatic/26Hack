import { createClient } from '@supabase/supabase-js'

// ─── Detect college from URL so it's never wrong ────────────────────────────
function detectCollegeFromUrl(url) {
  const h = new URL(url).hostname.toLowerCase()
  if (h.includes('canadacollege') || h.includes('canada.edu')) return 'canada'
  if (h.includes('collegeofsanmateo') || h.includes('csm.edu')) return 'csm'
  if (h.includes('skylinecollege') || h.includes('skyline.edu')) return 'skyline'
  if (h.includes('smccd')) return 'smccd'
  return null  // let Groq decide if unknown domain
}

// ─── Strip markdown fences Groq likes to add ────────────────────────────────
function stripFences(raw) {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured' })
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' })
  }

  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  // Detect college upfront from the URL itself — reliable, no AI needed
  const urlCollege = detectCollegeFromUrl(url)

  try {
    // ── Step 1: Fetch page text via Jina ──────────────────────────────────
    const pageRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(25000),
    })
    if (!pageRes.ok) {
      return res.status(400).json({ error: `Could not fetch page (HTTP ${pageRes.status})` })
    }
    const pageText = await pageRes.text()
    // Increase limit for list pages — clubs lists can be long
    const text = pageText.trim().slice(0, 12000)

    // ── Step 2: Call Groq ─────────────────────────────────────────────────
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: `You extract student resources from web page content and return ONLY raw JSON.
No markdown, no code fences, no explanation — just JSON.

IMPORTANT — LIST PAGES:
If the page lists multiple items (clubs, scholarships, internships, events, etc.), extract EVERY individual item as its own entry and return a JSON array.
Do NOT collapse a list into one entry. Each club, each scholarship, each program = its own object.

Single resource:
{"title":"...","organization":"...","deadline":null,"description":"1-2 sentences about this specific item","type":"internship|scholarship|club|event|other","college":"canada|csm|skyline|smccd","apply_url":"..."}

List of resources (return this when the page contains multiple items):
[
  {"title":"Club Name","organization":"...","deadline":null,"description":"What this club does","type":"club","college":"canada","apply_url":"https://..."},
  {"title":"Another Club","organization":"...","deadline":null,"description":"What this club does","type":"club","college":"canada","apply_url":"https://..."}
]

Field rules:
- title: the specific item name (club name, scholarship name, program name) — NOT the page title
- organization: who runs it (e.g. "Cañada College Student Life")
- description: 1-2 sentences about what this specific item is / who it is for
- college: cañada/canada college → canada | college of san mateo → csm | skyline → skyline | district-wide → smccd
- type: club/org/group → club | internship/job/work → internship | scholarship/grant/award → scholarship | workshop/fair/event → event | else → other
- deadline: YYYY-MM-DD if a future deadline is mentioned, else null
- apply_url: best link for this specific item, or the source URL if no specific link exists
- CRITICAL: respond with ONLY the JSON array or object, nothing else`,
          },
          {
            role: 'user',
            content: `URL: ${url}\n\nPage content:\n${text}`,
          },
        ],
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      return res.status(500).json({ error: `Groq API error (${groqRes.status}): ${errText}` })
    }

    const groqData = await groqRes.json()
    const rawContent = groqData.choices?.[0]?.message?.content?.trim() ?? ''
    const cleaned = stripFences(rawContent)

    // ── Step 3: Parse Groq response ───────────────────────────────────────
    let extracted = null
    try {
      extracted = JSON.parse(cleaned)
    } catch {
      // Fallback: build one entry from the actual page text
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 20)
      extracted = {
        title:
          lines[0]?.slice(0, 120) ||
          url.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ||
          'Resource',
        organization: new URL(url).hostname.replace('www.', ''),
        deadline: null,
        description: lines.slice(1, 5).join(' ').trim().slice(0, 400) || 'Visit the link for details.',
        type: 'other',
        apply_url: url,
      }
    }

    // ── Step 4: Normalize every item ─────────────────────────────────────
    const items = Array.isArray(extracted) ? extracted : [extracted]
    const validItems = items.filter(item => item?.title)

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'Could not extract any resources from this page' })
    }

    const now = new Date().toISOString()
    const today = new Date().toISOString().split('T')[0]

    const enriched = validItems.map(item => {
      // URL-detected college wins over AI guess — prevents wrong defaults
      const college =
        urlCollege ||
        (['canada', 'csm', 'skyline', 'smccd'].includes(item.college) ? item.college : 'smccd')

      return {
        title: item.title || 'Untitled Resource',
        organization: item.organization || null,
        deadline: item.deadline && item.deadline >= today ? item.deadline : null,
        description: item.description || null,
        type: ['internship', 'scholarship', 'club', 'event'].includes(item.type) ? item.type : 'other',
        college,
        source_url: url,
        apply_url: item.apply_url || url,
        scraped_at: now,
      }
    })

    // ── Step 5: Insert into Supabase ──────────────────────────────────────
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const { data: inserted, error: dbError } = await supabase
      .from('resources')
      .insert(enriched)
      .select()

    if (dbError) {
      return res.status(500).json({ error: `Database error: ${dbError.message}` })
    }

    return res.status(200).json({ success: true, data: inserted })

  } catch (err) {
    console.error('Scrape error:', err)
    return res.status(500).json({ error: err.message })
  }
}