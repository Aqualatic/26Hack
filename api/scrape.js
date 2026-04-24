import { createClient } from '@supabase/supabase-js'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

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

  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  // College and category are now optional - AI will auto-detect them
  const validColleges = ['canada', 'csm', 'skyline', 'smccd']
  const validCategories = ['internship', 'scholarship', 'club', 'event', 'other']

  try {
    // Step 1: Fetch via Jina reader (handles JS-rendered pages)
    let pageText
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

    const stripped = pageText.trim().slice(0, 6000)

    // Step 2: Call Groq - AI auto-detects college and category from page content
    const groqRes = await fetch(GROQ_API_URL, {
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
            content: `You are a data extractor for a student resource directory at SMCCD community colleges (Cañada College, College of San Mateo, Skyline College).
Extract resource info from the page text and return ONLY valid JSON — no explanation, no markdown fences, nothing else.

IMPORTANT: Auto-detect the college and category from the page content. Do NOT use any user-provided hints.

Use this schema for each resource:
{
  "title": "name of the resource or opportunity",
  "organization": "who offers it",
  "deadline": "YYYY-MM-DD or null",
  "description": "2-3 sentences about what this is and who it helps",
  "type": "internship | scholarship | club | event | other",
  "college": "canada | csm | skyline | smccd (use smccd if it applies to all colleges or is district-wide)",
  "apply_url": "direct application URL or source URL"
}

Rules for college detection:
- If the page mentions "Cañada" or "Canada College", use "canada"
- If the page mentions "College of San Mateo" or "CSM", use "csm"  
- If the page mentions "Skyline College", use "skyline"
- If the page mentions multiple colleges or is about SMCCD district-wide resources, use "smccd"
- If unclear, use "smccd" as the default

Rules for type detection:
- internship: Work experience, co-op, paid/unpaid positions
- scholarship: Financial aid, grants, funding for education
- club: Student organizations, recurring meetings, groups
- event: One-time occurrences, workshops, info sessions, deadlines for specific dates
- other: General resources, services, or unclear categories

Date filtering rules:
- If a deadline is in the past (before today's date), set deadline to null
- If no deadline is mentioned, set deadline to null
- Only include future deadlines

Special handling for job boards (Indeed, LinkedIn, etc.):
- Extract individual job postings if listed
- For job listings, use "internship" as the type
- Extract company name as organization
- Extract job title as title
- If no specific deadline, set to null

If the page lists multiple resources return a JSON array of the above.
If you cannot find specific resources return one entry summarizing what the page offers.
Always return valid JSON. Never return plain text.`,
          },
          {
            role: 'user',
            content: `Source URL: ${url}\n\nPage content:\n${stripped}`,
          },
        ],
      }),
    })

    if (!groqRes.ok) {
      const groqErr = await groqRes.text()
      return res.status(500).json({ error: `Groq API error: ${groqErr}` })
    }

    const groqData = await groqRes.json()
    const rawJson = groqData.choices[0].message.content.trim()

    // Step 3: Parse JSON with multiple fallbacks
    let extracted = null

    const attempts = [
      rawJson,
      rawJson.replace(/```json|```/g, '').trim(),
      '[' + rawJson.replace(/```json|```/g, '').trim() + ']',
    ]

    for (const attempt of attempts) {
      try {
        extracted = JSON.parse(attempt)
        break
      } catch {
        continue
      }
    }

    if (!extracted) {
      const match = rawJson.match(/(\[[\s\S]*\]|\{[\s\S]*\})/s)
      if (match) {
        try { extracted = JSON.parse(match[0]) } catch {
          try { extracted = JSON.parse('[' + match[0] + ']') } catch { extracted = null }
        }
      }
    }

    if (!extracted) {
      extracted = {
        title: url.split('/').filter(Boolean).pop().replace(/-/g, ' ') || 'Resource',
        organization: new URL(url).hostname.replace('www.', ''),
        deadline: null,
        description: 'Resource found at ' + url,
        type: category,
        apply_url: url,
      }
    }

    // Step 4: Normalize and validate
    const items = Array.isArray(extracted) ? extracted : [extracted]
    const validItems = items.filter(item => item && item.title)

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'Could not extract any resources from that page. Try a different URL.' })
    }

    const now = new Date().toISOString()
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    
    const enriched = validItems.map((item) => {
      // Auto-detect college from AI response, fallback to user hint or default
      let detectedCollege = item.college || college || 'csm'
      // Map smccd to a valid college (default to CSM as the largest)
      // The bubble map will handle showing it under SMCCD district
      if (detectedCollege === 'smccd' || !validColleges.includes(detectedCollege)) {
        detectedCollege = 'csm'  // Default to CSM for district-wide resources
      }

      // Auto-detect type from AI response, fallback to user hint or other
      let detectedType = item.type || category || 'other'
      if (!validCategories.includes(detectedType)) {
        detectedType = 'other'
      }

      // Filter out past deadlines - only keep future or null deadlines
      let filteredDeadline = null
      if (item.deadline && item.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
        if (item.deadline >= today) {
          filteredDeadline = item.deadline
        }
      }

      return {
        title: item.title || 'Untitled Resource',
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

    // Step 5: Insert into Supabase
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
    console.error('Scrape handler error:', err)
    return res.status(500).json({ error: err.message })
  }
}