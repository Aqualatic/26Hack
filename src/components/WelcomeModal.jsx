import { useState } from 'react'

export function WelcomeModal({ onClose }) {
  const [show, setShow] = useState(true)
  if (!show) return null

  return (
    <div className="welcome-overlay" onClick={onClose}>
      <div className="welcome-card" onClick={e => e.stopPropagation()}>
        <button className="welcome-close" onClick={() => { setShow(false); onClose() }}>×</button>
        <h2 className="welcome-title">Welcome to the SMCCD Resource Map</h2>
        <p className="welcome-text">
          This is an interactive map of student opportunities across Cañada College, College of San Mateo, and Skyline College.
        </p>
        <div className="welcome-list">
          <p>🔍 <strong>Drag and scroll</strong> to explore the map</p>
          <p>💡 Click on any bubble to see full details and links</p>
          <p>🔎 Use the search bar to filter by keyword</p>
          <p>⚙️ Hide categories you don't want to see with the filter button</p>
          <p>➕ <strong>Add your own resources</strong> with the + Add link button — AI will automatically scrape and classify any URL you submit</p>
        </div>
        <button className="btn btn-primary welcome-btn" onClick={() => { setShow(false); onClose() }}>
          Start exploring
        </button>
      </div>
    </div>
  )
}
