import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from '../hooks/useTheme.jsx'
import { themeColors } from '../lib/theme'
import { FILTER_CATEGORIES } from '../lib/constants'

// ─── School / district constants ─────────────────────────────────────────────
const COLLEGE_LABELS = {
  canada: 'Cañada College', csm: 'College of San Mateo', skyline: 'Skyline College',
}
const COLLEGE_ABBR  = { canada: 'CA', csm: 'CSM', skyline: 'SKY' }
const COLLEGE_COLOR = { canada: '#4ade80', csm: '#60a5fa', skyline: '#fb923c' }

// ─── Category colours ─────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  internship: '#a78bfa', scholarship: '#34d399',
  club: '#f472b6', event: '#fbbf24', other: '#94a3b8',
}

// ─── Major patterns ───────────────────────────────────────────────────────────
// Each pattern matches keywords in title + description (lowercase).
const MAJOR_COLOR = '#f59e0b'
const MAJOR_PATTERNS = [
  { label: 'Computer Science', keys: ['computer science','software','programming','coding','developer','data science','machine learning','artificial intelligence','web development','cybersecurity'] },
  { label: 'Engineering',      keys: ['engineering','mechanical','electrical','civil','aerospace','robotics','structural'] },
  { label: 'Business',         keys: ['business','accounting','finance','marketing','management','entrepreneurship','economics','mba','startup'] },
  { label: 'Health Sciences',  keys: ['health','nursing','medical','biology','pre-med','pharmacy','kinesiology','public health','clinical','anatomy'] },
  { label: 'Arts & Design',    keys: ['art ','design','photography','graphic','ux ','ui ','film','theater','music','animation','illustration'] },
  { label: 'STEM',             keys: ['stem','mathematics','math','physics','chemistry','statistics','data analysis','research'] },
  { label: 'Social Sciences',  keys: ['social work','psychology','sociology','criminal justice','political science','anthropology','human services'] },
  { label: 'Education',        keys: ['education','teaching','early childhood','tutoring','academic'] },
  { label: 'Environment',      keys: ['environment','sustainability','ecology','climate','renewable','green energy'] },
  { label: 'Communications',   keys: ['communications','journalism','media','writing','english','public relations','broadcasting'] },
  { label: 'Culinary Arts',    keys: ['culinary','cooking','food','restaurant','hospitality'] },
]

// ─── Simulation config ────────────────────────────────────────────────────────
// All simulation runs in a fixed coordinate space — layout never changes on resize.
// Auto-fit maps the bounding box onto the real viewport after the sim.
const SIM_W = 1040, SIM_H = 740
const CX = SIM_W / 2, CY = SIM_H / 2

const EDGE_GAP    = 25     // Increased gap to prevent overlap
const REPEL_K     = 8000   // Stronger repulsion to push bubbles apart
const REPEL_RAD   = 350    // Larger repulsion radius
const GRAVITY     = 0.006  // Slightly weaker gravity to allow more spread
const MAX_FORCE   = 30     // Higher max force for stronger separation
const DAMPING     = 0.72   // Slightly less damping for smoother movement
const SIM_ITER    = 600    // More iterations for better convergence

