import { useState } from 'react'
import { useResources } from './hooks/useResources'
import { useTheme } from './hooks/useTheme.jsx'
import { themeColors } from './lib/theme'
import { BubbleMap } from './components/BubbleMap'
import { AddResourceModal } from './components/AddResourceModal'

export default function App() {
  const { resources, loading, error, addResource } = useResources()
  const [showModal, setShowModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { theme, toggleTheme, isDark } = useTheme()
  const t = themeColors[theme]

  if (loading) {
    return (
      <div style={{ ...styles.loading, background: t.appBg }}>
        <div style={styles.loadingDot} />
        <span style={{ color: t.secondaryText, fontSize: 13 }}>Loading resources…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...styles.loading, background: t.appBg }}>
        <span style={{ color: '#fb923c', fontSize: 13 }}>Error: {error}</span>
      </div>
    )
  }

  return (
    <div style={{ ...styles.app, background: t.appBg, color: t.appText }}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.h1}>
            SMCCD <em style={{ fontStyle: 'italic', color: '#4ade80' }}>Resource Map</em>
          </h1>
          <p style={{ ...styles.subtitle, color: t.secondaryText }}>
            {resources.length} opportunities across Cañada, CSM & Skyline
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            style={{
              width: 36, height: 36, borderRadius: 100,
              background: t.elevatedBg,
              border: `1px solid ${t.borderLight}`,
              color: t.appText,
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? '☀' : '☾'}
          </button>
          <button style={{ ...styles.addBtn, background: t.buttonBg, color: t.buttonText }} onClick={() => setShowModal(true)}>
            + Add link
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={styles.searchRow}>
        <div style={styles.searchWrap}>
          <span style={{ ...styles.searchIcon, color: t.secondaryText }}>⌕</span>
          <input
            style={{
              ...styles.searchInput,
              background: t.inputBg,
              border: `1px solid ${t.borderLight}`,
              color: t.inputText,
            }}
            type="text"
            placeholder="Search resources…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Map */}
      <BubbleMap resources={resources} searchQuery={searchQuery} />

      {/* Modal */}
      {showModal && (
        <AddResourceModal
          onClose={() => setShowModal(false)}
          onAdded={(res) => {
            addResource(res)
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}

const styles = {
  app: {
    height: '100vh',
    fontFamily: "'Outfit', sans-serif",
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingDot: {
    width: 8, height: 8,
    borderRadius: '50%',
    background: '#4ade80',
  },
  header: {
    padding: '24px 24px 0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexShrink: 0,
  },
  h1: {
    fontFamily: "'DM Serif Display', serif",
    fontSize: 24,
    fontWeight: 400,
    letterSpacing: '-0.5px',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    fontWeight: 300,
  },
  addBtn: {
    border: 'none',
    borderRadius: 100,
    padding: '9px 18px',
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    marginTop: 4,
  },
  searchRow: {
    padding: '14px 24px 0',
    flexShrink: 0,
  },
  searchWrap: {
    position: 'relative',
    maxWidth: 380,
  },
  searchIcon: {
    position: 'absolute',
    left: 13, top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 14,
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '9px 14px 9px 36px',
    borderRadius: 100,
    fontFamily: "'Outfit', sans-serif",
    fontSize: 13,
    outline: 'none',
  },
}
