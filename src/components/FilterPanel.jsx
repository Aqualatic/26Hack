import { useState } from 'react'
import { FILTER_CATEGORIES } from '../lib/constants'

export function FilterPanel({ hiddenFilters, onToggleFilter, onClearAll, t }) {
  const [open, setOpen] = useState(false)
  const hiddenCount = hiddenFilters.length

  return (
    <div style={{ position: 'absolute', top: 14, right: 18, zIndex: 10 }}>
      <button
        className={`filter-btn ${hiddenCount > 0 ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span>Filter</span>
        {hiddenCount > 0 && (
          <span style={{
            background: '#ef4444', color: '#fff', fontSize: 10,
            padding: '1px 6px', borderRadius: 10, fontWeight: 600
          }}>
            {hiddenCount}
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="filter-dropdown">
          <div style={{ fontSize: 11, color: t.secondaryText, marginBottom: 10, fontFamily: "'Outfit', sans-serif" }}>
            Hide categories you do not want to see
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {FILTER_CATEGORIES.map(cat => {
              const isHidden = hiddenFilters.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  className={`filter-item ${isHidden ? 'hidden' : ''}`}
                  onClick={() => onToggleFilter(cat.id)}
                >
                  <span className="filter-dot" style={{
                    background: isHidden ? cat.color : cat.color + '40',
                    border: `1px solid ${cat.color}${isHidden ? '80' : '30'}`
                  }} />
                  <span>{cat.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.6 }}>
                    {isHidden ? 'OFF' : 'on'}
                  </span>
                </button>
              )
            })}
          </div>
          {hiddenCount > 0 && (
            <button className="filter-clear" onClick={onClearAll}>
              Clear all ({hiddenCount})
            </button>
          )}
          <div style={{ marginTop: 8, fontSize: 9, color: t.mutedText, fontFamily: "'Outfit', sans-serif" }}>
            Everything visible by default — click to hide
          </div>
        </div>
      )}
    </div>
  )
}