// School ring geometry
const SCHOOL_R    = 190    // distance from CX/CY to each school centre
const SCHOOL_SEED_ANGLES = {   // fixed angles so Cañada is top-left, CSM top-right, Skyline bottom
  canada:  (-Math.PI * 5) / 6,
  csm:     (-Math.PI * 1) / 6,
  skyline: (Math.PI / 2),
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function today0() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

// Returns true if a resource should appear (not expired/closed/past).
// Clubs are recurring so they're always active.
// Events without a future date are filtered out.
function isActive(r) {
  if (r.type === 'club') return true  // Clubs are recurring, always active

  // Check if there's a deadline/date field
  if (r.deadline) {
    const deadlineDate = new Date(r.deadline)
    if (isNaN(deadlineDate.getTime())) return true  // Invalid date, assume active
    return deadlineDate >= today0()  // Include today's events
  }

  // For events without explicit deadline, check if description mentions dates
  if (r.type === 'event' && r.description) {
    const desc = r.description.toLowerCase()
    // Check for past date indicators
    const pastIndicators = ['ended', 'concluded', 'finished', 'past', 'was held']
    if (pastIndicators.some(ind => desc.includes(ind))) {
      return false
    }
  }

  // For internships/scholarships without deadline, assume active
  return true
}

// ─── Major extraction ─────────────────────────────────────────────────────────
function detectMajors(r) {
  const txt = `${r.title} ${r.organization || ''} ${r.description || ''}`.toLowerCase()
  return MAJOR_PATTERNS
    .filter(p => p.keys.some(k => txt.includes(k)))
    .map(p => p.label)
    .slice(0, 2)   // cap at 2 per resource to avoid clutter
}

// ─── Graph builder ────────────────────────────────────────────────────────────
// Nodes: district (SMCCD), school (CAN/CSM/SKY), resource, category, major
// Each resource connects to exactly ONE "home" (its school OR smccd for multi/unknown).
// Org nodes are intentionally omitted — they were creating confusing double links.
function buildGraph(resources, t) {
  const nodes  = new Map()
  const edges  = []
  const validColleges = new Set(['canada', 'csm', 'skyline'])

  function ensure(id, type, label, extra = {}) {
    if (!nodes.has(id)) {
      nodes.set(id, { id, type, label, ...extra, x: 0, y: 0, vx: 0, vy: 0 })
    }
    return nodes.get(id)
  }

  // ── District root ───────────────────────────────────────────────────────────
  ensure('dist-smccd', 'district', 'SMCCD', {
    abbr: 'SMCCD', color: '#e2e8f0', dim: t.nodeDimDistrict, r: 36,
    pinned: true,
  })

  // ── School nodes always present (backbone of the hierarchy) ──────────────
  const schoolCols = ['canada', 'csm', 'skyline']
  schoolCols.forEach(col => {
    ensure(`school-${col}`, 'school', COLLEGE_LABELS[col], {
      abbr: COLLEGE_ABBR[col],
      color: COLLEGE_COLOR[col],
      dim:   t.schoolDim[col],
      r: 30, college: col, pinned: true,
    })
    // SMCCD → school backbone edges
    edges.push({ from: 'dist-smccd', to: `school-${col}`, kind: 'hierarchy' })
  })

  // ── Resource nodes ────────────────────────────────────────────────────────
  resources.forEach(r => {
    const cat      = r.type || 'other'
    const catColor = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
    const hasLink  = !!(r.apply_url && r.apply_url !== '#')
    const majors   = detectMajors(r)

    const resNode = ensure(`res-${r.id}`, 'resource', r.title, {
      resource: r, color: catColor, dim: t.nodeDimResource,
      r: 38, hasLink, majors,
    })

    // Home connection: school if known, else SMCCD
    // If resource has multiple colleges or unknown college, connect to SMCCD
    const homeId = validColleges.has(r.college)
      ? `school-${r.college}`
      : 'dist-smccd'
    edges.push({ from: resNode.id, to: homeId, kind: 'school' })

    // Category node
    const catId = `cat-${cat}`
    ensure(catId, 'category', cat.charAt(0).toUpperCase() + cat.slice(1) + 's', {
      color: catColor, dim: t.nodeDimDefault, r: 24,
    })
    edges.push({ from: resNode.id, to: catId, kind: 'weak' })

    // Major nodes
    majors.forEach(majorLabel => {
      const majorId = `major-${majorLabel.toLowerCase().replace(/\W+/g, '-')}`
      ensure(majorId, 'major', majorLabel, {
        color: MAJOR_COLOR, dim: t.majorDim, r: 22,
      })
      edges.push({ from: resNode.id, to: majorId, kind: 'weak' })
    })
  })

  return { nodes: Array.from(nodes.values()), edges }
}

// ─── Force simulation ─────────────────────────────────────────────────────────
// Structured seeding creates a readable initial layout that the forces refine.
// Pinned nodes (district + schools) have a very strong home-pull so they stay
// in place, giving the graph a stable hierarchical skeleton.
function simulate(nodes, edges) {
  if (nodes.length === 0) return nodes
  const nm = {}
  nodes.forEach(n => { nm[n.id] = n })

  // ── Hierarchical seeding ─────────────────────────────────────────────────
  // 1. District at centre
  if (nm['dist-smccd']) { nm['dist-smccd'].x = CX; nm['dist-smccd'].y = CY }

  // 2. Schools at fixed ring positions
  const schoolCols = ['canada', 'csm', 'skyline']
  schoolCols.forEach(col => {
    const n = nm[`school-${col}`]
    if (!n) return
    const ang = SCHOOL_SEED_ANGLES[col]
    n.x = CX + SCHOOL_R * Math.cos(ang)
    n.y = CY + SCHOOL_R * Math.sin(ang)
  })

  // 3. Resources seeded in organized sectors around their home node
  // Group resources by their parent to distribute them evenly
  const resourceNodes = nodes.filter(n => n.type === 'resource')
  const resourcesByParent = {}
  resourceNodes.forEach(n => {
    const homeEdge = edges.find(e =>
      e.kind === 'school' &&
      ((e.from === n.id && nm[e.to]) || (e.to === n.id && nm[e.from]))
    )
    const parentId = homeEdge
      ? (homeEdge.from === n.id ? homeEdge.to : homeEdge.from)
      : 'dist-smccd'
    if (!resourcesByParent[parentId]) resourcesByParent[parentId] = []
    resourcesByParent[parentId].push({ node: n, parentId })
  })

  // Distribute resources in organized angular sectors around each parent
  Object.entries(resourcesByParent).forEach(([parentId, items]) => {
    const parent = nm[parentId]
    if (!parent) {
      // Fallback for orphaned resources
      items.forEach(({ node }, idx) => {
        const ang = (idx / items.length) * 2 * Math.PI + Math.random() * 0.3
        const dist = 90 + Math.random() * 60
        node.x = CX + dist * Math.cos(ang)
        node.y = CY + dist * Math.sin(ang)
      })
      return
    }

    const count = items.length
    // Divide the circle into sectors based on number of resources
    const sectorAngle = (2 * Math.PI) / Math.max(count, 1)
    // Offset angle based on parent type for visual consistency
    const angleOffset = parentId === 'dist-smccd' ? 0 :
      parentId === 'school-canada' ? Math.PI / 6 :
      parentId === 'school-csm' ? Math.PI / 3 :
      Math.PI / 2

    items.forEach(({ node }, idx) => {
      // Place in a ring with some randomness within the sector
      const baseAngle = angleOffset + idx * sectorAngle
      const angleJitter = (Math.random() - 0.5) * sectorAngle * 0.6
      const ang = baseAngle + angleJitter
      // Vary distance to create multiple rings for many resources
      const ringIndex = Math.floor(idx / 6)
      const dist = 85 + ringIndex * 55 + Math.random() * 30
      node.x = parent.x + dist * Math.cos(ang)
      node.y = parent.y + dist * Math.sin(ang)
    })
  })

  // 4. Category / major nodes seeded on the outer perimeter (further out to avoid overlap)
  const peripheralNodes = nodes.filter(n => n.type === 'category' || n.type === 'major')
  peripheralNodes.forEach((n, i) => {
    const ang  = (i / Math.max(peripheralNodes.length, 1)) * 2 * Math.PI
    const dist = 420 + Math.random() * 40  // Further out to avoid overlap with resources
    n.x = CX + dist * Math.cos(ang)
    n.y = CY + dist * Math.sin(ang)
  })

  // Store seed positions for home-pull restoring force
  nodes.forEach(n => { n.seedX = n.x; n.seedY = n.y; n.vx = 0; n.vy = 0 })

  // ── Adjacency (stores kind for spring tuning) ─────────────────────────────
  const adj = {}
  nodes.forEach(n => { adj[n.id] = [] })
  edges.forEach(e => {
    if (nm[e.from] && nm[e.to]) {
      adj[e.from].push({ id: e.to,   kind: e.kind })
      adj[e.to  ].push({ id: e.from, kind: e.kind })
    }
  })

  const repelK = REPEL_K * Math.max(1, Math.sqrt(5 / Math.max(nodes.length, 1)))

  // ── Main loop ─────────────────────────────────────────────────────────────
  for (let iter = 0; iter < SIM_ITER; iter++) {
    const alpha = Math.max(0.015, 1 - iter / SIM_ITER)

    nodes.forEach(a => {
      let fx = 0, fy = 0

      if (!a.pinned) {
        // ── Repulsion from all nodes (including pinned) ─────────────────────
        nodes.forEach(b => {
          if (a.id === b.id) return
          const dx = a.x - b.x, dy = a.y - b.y
          const dist2 = dx * dx + dy * dy || 0.001
          const dist  = Math.sqrt(dist2)
          const minD  = a.r + b.r + EDGE_GAP

          if (dist < minD) {
            const push = (minD - dist) / dist
            fx += dx * push * 1.1
            fy += dy * push * 1.1
          } else if (dist < REPEL_RAD) {
            const repel = repelK / dist2 * alpha
            fx += (dx / dist) * repel
            fy += (dy / dist) * repel
          }
        })

        // ── Spring edges ────────────────────────────────────────────────────
        adj[a.id].forEach(({ id: bid, kind }) => {
          const b = nm[bid]
          if (!b) return
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
          // Increased ideal distances to prevent overlap between layers
          const ideal = (kind === 'school' ? 150 : kind === 'hierarchy' ? 220 : 210)
                      + (a.r + b.r) * 0.3
          const k = kind === 'school' ? 0.2 : kind === 'hierarchy' ? 0.1 : 0.05
          const force = (dist - ideal) / dist * k * alpha
          fx += dx * force
          fy += dy * force
        })

        // ── Global gravity toward centre ────────────────────────────────────
        fx += (CX - a.x) * GRAVITY
        fy += (CY - a.y) * GRAVITY
      }

      // ── Home-pull restoring force (all nodes — strongest for pinned) ───────
      const homeK = a.pinned ? 0.72 : (a.type === 'category' || a.type === 'major') ? 0.025 : 0
      if (homeK > 0) {
        fx += (a.seedX - a.x) * homeK
        fy += (a.seedY - a.y) * homeK
      }

      // ── Hard force cap ──────────────────────────────────────────────────
      const fmag = Math.sqrt(fx * fx + fy * fy)
      if (fmag > MAX_FORCE) { fx = fx / fmag * MAX_FORCE; fy = fy / fmag * MAX_FORCE }

      a.vx = (a.vx + fx) * DAMPING
      a.vy = (a.vy + fy) * DAMPING
      a.x += a.vx
      a.y += a.vy
    })
  }

  return nodes
}

// ─── Deadline helper ──────────────────────────────────────────────────────────
function deadlineLabel(deadline) {
  if (!deadline) return null
  const days = Math.ceil((new Date(deadline) - new Date()) / 86400000)
  const fmt  = new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (days < 0)  return { text: 'Deadline passed',    urgent: true,  fmt }
  if (days === 0) return { text: 'Due today',          urgent: true,  fmt }
  if (days <= 7) return { text: `${days} days left`,  urgent: true,  fmt }
  if (days <= 30) return { text: `${days} days left`, urgent: false, fmt }
  return { text: fmt, urgent: false, fmt }
}

// ─── Detail card ──────────────────────────────────────────────────────────────
function DetailCard({ node, onClose, t }) {
  const r     = node.resource
  const color = node.color || '#60a5fa'
  const dl    = deadlineLabel(r.deadline)
  const majors = node.majors || []
  const school = r.college ? COLLEGE_LABELS[r.college] : null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: t.detailOverlay, zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: t.detailCardBg, border: `1px solid ${color}40`,
        borderRadius: 20, padding: 28, maxWidth: 460, width: '100%',
        boxShadow: `0 0 60px ${color}18`, fontFamily: "'Outfit', sans-serif",
      }}>
        {/* Type badge + school pill row */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 100,
            background: node.dim || '#1e293b', border: `1px solid ${color}50`,
            color, fontSize: 10, fontFamily: "'DM Mono', monospace",
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>{r.type}</span>
          {school && (
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 100,
              background: t.schoolDim[r.college] || '#222',
              border: `1px solid ${COLLEGE_COLOR[r.college] || '#555'}50`,
              color: COLLEGE_COLOR[r.college] || '#aaa',
              fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: '0.06em',
            }}>{COLLEGE_ABBR[r.college]}</span>
          )}
          {!school && (
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 100,
              background: t.elevatedBg, border: t.borderLight,
              color: t.detailText, fontSize: 10, fontFamily: "'DM Mono', monospace",
              letterSpacing: '0.06em',
            }}>SMCCD</span>
          )}
        </div>

        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400, color: t.detailText, marginBottom: 4, lineHeight: 1.2 }}>{r.title}</h2>
        <p  style={{ fontSize: 13, color: t.detailOrg, marginBottom: 12 }}>{r.organization}</p>

        {r.description && (
          <p style={{ fontSize: 13, color: t.detailDesc, lineHeight: 1.65, marginBottom: 14 }}>{r.description}</p>
        )}

        {/* Majors */}
        {majors.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {majors.map(m => (
              <span key={m} style={{
                padding: '3px 10px', borderRadius: 100, fontSize: 11,
                background: t.majorDim, border: '1px solid #f59e0b50',
                color: MAJOR_COLOR, fontFamily: "'DM Mono', monospace",
              }}>{m}</span>
            ))}
          </div>
        )}

        {/* Deadline */}
        {dl && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12,
            fontFamily: "'DM Mono', monospace",
            background: dl.urgent ? t.detailDeadlineUrgentBg : t.detailDeadlineNormalBg,
            color:      dl.urgent ? t.detailDeadlineUrgentText : t.detailDeadlineNormalText,
          }}>
            {dl.urgent ? '⚡ ' : ''}Deadline: {dl.text !== dl.fmt ? `${dl.text} · ` : ''}{dl.fmt}
          </div>
        )}

        {/* Open status */}
        {!node.hasLink && (
          <div style={{ fontSize: 12, color: t.detailNoLinkText, marginBottom: 14 }}>
            ℹ︎ No direct link — search for this resource at your campus
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px 0', border: `1px solid ${t.detailCloseBtnBorder}`,
            borderRadius: 100, background: 'transparent', color: t.detailCloseBtnText,
            fontSize: 13, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
          }}>Close</button>
          {r.apply_url && r.apply_url !== '#' && (
            <a href={r.apply_url} target="_blank" rel="noreferrer" style={{
              flex: 2, padding: '10px 0', border: 'none', borderRadius: 100,
              background: color, color: '#0f0f0d', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
              textAlign: 'center', textDecoration: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>Apply / Open ↗</a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Filter panel component (Blacklist system - hide what you don't want) ──
function FilterPanel({ hiddenFilters, onToggleFilter, onClearAll, t }) {
  const [isOpen, setIsOpen] = useState(false)
  const hiddenCount = hiddenFilters.length

  return (
    <div style={{
      position: 'absolute', top: 12, right: 16, zIndex: 10,
    }}>
      {/* Compact dropdown toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 10,
          background: hiddenCount > 0 ? 'rgba(239,68,68,0.15)' : t.filterPanelBg,
          border: `1px solid ${hiddenCount > 0 ? '#ef4444' : t.filterPanelBorder}`,
          color: hiddenCount > 0 ? '#ef4444' : t.secondaryText,
          fontSize: 12, fontFamily: "'Outfit', sans-serif",
          cursor: 'pointer', backdropFilter: 'blur(4px)',
          transition: 'all 0.2s'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span>Filter</span>
        {hiddenCount > 0 && (
          <span style={{
            background: '#ef4444', color: '#fff', fontSize: 10,
            padding: '1px 6px', borderRadius: 10, fontWeight: 600
          }}>
            {hiddenCount} hidden
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{
          flexShrink: 0, transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
        }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          background: t.filterPanelBgSolid, border: `1px solid ${t.filterPanelBorder}`,
          borderRadius: 12, padding: 12, backdropFilter: 'blur(8px)',
          minWidth: 240, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          maxHeight: '70vh', overflowY: 'auto',
          zIndex: 20
        }}>
          <div style={{ fontSize: 11, color: t.secondaryText, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
            Hide categories you don't want to see
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {FILTER_CATEGORIES.map(cat => {
              const isHidden = hiddenFilters.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  onClick={() => onToggleFilter(cat.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 6,
                    background: isHidden ? cat.color + '15' : 'transparent',
                    border: `1px solid ${isHidden ? cat.color + '60' : t.borderLight}`,
                    color: isHidden ? cat.color : t.detailDesc,
                    fontSize: 11, fontFamily: "'Outfit', sans-serif",
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: isHidden ? cat.color : cat.color + '40',
                    border: `1px solid ${cat.color}${isHidden ? '80' : '30'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isHidden && (
                      <svg width="5" height="5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    )}
                  </div>
                  <span>{cat.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.6 }}>
                    {isHidden ? 'OFF' : 'on'}
                  </span>
                </button>
              )
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={onClearAll}
              style={{
                width: '100%', marginTop: 8, padding: '6px 8px',
                background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 6, color: '#ef4444', fontSize: 10,
                fontFamily: "'Outfit', sans-serif", cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Clear all ({hiddenCount})
            </button>
          )}
          <div style={{ marginTop: 6, fontSize: 9, color: t.mutedText, fontFamily: "'Outfit', sans-serif" }}>
            Everything visible by default — click to hide
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function BubbleMap({ resources, searchQuery }) {
  const { theme } = useTheme()
  const t = themeColors[theme]

  const containerRef = useRef(null)
  const [dims,     setDims    ] = useState({ width: 0, height: 0 })
  const [selected, setSelected] = useState(null)
  const [hovered,  setHovered ] = useState(null)
  const [pan,      setPan     ] = useState({ x: 0, y: 0 })
  const [zoom,     setZoom    ] = useState(1)
  const [hiddenFilters, setHiddenFilters] = useState([])

  const zoomRef = useRef(1)
  const panRef  = useRef({ x: 0, y: 0 })
  const dragging  = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const didDrag   = useRef(false)

  const applyView = useCallback((z, p) => {
    zoomRef.current = z; panRef.current = p
    setZoom(z); setPan(p)
  }, [])

  // ── Resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ width: Math.max(width, 400), height: Math.max(height, 400) })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Wheel zoom toward cursor ───────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = e => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const oldZ = zoomRef.current
      const newZ = Math.min(4, Math.max(0.08, oldZ * factor))
      applyView(newZ, {
        x: mx - (mx - panRef.current.x) * (newZ / oldZ),
        y: my - (my - panRef.current.y) * (newZ / oldZ),
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [applyView])

  // ── Mouse drag ─────────────────────────────────────────────────────────────
  const onMouseDown = useCallback(e => {
    if (e.target.closest('[data-node]')) return
    dragging.current  = true
    didDrag.current   = false
    dragStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y }
  }, [])
  const onMouseMove = useCallback(e => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true
    const p = { x: dragStart.current.panX + dx, y: dragStart.current.panY + dy }
    panRef.current = p; setPan(p)
  }, [])
  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  // ── Filter toggle handler (Blacklist system) ───────────────────────────────
  const toggleFilter = useCallback((filterId) => {
    setHiddenFilters(prev =>
      prev.includes(filterId)
        ? prev.filter(f => f !== filterId)
        : [...prev, filterId]
    )
  }, [])

  // ── Filter: search + active-only + blacklist filters ──────────────────────
  const filtered = useMemo(() => {
    let result = resources.filter(isActive)

    // Apply blacklist filters - exclude resources matching hidden categories
    if (hiddenFilters.length > 0) {
      result = result.filter(r => {
        const txt = `${r.title} ${r.organization || ''} ${r.description || ''}`.toLowerCase()
        const majors = detectMajors(r)
        const majorsTxt = majors.map(m => m.toLowerCase()).join(' ')

        // Check if resource matches any hidden category - if so, exclude it
        const matchesHidden = hiddenFilters.some(filterId => {
          const cat = FILTER_CATEGORIES.find(c => c.id === filterId)
          if (!cat) return false
          return cat.keys.some(key =>
            txt.includes(key) || majorsTxt.includes(key) || r.type === filterId
          )
        })

        // Return true to KEEP the resource (it doesn't match any hidden category)
        return !matchesHidden
      })
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(r => {
        // Search in title, organization, description
        const textContent = `${r.title} ${r.organization || ''} ${r.description || ''}`.toLowerCase()
        if (textContent.includes(q)) return true

        // Search in detected majors
        const majors = detectMajors(r)
        if (majors.some(m => m.toLowerCase().includes(q))) return true

        // Search in type/category
        if (r.type && r.type.toLowerCase().includes(q)) return true

        // Search in college
        if (r.college) {
          const collegeName = COLLEGE_LABELS[r.college] || r.college
          if (collegeName.toLowerCase().includes(q)) return true
        }

        // Special keyword mappings for common searches
        const keywordMappings = {
          'cs': ['computer science'],
          'comp sci': ['computer science'],
          'coding': ['programming', 'software', 'web development'],
          'tech': ['computer science', 'engineering', 'software'],
          'money': ['scholarship', 'financial'],
          'job': ['internship'],
          'work': ['internship'],
          'study': ['education'],
          'art': ['arts & design'],
          'design': ['arts & design'],
          'bio': ['health sciences', 'biology'],
          'med': ['health sciences'],
          'nurse': ['health sciences', 'nursing'],
          'business': ['business'],
          'finance': ['business'],
          'engineering': ['engineering'],
          'stem': ['stem'],
          'psych': ['social sciences', 'psychology'],
          'social': ['social sciences'],
          'teach': ['education'],
          'env': ['environment'],
          'green': ['environment'],
          'comm': ['communications'],
          'media': ['communications'],
          'writing': ['communications'],
          'cooking': ['culinary arts'],
          'food': ['culinary arts'],
          'cañada': ['canada'],
          'canada': ['canada'],
          'csm': ['csm', 'college of san mateo'],
          'san mateo': ['csm', 'college of san mateo'],
          'skyline': ['skyline'],
          'sky': ['skyline'],
          'smccd': ['smccd'],
          'district': ['smccd'],
        }

        // Check keyword mappings
        for (const [keyword, targets] of Object.entries(keywordMappings)) {
          if (q.includes(keyword) || keyword.includes(q)) {
            // Check if any target matches the resource
            for (const target of targets) {
              if (textContent.includes(target)) return true
              if (majors.some(m => m.toLowerCase().includes(target))) return true
              if (r.college === target) return true
              if (r.type === target) return true
            }
          }
        }

        return false
      })
    }
    return result
  }, [resources, searchQuery, hiddenFilters])

  // ── Build graph & simulate (fixed coordinate space, no dims dependency) ────
  const { settled, nodeMap, edges } = useMemo(() => {
    const { nodes, edges } = buildGraph(filtered, t)
    const settled = simulate(nodes.map(n => ({ ...n })), edges)
    const nodeMap = {}
    settled.forEach(n => { nodeMap[n.id] = n })
    return { settled, nodeMap, edges }
  }, [filtered, t])

  // ── Auto-fit whenever nodes or viewport changes ────────────────────────────
  const fitView = useCallback(() => {
    if (settled.length === 0 || dims.width === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    settled.forEach(n => {
      minX = Math.min(minX, n.x - n.r); maxX = Math.max(maxX, n.x + n.r)
      minY = Math.min(minY, n.y - n.r); maxY = Math.max(maxY, n.y + n.r)
    })
    const pad  = 60
    const z    = Math.min(
      (dims.width  - pad * 2) / Math.max(maxX - minX, 1),
      (dims.height - pad * 2) / Math.max(maxY - minY, 1),
      1.6
    )
    const newZ = Math.max(0.1, z)
    applyView(newZ, {
      x: dims.width  / 2 - ((minX + maxX) / 2) * newZ,
      y: dims.height / 2 - ((minY + maxY) / 2) * newZ,
    })
  }, [settled, dims, applyView])

  useEffect(() => { fitView() }, [fitView])

  // ── Edge colour helper ─────────────────────────────────────────────────────
  // Hierarchy edges (SMCCD→school) use the school's colour.
  // School→resource and weak edges use the resource's category colour.
  function edgeColor(e) {
    const a = nodeMap[e.from], b = nodeMap[e.to]
    if (!a || !b) return t.edgeColor
    if (e.kind === 'hierarchy') {
      const school = a.type === 'school' ? a : b.type === 'school' ? b : null
      return school ? school.color : t.edgeColorLight
    }
    const res = a.type === 'resource' ? a : b.type === 'resource' ? b : null
    return res ? res.color : a.color
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const legendItems = [
    { label: 'Has link (clickable)', shape: 'solid',  color: '#a78bfa' },
    { label: 'Info only',            shape: 'dashed', color: '#a78bfa' },
    { label: 'Cañada',  color: COLLEGE_COLOR.canada  },
    { label: 'CSM',     color: COLLEGE_COLOR.csm     },
    { label: 'Skyline', color: COLLEGE_COLOR.skyline  },
    { label: 'Major',   color: MAJOR_COLOR            },
  ]

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'grab' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Legend */}
      <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {legendItems.map(({ label, shape, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="12" height="12" style={{ flexShrink: 0 }}>
              <circle cx="6" cy="6" r="5"
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray={shape === 'dashed' ? '3,2' : 'none'}
                strokeOpacity={shape === 'dashed' ? 0.7 : 1}
              />
              {shape === 'solid' && <circle cx="6" cy="6" r="2.5" fill={color} fillOpacity="0.7" />}
            </svg>
            <span style={{ fontSize: 10, color: t.legendText, fontFamily: "'Outfit', sans-serif" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {([
          ['＋', () => {
            const newZ = Math.min(4, zoomRef.current * 1.2)
            const cx = dims.width / 2, cy = dims.height / 2
            applyView(newZ, {
              x: cx - (cx - panRef.current.x) * (newZ / zoomRef.current),
              y: cy - (cy - panRef.current.y) * (newZ / zoomRef.current),
            })
          }],
          ['－', () => {
            const newZ = Math.max(0.08, zoomRef.current * 0.8)
            const cx = dims.width / 2, cy = dims.height / 2
            applyView(newZ, {
              x: cx - (cx - panRef.current.x) * (newZ / zoomRef.current),
              y: cy - (cy - panRef.current.y) * (newZ / zoomRef.current),
            })
          }],
          ['⊙', fitView],
        ]).map(([label, fn]) => (
          <button key={label} onClick={fn} style={{
            width: 32, height: 32, borderRadius: 8,
            background: t.zoomControlBg, border: `1px solid ${t.zoomControlBorder}`,
            color: t.zoomControlText, fontSize: 15, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{label}</button>
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 20, left: 16, zIndex: 10, fontSize: 10, color: t.hintText, fontFamily: "'Outfit', sans-serif", pointerEvents: 'none' }}>
        drag · scroll to zoom · click resource to open
      </div>

      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="edgeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {settled.map(n => (
            <radialGradient key={`g-${n.id}`} id={`g-${n.id}`} cx="35%" cy="30%" r="65%">
              <stop offset="0%"   stopColor={n.color} stopOpacity="1"    />
              <stop offset="55%"  stopColor={n.color} stopOpacity="0.75" />
              <stop offset="100%" stopColor={n.dim || t.nodeDimDefault} stopOpacity="0.97" />
            </radialGradient>
          ))}
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

          {/* ── Edges ─────────────────────────────────────────────────────── */}
          {edges.map((e, i) => {
            const a = nodeMap[e.from], b = nodeMap[e.to]
            if (!a || !b) return null
            const lit = hovered && (e.from === hovered || e.to === hovered)
            const col = edgeColor(e)
            const isHierarchy = e.kind === 'hierarchy'
            return (
              <line key={`e${i}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={col}
                strokeWidth={lit ? 2.5 : isHierarchy ? 1.5 : 0.9}
                strokeOpacity={lit ? 0.8 : isHierarchy ? 0.45 : 0.15}
                strokeDasharray={e.kind === 'weak' ? '4,3' : 'none'}
                filter={lit ? 'url(#edgeGlow)' : undefined}
              />
            )
          })}

          {/* ── District node ──────────────────────────────────────────────── */}
          {settled.filter(n => n.type === 'district').map(n => {
            const isHov = hovered === n.id
            return (
              <g key={n.id} data-node="true"
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle cx={n.x} cy={n.y} r={n.r + 8}
                  fill="none" stroke={n.color} strokeWidth="1" strokeOpacity="0.12" />
                <circle cx={n.x} cy={n.y} r={n.r}
                  fill={`url(#g-${n.id})`}
                  stroke={n.color} strokeWidth={isHov ? 2 : 1}
                  strokeOpacity={isHov ? 0.9 : 0.55}
                />
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                  fill={t.detailText} fontSize="11" fontWeight="700"
                  fontFamily="'DM Mono', monospace"
                  style={{ pointerEvents: 'none' }}
                >SMCCD</text>
                <text x={n.x} y={n.y + n.r + 14} textAnchor="middle"
                  fill={t.legendText} fontSize="9.5" fontFamily="'Outfit', sans-serif"
                  style={{ pointerEvents: 'none' }}
                >San Mateo CCD</text>
              </g>
            )
          })}

          {/* ── School nodes ─────────────────────────────────────────────── */}
          {settled.filter(n => n.type === 'school').map(n => {
            const isHov = hovered === n.id
            const isDim = hovered && !isHov && !edges.some(e =>
              (e.from === hovered && e.to === n.id) || (e.to === hovered && e.from === n.id)
            )
            return (
              <g key={n.id} data-node="true" style={{ opacity: isDim ? 0.25 : 1, transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {isHov && (
                  <circle cx={n.x} cy={n.y} r={n.r + 8}
                    fill="none" stroke={n.color} strokeWidth="1.2" strokeOpacity="0.3" />
                )}
                <circle cx={n.x} cy={n.y} r={n.r}
                  fill={`url(#g-${n.id})`}
                  stroke={n.color}
                  strokeWidth={isHov ? 2 : 1.2}
                  strokeOpacity={isHov ? 1 : 0.65}
                />
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                  fill={n.color} fontSize="11" fontWeight="700"
                  fontFamily="'DM Mono', monospace"
                  style={{ pointerEvents: 'none' }}
                >{n.abbr}</text>
                <text x={n.x} y={n.y + n.r + 14} textAnchor="middle"
                  fill={t.legendText} fontSize="9.5" fontFamily="'Outfit', sans-serif"
                  style={{ pointerEvents: 'none' }}
                >{n.label.split(' ')[0]}</text>
              </g>
            )
          })}

          {/* ── Category nodes ────────────────────────────────────────────── */}
          {settled.filter(n => n.type === 'category').map(n => {
            const isHov = hovered === n.id
            const isDim = hovered && !isHov && !edges.some(e =>
              (e.from === hovered && e.to === n.id) || (e.to === hovered && e.from === n.id)
            )
            return (
              <g key={n.id} data-node="true" style={{ opacity: isDim ? 0.15 : 1, transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle cx={n.x} cy={n.y} r={n.r}
                  fill={n.dim} stroke={n.color}
                  strokeWidth="1" strokeOpacity="0.5"
                  fillOpacity="0.7"
                />
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                  fill={n.color} fontSize="9" fontWeight="600"
                  fontFamily="'Outfit', sans-serif"
                  style={{ pointerEvents: 'none' }}
                >{n.label}</text>
              </g>
            )
          })}

          {/* ── Major nodes ───────────────────────────────────────────────── */}
          {settled.filter(n => n.type === 'major').map(n => {
            const isHov = hovered === n.id
            const isDim = hovered && !isHov && !edges.some(e =>
              (e.from === hovered && e.to === n.id) || (e.to === hovered && e.from === n.id)
            )
            return (
              <g key={n.id} data-node="true" style={{ opacity: isDim ? 0.15 : 1, transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Pill shape using rect with rx for major nodes */}
                <rect
                  x={n.x - n.r - 10} y={n.y - n.r * 0.6}
                  width={(n.r + 10) * 2} height={n.r * 1.2}
                  rx={n.r * 0.6} ry={n.r * 0.6}
                  fill={n.dim} stroke={n.color}
                  strokeWidth="1" strokeOpacity="0.5"
                  fillOpacity="0.8"
                />
                <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                  fill={n.color} fontSize="9" fontWeight="600"
                  fontFamily="'Outfit', sans-serif"
                  style={{ pointerEvents: 'none' }}
                >
                  {n.label.length > 16 ? n.label.slice(0, 15) + '…' : n.label}
                </text>
              </g>
            )
          })}

          {/* ── Resource nodes (top layer) ────────────────────────────────── */}
          {settled.filter(n => n.type === 'resource').map(n => {
            const isHov   = hovered === n.id
            const isDim   = hovered && !isHov && !edges.some(e =>
              (e.from === hovered && e.to === n.id) || (e.to === hovered && e.from === n.id)
            )
            const r       = isHov ? n.r + 5 : n.r
            const opacity = isDim ? 0.1 : 1
            // Deadline urgency
            const dl = deadlineLabel(n.resource?.deadline)
            const urgent = dl?.urgent && n.resource?.type !== 'club'

            return (
              <g key={n.id} data-node="true"
                style={{ cursor: 'pointer', opacity, transition: 'opacity 0.2s' }}
                onClick={() => { if (!didDrag.current) setSelected(n) }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Hover rings */}
                {isHov && <>
                  <circle cx={n.x} cy={n.y} r={r + 14} fill="none" stroke={n.color} strokeWidth="0.8" strokeOpacity="0.1" />
                  <circle cx={n.x} cy={n.y} r={r +  9} fill="none" stroke={n.color} strokeWidth="1"   strokeOpacity="0.2" />
                  <circle cx={n.x} cy={n.y} r={r +  4} fill="none" stroke={n.color} strokeWidth="1.5" strokeOpacity="0.4" />
                </>}

                {/* Urgent deadline outer glow ring */}
                {urgent && (
                  <circle cx={n.x} cy={n.y} r={r + 6}
                    fill="none" stroke="#fbbf24"
                    strokeWidth="1.5" strokeOpacity="0.5"
                    strokeDasharray="3,3"
                  />
                )}

                {/* Main bubble — SOLID stroke = has link, DASHED = info only */}
                <circle cx={n.x} cy={n.y} r={r}
                  fill={`url(#g-${n.id})`}
                  stroke={n.color}
                  strokeWidth={isHov ? 2.5 : 1.5}
                  strokeOpacity={isHov ? 1 : n.hasLink ? 0.75 : 0.4}
                  strokeDasharray={n.hasLink ? 'none' : '5,4'}
                  fillOpacity={n.hasLink ? 1 : 0.65}
                />

                {/* Link indicator dot (top-right) for clickable resources */}
                {n.hasLink && (
                  <circle cx={n.x + r * 0.65} cy={n.y - r * 0.65} r="4"
                    fill={n.color} fillOpacity="0.9"
                  />
                )}

                {/* Title text via foreignObject - scales with bubble size */}
                <foreignObject x={n.x - r + 5} y={n.y - r + 5}
                  width={(r - 5) * 2} height={(r - 5) * 2}
                  style={{ pointerEvents: 'none' }}
                >
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', padding: 2,
                    overflow: 'hidden',
                  }}>
                    <span style={{
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: Math.max(7, Math.min(10, r * 0.25)),
                      fontWeight: 700,
                      color: n.hasLink ? t.resourceTextHasLink : t.resourceTextNoLink,
                      lineHeight: 1.2,
                      display: '-webkit-box', WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      textShadow: t.textShadow,
                      wordBreak: 'break-word',
                    }}>{n.label}</span>
                  </div>
                </foreignObject>
              </g>
            )
          })}

        </g>
      </svg>

      {filtered.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: t.emptyStateTitle }}>No active resources found</p>
          <p style={{ fontSize: 13, color: t.emptyStateSub }}>Try a different search or add a link</p>
        </div>
      )}

      {/* Filter Panel */}
      <FilterPanel hiddenFilters={hiddenFilters} onToggleFilter={toggleFilter} onClearAll={() => setHiddenFilters([])} t={t} />

      {selected && <DetailCard node={selected} onClose={() => setSelected(null)} t={t} />}
    </div>
  )
}
