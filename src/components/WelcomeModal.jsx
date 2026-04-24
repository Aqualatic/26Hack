import { useState } from 'react'

export function WelcomeModal() {
  const [show, setShow] = useState(true)
  if (!show) return null

  return (
    <div className="welcome-overlay" onClick={() => setShow(false)}>
      <div className="welcome-card" onClick={e => e.stopPropagation()}>
        <button className="welcome-close" onClick={() => setShow(false)}>×</button>

        <h2 className="welcome-title">SMCCD Resource Map</h2>

        <div className="welcome-guide">
          <p>👋 This is a map of student opportunities across Cañada, CSM, and Skyline College.</p>

          <p>🖱️ <strong>Drag</strong> to move around, <strong>scroll</strong> to zoom</p>
          <p>⚡ Click any bubble to see details and links</p>
          <p>🔍 Search by keyword with the search bar</p>
          <p>⚙️ Hide categories you don't want</p>
          <p>➕ <strong>Add links yourself!</strong> Press + Add link and paste any URL. AI will automatically scrape it and add it to the map for everyone.</p>
        </div>

        <button className="welcome-btn" onClick={() => setShow(false)}>
          Got it, start exploring
        </button>
      </div>
    </div>
  )
}
