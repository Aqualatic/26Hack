import { createClient } from '@supabase/supabase-js'

// ─── Detect college from URL ─────────────────────────────────────────────────
function detectCollegeFromUrl(url) {
  const h = new URL(url).hostname.toLowerCase()
  if (h.includes('canadacollege') || h.includes('canada.edu')) return 'canada'
  if (h.includes('collegeofsanmateo') || h.includes('csm.edu')) return 'csm'
  if (h.includes('skylinecollege') || h.includes('skyline.edu')) return 'skyline'
  return null
}

// ─── Infer college from item text ────────────────────────────────────────────
function inferCollegeFromText(text, urlCollege) {
  if (urlCollege) return urlCollege
  const t = text.toLowerCase()
  if (/skyline/.test(t)) return 'skyline'
  if (/san mateo|\bcsm\b/.test(t)) return 'csm'
  if (/ca[ñn]ada|\bcan\b/.test(t)) return 'canada'
  return 'smccd'
}

// ─── Parse AcademicWorks markdown table from Jina ────────────────────────────
// Jina renders it as: | award amount | [Name](url) | Actions |
function parseAcademicWorksTable(markdown, sourceUrl) {
  const now = new Date().toISOString()
  const results = []

  for (const line of markdown.split('\n')) {
    const trimmed = line.trim()
    // Must be a table row with pipes, skip header/separator rows
    if (!trimmed.startsWith('|') || trimmed.includes('--- ') || trimmed.includes('Award |')) continue

    const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean)
    if (cells.length < 2) continue

    const awardCell = cells[0] // e.g. "Multiple awards ranging from $1,000 - $10,000"
    const nameCell  = cells[1] // e.g. "[CSM - Rosalie O'Mahony Mathematics/CS Scholarship](https://...)"

    // Extract title and URL from markdown link
    const linkMatch = nameCell.match(/\[([^\]]+)\]\(([^)]+)\)/)
    const title = linkMatch ? linkMatch[1].trim() : nameCell.replace(/\[|\]/g, '').trim()
    const applyUrl = linkMatch ? linkMatch[2].trim() : sourceUrl

    if (!title || title.length < 3) continue

    const college = inferCollegeFromText(title, null)

    results.push({
      title: title.slice(0, 200),
      organization: 'SMCCD Scholarship Office',
      deadline: null,
      description: awardCell.length > 3 ? `Award: ${awardCell}`.slice(0, 300) : null,
      type: 'scholarship',
      college,
      source_url: sourceUrl,
      apply_url: applyUrl,
      scraped_at: now,
    })
  }

  return results
}

// ─── Repair + parse truncated JSON from Groq ─────────────────────────────────
function parseGroqJson(raw) {
  if (!raw) return null
  let s = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  const isArray = s.trimStart().startsWith('[')
  const start = isArray ? s.indexOf('[') : s.indexOf('{')
  if (start === -1) return null
  s = s.slice(start)
  try { return JSON.parse(s) } catch {}
  const last = s.lastIndexOf('}')
  if (last !== -1) {
    try { return JSON.parse(s.slice(0, last + 1) + (isArray ? ']' : '')) } catch {}
  }
  return null
}

