import { createClient } from '@supabase/supabase-js'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function looksLikeUrlPath(str) {
  // Returns true if the title is just a URL path fragment like "opportunities"
  const urlLike = /^(opportunities?|awards?|scholarships?|programs?|index|home|about|contact|page)$/i
  return urlLike.test(str.trim()) || str.trim().length < 4
}

function sanitizeTitle(str) {
  // Strip markdown links [text](url) → text
  // Strip trailing [link] or (url) patterns
  // Strip URLs
  if (!str) return ''
  return str
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')   // [text](url) → text
    .replace(/\[([^\]]+)\]/g, '$1')              // [text] → text
    .replace(/\(([^)]+)\)/g, '$1')               // (text) → text
    .replace(/https?:\/\/\S+/g, '')              // bare URLs
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function looksLikeBadExtraction(items, url) {
  // Returns true if every item has a generic title derived from the URL path
  if (!items || items.length === 0) return true
  const pathPart = url.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ').toLowerCase() || ''
  const allBad = items.every(it => {
    const t = (it.title || '').toLowerCase().trim()
    return t === pathPart || t === '' || looksLikeUrlPath(it.title)
  })
  return allBad
}

function parseAcademicWorks(text) {
  // Strategy: look for scholarship blocks in Jina text.
  // AcademicWorks listings often repeat a pattern like:
  //   Scholarship Name
  //   $Amount
  //   Deadline: Date
  //   Description...
  const scholarships = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Heuristic: find lines that look like titles (followed by $ or Deadline)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Look for dollar amounts in nearby lines as a signal this is a scholarship
    const nextLines = lines.slice(i + 1, i + 6).join(' ')
    const hasMoney = /\$[\d,]+/.test(nextLines)
    const hasDeadline = /deadline|due date|closes?/i.test(nextLines)
    const isHeading = line.length > 5 && line.length < 120 && !line.startsWith('http') && !line.startsWith('-')

    if (isHeading && (hasMoney || hasDeadline)) {
      // Try to extract description from following lines
      let description = ''
      let deadline = null
      let j = i + 1
      while (j < lines.length && j < i + 15) {
        const l = lines[j]
        if (/^\$?[\d,]+/.test(l) && !description) {
          // amount line — skip
        } else if (/deadline|due date/i.test(l)) {
          const dmatch = l.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i)
          if (dmatch) deadline = dmatch[1]
        } else if (l.length > 20 && !looksLikeUrlPath(l)) {
          description += l + ' '
        }
        j++
      }

      scholarships.push({
        title: line.replace(/^[-•*]\s*/, ''),
        organization: 'SMCCD Academic Works',
        deadline: deadline,
        description: description.trim() || null,
        type: 'scholarship',
        college: 'smccd',
        apply_url: null,
      })
    }
  }

  return scholarships.length > 0 ? scholarships : null
}

function parseClubList(text, collegeName) {
  // Strategy: look for club names in bulleted/numbered lists
  const clubs = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    // Match bullet lines that look like club names
    const m = line.match(/^[-•*]\s*(.+)/)
    if (m) {
      const name = m[1].trim()
      if (name.length > 3 && name.length < 80 && !/^[\d\.]+$/.test(name)) {
        clubs.push({
          title: name,
          organization: collegeName,
          deadline: null,
          description: null,
          type: 'club',
          college: collegeName.toLowerCase().includes('canada') ? 'canada'
                 : collegeName.toLowerCase().includes('san mateo') ? 'csm'
                 : collegeName.toLowerCase().includes('skyline') ? 'skyline'
                 : 'smccd',
          apply_url: null,
        })
      }
    }
  }

  return clubs.length > 0 ? clubs : null
}

async function callGroq(apiKey, messages, model = 'llama-3.1-8b-instant') {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, temperature: 0.1, max_tokens: 2000, messages }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.choices[0].message.content.trim()
}

