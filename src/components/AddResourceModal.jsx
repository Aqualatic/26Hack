import { useState } from 'react'

export function AddResourceModal({ onClose, onAdded }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState(null)
  const [msg, setMsg] = useState('')

  async function submit() {
    if (!url.trim()) return
    setStatus('loading')
    setMsg('AI is analyzing the page…')
    try {
      const res = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      let err = 'Scrape failed'
      if (!res.ok) {
        try { const j = await res.json(); err = j.error || err } catch { try { const txt = await res.text(); err = txt || `Server ${res.status}` } catch {} }
        throw new Error(err)
      }
      const { data } = await res.json()
      if (Array.isArray(data)) { data.forEach(onAdded); setMsg(`Added ${data.length} resource${data.length > 1 ? 's' : ''}`) }
      else { onAdded(data); setMsg('Added resource') }
      setStatus('success')
      setTimeout(onClose, 1800)
    } catch (e) {
      setStatus('error')
      setMsg(e.message)
    }
  }

  const statusBg = status === 'error' ? 'rgba(239,68,68,0.10)' : status === 'success' ? 'rgba(34,197,94,0.10)' : 'var(--surface)'
  const statusColor = status === 'error' ? '#ef4444' : status === 'success' ? '#16a34a' : 'var(--muted)'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="modal-title" style={{ color: 'var(--fg)' }}>Add a resource</h2>
        <p className="modal-subtitle" style={{ color: 'var(--muted)' }}>
          Drop a link — AI scrapes, cleans, and places it in the tree.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label className="modal-label">URL</label>
          <input
            className="modal-input"
            type="url"
            placeholder="https://example.com/opportunity"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
        </div>

        <div className="modal-info" style={{ background: 'var(--input-bg)' }}>
          <p>AI will auto-detect the college and category from the page.</p>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={status === 'loading' || status === 'success'}
            style={{ flex: 1.5, opacity: status === 'loading' || status === 'success' ? 0.6 : 1 }}
          >
            {status === 'loading' ? 'Scraping…' : status === 'success' ? 'Done' : 'Scrape & place'}
          </button>
        </div>

        {status && (
          <div className="modal-status" style={{ background: statusBg, color: statusColor }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  )
}
