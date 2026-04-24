import { useState } from 'react'
import { useTheme } from '../hooks/useTheme.jsx'
import { themeColors } from '../lib/theme'
import { supabase } from '../lib/supabase'

export function AddResourceModal({ onClose, onAdded }) {
  const { theme } = useTheme()
  const t = themeColors[theme]

  const [url, setUrl] = useState('')
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [statusMsg, setStatusMsg] = useState('')

  async function handleSubmit() {
    if (!url.trim()) return
    setStatus('loading')
    setStatusMsg('AI is analyzing the page — auto-detecting college, category, and extracting resources…')

    try {
      // Call your Vercel serverless function
      // AI auto-detects college and category from page content
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!res.ok) {
        let errMsg = 'Scrape failed'
        try {
          const err = await res.json()
          errMsg = err.error || errMsg
        } catch {
          // If response isn't JSON, get text
          try {
            const text = await res.text()
            errMsg = text || `Server returned ${res.status}`
          } catch {
            errMsg = `Server returned ${res.status}`
          }
        }
        throw new Error(errMsg)
      }

      let responseData
      try {
        responseData = await res.json()
      } catch {
        throw new Error('Server returned invalid JSON')
      }

      const { data } = responseData

      // The API already inserted into Supabase, just notify the parent
      if (Array.isArray(data)) {
        data.forEach(onAdded)
        setStatus('success')
        setStatusMsg(`✓ Added ${data.length} resource${data.length > 1 ? 's' : ''} to the tree!`)
      } else {
        onAdded(data)
        setStatus('success')
        setStatusMsg('✓ Added resource to the tree!')
      }
      setTimeout(onClose, 1800)

    } catch (err) {
      setStatus('error')
      setStatusMsg(err.message)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: t.appBg,
    border: `1px solid ${t.borderMedium}`,
    borderRadius: 12,
    fontFamily: "'Outfit', sans-serif",
    fontSize: 14,
    color: t.inputText,
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  }
  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: t.secondaryText,
    marginBottom: 6,
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0,
        background: t.overlayLight,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: t.elevatedBg,
        border: `1px solid ${t.borderLight}`,
        borderRadius: 20,
        padding: '32px 28px',
        width: '100%',
        maxWidth: 420,
      }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400, marginBottom: 6, color: t.appText }}>
          Add a resource
        </h2>
        <p style={{ fontSize: 13, color: t.secondaryText, marginBottom: 24, lineHeight: 1.5 }}>
          Drop a link — AI scrapes, cleans, and places it in the tree.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>URL</label>
          <input
            style={inputStyle}
            type="url"
            placeholder="https://example.com/opportunity"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div style={{
          padding: '10px 14px',
          background: t.warningBg,
          border: `1px solid ${t.warningBorder}`,
          borderRadius: 10,
          marginBottom: 24,
        }}>
          <p style={{ fontSize: 11, color: t.detailDesc, lineHeight: 1.5, margin: 0 }}>
            ✨ AI will auto-detect the college (Cañada / CSM / Skyline / SMCCD) and category (internship / scholarship / club / event) from the page.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '12px 16px',
              border: `1px solid ${t.borderMedium}`,
              borderRadius: 12,
              background: 'transparent',
              fontFamily: "'Outfit', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              color: t.secondaryText,
              transition: 'background 0.2s',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={status === 'loading' || status === 'success'}
            style={{
              flex: 1.5, padding: '12px 16px',
              border: 'none',
              borderRadius: 12,
              background: t.buttonBg,
              color: t.buttonText,
              fontFamily: "'Outfit', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              opacity: status === 'loading' || status === 'success' ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {status === 'loading' ? 'Scraping…' : status === 'success' ? 'Done!' : 'Scrape & place'}
          </button>
        </div>

        {status && (
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 12,
            textAlign: 'center',
            background: status === 'error' ? t.errorBg : status === 'success' ? t.successBg : t.elevatedBg,
            color: status === 'error' ? t.errorText : status === 'success' ? t.successText : t.secondaryText,
          }}>
            {statusMsg}
          </div>
        )}
      </div>
    </div>
  )
}