function parseJson(raw) {
  const attempts = [
    raw,
    raw.replace(/```json|```/g, '').trim(),
    '[' + raw.replace(/```json|```/g, '').trim() + ']',
  ]
  for (const a of attempts) {
    try { return JSON.parse(a) } catch { continue }
  }
  const m = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/s)
  if (m) {
    try { return JSON.parse(m[0]) } catch {
      try { return JSON.parse('[' + m[0] + ']') } catch { }
    }
  }
  return null
}

/* ── Main handler ────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured in Vercel environment variables.' })
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials are not configured. Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY.' })
  }

  const { url, college, category } = req.body
  if (!url) return res.status(400).json({ error: 'URL is required' })

  const urlLower = url.toLowerCase()
  const isAcademicWorks = urlLower.includes('academicworks.com')
  const isCanadaClubs = urlLower.includes('canadacollege.edu') && urlLower.includes('club')
  const isCsmClubs = (urlLower.includes('collegeofsanmateo.edu') || urlLower.includes('csm.edu')) && urlLower.includes('club')
  const isSkylineClubs = urlLower.includes('skylinecollege.edu') && urlLower.includes('club')

  const validColleges = ['canada', 'csm', 'skyline', 'smccd']
  const validCategories = ['internship', 'scholarship', 'club', 'event', 'other']

  let pageText = ''

  /* ── Step 1: Fetch page ──────────────────────────────────────────────── */
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const pageRes = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(25000),
    })
    if (!pageRes.ok) {
      return res.status(400).json({ error: `Could not fetch that page (HTTP ${pageRes.status}). Try a different URL.` })
    }
    pageText = await pageRes.text()
  } catch (fetchErr) {
    return res.status(400).json({ error: `Could not reach that URL: ${fetchErr.message}` })
  }

  const stripped = pageText.trim().slice(0, 8000)
  let extracted = null

  /* ── Step 2A: Site-specific regex parsers (no AI) ───────────────────── */
  if (isAcademicWorks) {
    extracted = parseAcademicWorks(stripped)
  } else if (isCanadaClubs) {
    extracted = parseClubList(stripped, 'Cañada College')
  } else if (isCsmClubs) {
    extracted = parseClubList(stripped, 'College of San Mateo')
  } else if (isSkylineClubs) {
    extracted = parseClubList(stripped, 'Skyline College')
  }

  /* ── Step 2B: AI extraction (if regex didn't work) ──────────────────── */
  if (!extracted) {
  const systemPrompt = `You extract student resources (scholarships, internships, clubs, events) from web pages.
Return ONLY a JSON array — no markdown, no explanation.

Schema per item:
{
  "title": "short name of the opportunity",
  "organization": "who runs it",
  "deadline": "YYYY-MM-DD or null",
  "description": "1 sentence about what it is",
  "type": "scholarship | internship | club | event | other",
  "college": "canada | csm | skyline | smccd"
}

Rules:
- IGNORE navigation links, "Welcome", "Home", "About", "Contact", login links, menu items, footer links, privacy policy, terms of use.
- IGNORE items that are not real opportunities (no generic page sections).
- Title must be the human-readable name ONLY. No URLs in brackets. No markdown links. Just the plain name.
- type="scholarship" for financial aid / Academic Works.
- type="club" for student organizations.
- type="internship" for jobs/work experience.
- college="smccd" for district-wide / Academic Works.
- college from URL domain if known.
- Return [] if nothing real is found. Never wrap in markdown fences.`

    try {
      const raw = await callGroq(process.env.GROQ_API_KEY, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Source URL: ${url}\n\nPage content:\n${stripped}` },
      ])
      extracted = parseJson(raw)
    } catch (aiErr) {
      console.error('AI extraction failed:', aiErr.message)
    }
  }

  /* ── Step 2C: Retry with better prompt if extraction looks bad ──────── */
  if (looksLikeBadExtraction(extracted, url)) {
    console.log('First extraction looked bad, retrying with stricter prompt...')
    const retryPrompt = `Extract real student opportunities from the page below.
Return ONLY a JSON array.

Schema per item:
{
  "title": "just the name, no links, no brackets",
  "organization": "who offers it",
  "deadline": "YYYY-MM-DD or null",
  "description": "1 sentence",
  "type": "scholarship | internship | club | event | other",
  "college": "canada | csm | skyline | smccd"
}

Rules:
- Skip: Welcome, Home, About, Contact, login, privacy, terms, nav links, footer links.
- Title must be plain text only. No markdown. No [brackets]. No URLs.
- Each item needs its own real name from the page content.
- Academic Works = scholarship + smccd.
- Return [] if nothing real is found.`

    try {
      const raw = await callGroq(process.env.GROQ_API_KEY, [
        { role: 'system', content: retryPrompt },
        { role: 'user', content: `Source URL: ${url}\n\nPage content:\n${stripped}` },
      ], 'llama-3.3-70b-versatile') // stronger model for retry
      extracted = parseJson(raw)
    } catch (aiErr) {
      console.error('Retry AI extraction failed:', aiErr.message)
    }
  }

  /* ── Step 3: Fallback ───────────────────────────────────────────────── */
  if (!extracted) {
    extracted = {
      title: url.split('/').filter(Boolean).pop().replace(/-/g, ' ') || 'Resource',
      organization: new URL(url).hostname.replace('www.', ''),
      deadline: null,
      description: 'Resource found at ' + url,
      type: category || 'other',
      apply_url: url,
    }
  }

  /* ── Step 4: Normalize and validate ─────────────────────────────────── */
  let items = Array.isArray(extracted) ? extracted : [extracted]
  items = items.filter(item => item && item.title)

  if (items.length === 0) {
    return res.status(400).json({ error: 'Could not extract any resources from that page. Try a different URL.' })
  }

  const now = new Date().toISOString()
  const today = new Date().toISOString().split('T')[0]

  const enriched = items.map((item) => {
    let detectedCollege = item.college || college || 'smccd'

    // URL-based overrides
    if (isAcademicWorks) detectedCollege = 'smccd'
    else if (isCanadaClubs) detectedCollege = 'canada'
    else if (isCsmClubs) detectedCollege = 'csm'
    else if (isSkylineClubs) detectedCollege = 'skyline'
    else if (urlLower.includes('collegeofsanmateo.edu') || urlLower.includes('csm.edu')) detectedCollege = 'csm'
    else if (urlLower.includes('skylinecollege.edu')) detectedCollege = 'skyline'
    else if (urlLower.includes('canadacollege.edu')) detectedCollege = 'canada'

    if (!validColleges.includes(detectedCollege)) detectedCollege = 'smccd'

    let detectedType = item.type || category || 'other'
    if (isAcademicWorks) detectedType = 'scholarship'
    else if (isCanadaClubs || isCsmClubs || isSkylineClubs || urlLower.includes('/club') || urlLower.includes('/clubs')) detectedType = 'club'
    if (!validCategories.includes(detectedType)) detectedType = 'other'

    // Clean up titles — strip markdown links, brackets, URLs
    let cleanTitle = sanitizeTitle(item.title || 'Untitled Resource')
    if (looksLikeUrlPath(cleanTitle)) {
      cleanTitle = isAcademicWorks ? 'SMCCD Scholarship Opportunity'
        : isCanadaClubs ? 'Cañada College Club'
        : isCsmClubs ? 'CSM Club'
        : isSkylineClubs ? 'Skyline College Club'
        : 'Resource from ' + new URL(url).hostname.replace('www.', '')
    }

    // Filter past deadlines
    let filteredDeadline = null
    if (item.deadline && item.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
      if (item.deadline >= today) filteredDeadline = item.deadline
    }

    return {
      title: cleanTitle,
      organization: item.organization || null,
      deadline: filteredDeadline,
      description: item.description || null,
      type: detectedType,
      college: detectedCollege,
      category: detectedType,
      source_url: url,
      apply_url: item.apply_url || url,
      scraped_at: now,
    }
  })

  /* ── Step 5: Insert into Supabase ───────────────────────────────────── */
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
}