// ─── Strip nav/footer noise ──────────────────────────────────────────────────
const NAV_LINE_RE = [
  /^(home|menu|search|login|log in|sign in|sign up|register|contact us|about|sitemap|skip to|back to top)\b/i,
  /^(facebook|twitter|instagram|youtube|linkedin|tiktok|snapchat)\b/i,
  /^(privacy policy|terms of use|accessibility|copyright|©)/i,
  /^\s*[\|>\\/·•]\s*$/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
]
const NAV_HEADINGS = [
  'quick links', 'additional links', 'related links', 'see also',
  'connect with us', 'follow us', 'social media', 'contact us',
  'more information', 'footer', 'navigation', 'breadcrumb',
]
function cleanPage(raw) {
  const lines = raw.split('\n')
  let inNav = false
  const kept = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) { kept.push(''); continue }
    const lower = t.toLowerCase().replace(/[#*_]/g, '').trim()
    if (NAV_HEADINGS.some(kw => lower.includes(kw))) { inNav = true; continue }
    if (/^#{1,3} /.test(t) && !NAV_HEADINGS.some(kw => lower.includes(kw))) inNav = false
    if (inNav) continue
    if (NAV_LINE_RE.some(p => p.test(t))) continue
    kept.push(line)
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' })
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: 'Supabase credentials not configured' })

  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  const urlCollege = detectCollegeFromUrl(url)
  const isAcademicWorks = new URL(url).hostname.includes('academicworks.com')

  try {
    // ── Step 1: Fetch via Jina ────────────────────────────────────────────
    const jinaHeaders = {
      Accept: 'text/plain',
      'x-timeout': '25',
      ...(isAcademicWorks && {
        'x-wait-for-selector': 'table, .opportunity-card, main',
        'x-remove-selector': 'nav, footer, header',
      }),
    }

    const pageRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: jinaHeaders,
      signal: AbortSignal.timeout(30000),
    })
    if (!pageRes.ok) return res.status(400).json({ error: `Could not fetch page (HTTP ${pageRes.status})` })

    const rawText = await pageRes.text()
    console.log('[scrape] Jina length:', rawText.length, '| sample:', rawText.slice(0, 200))

    if (rawText.trim().length < 100) {
      return res.status(400).json({ error: 'Page returned too little content — it may require login or is JavaScript-only.' })
    }

    // ── AcademicWorks: parse the markdown table directly, no Groq needed ──
    if (isAcademicWorks) {
      const enriched = parseAcademicWorksTable(rawText, url)
      console.log('[scrape] AcademicWorks parsed:', enriched.length, 'scholarships')

      if (enriched.length === 0) {
        return res.status(400).json({ error: 'Could not find scholarship table in page. The page layout may have changed.' })
      }

      const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      const { data: inserted, error: dbError } = await supabase.from('resources').insert(enriched).select()
      if (dbError) return res.status(500).json({ error: `Database error: ${dbError.message}` })
      return res.status(200).json({ success: true, data: inserted })
    }

    // ── Standard flow: Jina text → Groq ──────────────────────────────────
    const text = cleanPage(rawText).slice(0, 6000)

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content: `Extract real student resources from a community college page. Return ONLY raw JSON — no prose, no markdown fences.

EXTRACT: named clubs/orgs, scholarships, internships, academic support programs (EOPS, DSPS, tutoring, transfer center), campus services (food pantry, health center, CalWORKs), events with real details.

SKIP: nav links, Home/About/Contact/Login, social media, footers, breadcrumbs, staff directories, generic headings with no content, duplicates.

Multiple resources → JSON array. One resource → JSON object. None → {"error":"no_resources"}

Each item: {"title":"exact name","organization":"who runs it","deadline":null,"description":"1 short sentence","type":"club|scholarship|internship|event|other","college":"canada|csm|skyline|smccd","apply_url":"https://..."}

Keep descriptions SHORT (1 sentence). title = specific item name not page title. deadline = YYYY-MM-DD only if a real future date is stated, else null. college: look for keywords — 'skyline'→skyline, 'san mateo' or 'CSM'→csm, 'cañada' or 'canada'→canada, district-wide or unclear→smccd.`,
          },
          { role: 'user', content: `URL: ${url}\n\nPage content:\n${text}` },
        ],
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      return res.status(500).json({ error: `Groq API error (${groqRes.status}): ${errText}` })
    }

    const groqData = await groqRes.json()
    const choice = groqData.choices?.[0]
    const rawContent = choice?.message?.content?.trim() ?? ''

    console.log('[scrape] finish_reason:', choice?.finish_reason)
    console.log('[scrape] Groq tail:', rawContent.slice(-200))

    if (choice?.finish_reason === 'length') {
      return res.status(400).json({ error: 'AI response cut off — too many items. Try a more specific page URL.' })
    }

    const extracted = parseGroqJson(rawContent)
    if (!extracted) {
      console.error('[scrape] Parse failed. Raw:\n', rawContent)
      return res.status(400).json({ error: 'Could not parse AI response.', debug: rawContent.slice(0, 600) })
    }
    if (extracted?.error === 'no_resources') {
      return res.status(400).json({ error: 'No real student resources found on this page.' })
    }

    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()
    const VALID_TYPES = ['internship', 'scholarship', 'club', 'event', 'other']

    const enriched = (Array.isArray(extracted) ? extracted : [extracted])
      .filter(item => item?.title && typeof item.title === 'string' && item.title.trim().length > 2)
      .map(item => ({
        title: item.title.trim().slice(0, 200),
        organization: item.organization?.trim() || null,
        deadline: item.deadline && item.deadline >= today ? item.deadline : null,
        description: item.description?.trim() || null,
        type: VALID_TYPES.includes(item.type) ? item.type : 'other',
        college: inferCollegeFromText([item.title, item.description, item.organization].filter(Boolean).join(' '), urlCollege),
        source_url: url,
        apply_url: item.apply_url || url,
        scraped_at: now,
      }))

    if (enriched.length === 0) {
      return res.status(400).json({ error: 'No valid resources could be extracted from this page.' })
    }

    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { data: inserted, error: dbError } = await supabase.from('resources').insert(enriched).select()
    if (dbError) return res.status(500).json({ error: `Database error: ${dbError.message}` })

    return res.status(200).json({ success: true, data: inserted })

  } catch (err) {
    console.error('[scrape] Unhandled error:', err)
    return res.status(500).json({ error: err.message })
  }
}