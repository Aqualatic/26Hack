import { MAJOR_PATTERNS, SEARCH_ALIASES, COLLEGES } from './constants'

export const today0 = () => { const d = new Date(); d.setHours(0,0,0,0); return d }

export function isActive(r) {
  if (r.type === 'club') return true
  if (r.deadline) {
    const dd = new Date(r.deadline)
    return isNaN(dd.getTime()) ? true : dd >= today0()
  }
  if (r.type === 'event' && r.description) {
    const d = r.description.toLowerCase()
    return !['ended','concluded','finished','past','was held'].some(i => d.includes(i))
  }
  return true
}

export function detectMajors(r) {
  const txt = `${r.title} ${r.organization || ''} ${r.description || ''}`.toLowerCase()
  return MAJOR_PATTERNS
    .filter(p => p.keys.some(k => txt.includes(k)))
    .map(p => p.label)
    .slice(0, 2)
}

export function deadlineLabel(deadline) {
  if (!deadline) return null
  const days = Math.ceil((new Date(deadline) - new Date()) / 86400000)
  const fmt  = new Date(deadline).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
  if (days < 0)   return { text: 'Deadline passed', urgent: true, fmt }
  if (days === 0) return { text: 'Due today',       urgent: true, fmt }
  if (days <= 30) return { text: `${days} days left`, urgent: days <= 7, fmt }
  return { text: fmt, urgent: false, fmt }
}

// Compact style helpers for inline styles used repeatedly
export const sx = (base, overrides) => ({ ...base, ...overrides })

export const pill = (bg, border, color, size = 10) => ({
  display:'inline-block', padding:'3px 10px', borderRadius:100,
  background:bg, border:`1px solid ${border}`, color,
  fontSize:size, fontFamily:"'DM Mono', monospace", letterSpacing:'0.08em', textTransform:'uppercase',
})

export const btn = (bg, color, opts = {}) => ({
  border:'none', borderRadius:100, padding:'9px 18px',
  fontFamily:"'Outfit', sans-serif", fontSize:13, fontWeight:600,
  cursor:'pointer', ...opts, background:bg, color,
})

export const flex = (opts = {}) => ({ display:'flex', ...opts })

export const text = (color, size = 13, opts = {}) => ({ color, fontSize:size, ...opts })
