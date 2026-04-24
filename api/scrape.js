import { createClient } from '@supabase/supabase-js'

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
  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  try {
    // Step 1: Get clean page text from Jina
    const pageRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(25000),
    })
    if (!pageRes.ok) {
      return res.status(400).json({ error: `Could not fetch that page (HTTP ${pageRes.status})` })
    }
    const pageText = await pageRes.text()
    const text = pageText.trim().slice(0, 6000)

    // Step 2: Extract structured data with Groq
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 2000,
        messages: [
          {
            role: 'system',
            content: `Extract student resources from this page. Return only valid JSON:

{
  "title": "Name of the resource",
  "organization": "Who offers it",
  "deadline": "YYYY-MM-DD or null",
  "description": "2-3 sentences what this is",
  "type": "internship | scholarship | club | event | other",
  "college": "canada | csm | skyline | smccd",
  "apply_url": "direct link or source URL"
}

Rules:
- college: canaada=canada, college of san mateo=csm, skyline=skyline, district wide=smccd
- type: work experience=internship, money=scholarship, group=club, one time=event, else=other
- Only future deadlines. Past deadlines = null
- If multiple resources, return an array.
- No markdown fences, no explanation. Just JSON.
`,
          },
          {
            role: 'user',
            content: `URL: ${url}\n\nPage content:\n${text}`,
          },
        ],
      }),
    })

    const groqData = await groqRes.json()
    let extracted = null

    try {
      extracted = JSON.parse(groqData.choices[0].message.content.trim())
    } catch {
      // If AI returns bad JSON, make simple entry from URL
      extracted = {
        title: url.split('/').filter(Boolean).pop().replace(/-/g, ' ') || 'Resource',
        organization: new URL(url).hostname.replace('www.', ''),
        deadline: null,
        description: 'Resource found at ' + url,
        type: 'other',
        apply_url: url,
      }
    }

    // Step 3: Normalize and insert
    const items = Array.isArray(extracted) ? extracted : [extracted]
    const validItems = items.filter(item => item && item.title)

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'Could not extract resources' })
    }

    const now = new Date().toISOString()
    const today = new Date().toISOString().split('T')[0]

    const enriched = validItems.map(item => ({
      title: item.title || 'Untitled Resource',
      organization: item.organization || null,
      deadline: item.deadline && item.deadline >= today ? item.deadline : null,
      description: item.description || null,
      type: ['internship','scholarship','club','event'].includes(item.type) ? item.type : 'other',
      college: ['canada','csm','skyline'].includes(item.college) ? item.college : 'csm',
      source_url: url,
      apply_url: item.apply_url || url,
      scraped_at: now,
    }))

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
