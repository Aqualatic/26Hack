import { useState, useEffect } from 'react'

export function Tooltip({ resource, color, mousePos }) {
  if (!resource) return null

  const { title, organization, description, type, deadline, apply_url } = resource

  const deadlineLabel = (() => {
    if (!deadline) return null
    const days = Math.ceil((new Date(deadline) - new Date()) / 86400000)
    if (days < 0) return { text: 'Closed', urgent: true }
    if (days === 0) return { text: 'Due today', urgent: true }
    if (days <= 7) return { text: `${days} days left`, urgent: true }
    return {
      text: new Date(deadline).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }),
      urgent: false,
    }
  })()

  const x = Math.min(mousePos.x + 16, window.innerWidth - 290)
  const y = mousePos.y - 10

  return (
    <div style={{
      position: 'fixed',
      left: x,
      top: y,
      background: '#1a1a16',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: '14px 16px',
      maxWidth: 260,
      zIndex: 1000,
      pointerEvents: 'none',
      fontFamily: "'Outfit', sans-serif",
    }}>
      <div style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color,
        marginBottom: 4,
      }}>
        {type}
      </div>
      <div style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 14,
        color: '#f0ede6',
        marginBottom: 3,
        lineHeight: 1.3,
      }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: '#7a7a72', marginBottom: 8 }}>
        {organization}
      </div>
      {description && (
        <div style={{ fontSize: 12, color: '#b0ada6', lineHeight: 1.5, marginBottom: 8 }}>
          {description.slice(0, 120)}{description.length > 120 ? '…' : ''}
        </div>
      )}
      {deadlineLabel && (
        <div style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: deadlineLabel.urgent ? '#fbbf24' : '#7a7a72',
        }}>
          Deadline: {deadlineLabel.text}
        </div>
      )}
      {apply_url && apply_url !== '#' && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#4ade80' }}>
          Click to open ↗
        </div>
      )}
    </div>
  )
}
