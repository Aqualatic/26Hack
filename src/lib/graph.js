import { COLLEGES, CATEGORY_COLORS, MAJOR_COLOR, MAJOR_PATTERNS } from './constants'
import { detectMajors } from './helpers'

const SIM_W = 1040, SIM_H = 740
const CX = SIM_W / 2, CY = SIM_H / 2
const SCHOOL_R = 190
const SCHOOL_SEED_ANGLES = {
  canada: (-Math.PI * 5) / 6,
  csm:    (-Math.PI * 1) / 6,
  skyline: Math.PI / 2,
}

const EDGE_GAP = 25, REPEL_K = 8000, REPEL_RAD = 350
const GRAVITY = 0.006, MAX_FORCE = 30, DAMPING = 0.72, SIM_ITER = 600

export function buildGraph(resources, t) {
  const nodes = new Map(), edges = []
  const validColleges = new Set(['canada','csm','skyline'])

  const ensure = (id, type, label, extra = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, type, label, ...extra, x:0, y:0, vx:0, vy:0 })
    return nodes.get(id)
  }

  // District root
  ensure('dist-smccd', 'district', 'SMCCD', { abbr:'SMCCD', color:'#e2e8f0', dim:t.nodeDimDistrict, r:36, pinned:true })

  // School nodes
  const schoolCols = ['canada','csm','skyline']
  schoolCols.forEach(col => {
    ensure(`school-${col}`, 'school', COLLEGES[col].label, {
      abbr: COLLEGES[col].abbr, color: COLLEGES[col].color,
      dim: t.schoolDim[col], r:30, college:col, pinned:true,
    })
    edges.push({ from:'dist-smccd', to:`school-${col}`, kind:'hierarchy' })
  })

  // Resource nodes
  resources.forEach(r => {
    const cat = r.type || 'other'
    const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
    const hasLink = !!(r.apply_url && r.apply_url !== '#')
    const majors = detectMajors(r)

    const resNode = ensure(`res-${r.id}`, 'resource', r.title, {
      resource:r, color, dim:t.nodeDimResource, r:38, hasLink, majors,
    })

    const homeId = validColleges.has(r.college) ? `school-${r.college}` : 'dist-smccd'
    edges.push({ from:resNode.id, to:homeId, kind:'school' })

    // Category node
    const catId = `cat-${cat}`
    ensure(catId, 'category', cat[0].toUpperCase() + cat.slice(1) + 's', { color, dim:t.nodeDimDefault, r:24 })
    edges.push({ from:resNode.id, to:catId, kind:'weak' })

    // Major nodes
    majors.forEach(majorLabel => {
      const majorId = `major-${majorLabel.toLowerCase().replace(/\W+/g, '-')}`
      ensure(majorId, 'major', majorLabel, { color:MAJOR_COLOR, dim:t.majorDim, r:22 })
      edges.push({ from:resNode.id, to:majorId, kind:'weak' })
    })
  })

  return { nodes: Array.from(nodes.values()), edges }
}

export function simulate(nodes, edges) {
  if (!nodes.length) return nodes
  const nm = {}
  nodes.forEach(n => nm[n.id] = n)

  // Seed district
  if (nm['dist-smccd']) { nm['dist-smccd'].x = CX; nm['dist-smccd'].y = CY }

  // Seed schools
  ;['canada','csm','skyline'].forEach(col => {
    const n = nm[`school-${col}`]
    if (n) { n.x = CX + SCHOOL_R * Math.cos(SCHOOL_SEED_ANGLES[col]); n.y = CY + SCHOOL_R * Math.sin(SCHOOL_SEED_ANGLES[col]) }
  })

  // Seed resources around parents
  const byParent = {}
  nodes.filter(n => n.type === 'resource').forEach(n => {
    const homeEdge = edges.find(e => e.kind === 'school' && (e.from === n.id && nm[e.to] || e.to === n.id && nm[e.from]))
    const parentId = homeEdge ? (homeEdge.from === n.id ? homeEdge.to : homeEdge.from) : 'dist-smccd'
    ;(byParent[parentId] ||= []).push(n)
  })

  Object.entries(byParent).forEach(([pid, items]) => {
    const parent = nm[pid]
    const count = items.length
    const sector = (2 * Math.PI) / Math.max(count, 1)
    const offset = pid === 'dist-smccd' ? 0 : pid === 'school-canada' ? Math.PI/6 : pid === 'school-csm' ? Math.PI/3 : Math.PI/2
    items.forEach((node, i) => {
      const ang = offset + i * sector + (Math.random()-0.5) * sector * 0.6
      const ring = Math.floor(i/6)
      const dist = 85 + ring * 55 + Math.random() * 30
      node.x = (parent?.x ?? CX) + dist * Math.cos(ang)
      node.y = (parent?.y ?? CY) + dist * Math.sin(ang)
    })
  })

  // Seed peripheral nodes
  const periph = nodes.filter(n => n.type === 'category' || n.type === 'major')
  periph.forEach((n, i) => {
    const ang = (i / Math.max(periph.length, 1)) * 2 * Math.PI
    const dist = 420 + Math.random() * 40
    n.x = CX + dist * Math.cos(ang); n.y = CY + dist * Math.sin(ang)
  })

  nodes.forEach(n => { n.seedX = n.x; n.seedY = n.y; n.vx = 0; n.vy = 0 })

  // Adjacency
  const adj = {}
  nodes.forEach(n => adj[n.id] = [])
  edges.forEach(e => { if (nm[e.from] && nm[e.to]) { adj[e.from].push({id:e.to, kind:e.kind}); adj[e.to].push({id:e.from, kind:e.kind}) } })

  const repelK = REPEL_K * Math.max(1, Math.sqrt(5 / Math.max(nodes.length, 1)))

  // Main loop
  for (let iter = 0; iter < SIM_ITER; iter++) {
    const alpha = Math.max(0.015, 1 - iter / SIM_ITER)
    nodes.forEach(a => {
      let fx = 0, fy = 0

      if (!a.pinned) {
        // Repulsion
        nodes.forEach(b => {
          if (a.id === b.id) return
          const dx = a.x - b.x, dy = a.y - b.y
          const dist2 = dx*dx + dy*dy || 0.001
          const dist = Math.sqrt(dist2)
          const minD = a.r + b.r + EDGE_GAP
          if (dist < minD) { const push = (minD-dist)/dist; fx += dx*push*1.1; fy += dy*push*1.1 }
          else if (dist < REPEL_RAD) { const repel = repelK/dist2*alpha; fx += (dx/dist)*repel; fy += (dy/dist)*repel }
        })

        // Springs
        adj[a.id].forEach(({id:bid, kind}) => {
          const b = nm[bid]; if (!b) return
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx*dx + dy*dy) || 0.001
          const ideal = (kind==='school'?150:kind==='hierarchy'?220:210) + (a.r+b.r)*0.3
          const k = kind==='school'?0.2:kind==='hierarchy'?0.1:0.05
          const force = (dist-ideal)/dist*k*alpha
          fx += dx*force; fy += dy*force
        })

        // Gravity
        fx += (CX - a.x) * GRAVITY
        fy += (CY - a.y) * GRAVITY
      }

      // Home pull
      const homeK = a.pinned ? 0.72 : (a.type==='category'||a.type==='major') ? 0.025 : 0
      if (homeK > 0) { fx += (a.seedX - a.x)*homeK; fy += (a.seedY - a.y)*homeK }

      // Cap
      const fmag = Math.sqrt(fx*fx + fy*fy)
      if (fmag > MAX_FORCE) { fx = fx/fmag*MAX_FORCE; fy = fy/fmag*MAX_FORCE }

      a.vx = (a.vx + fx) * DAMPING
      a.vy = (a.vy + fy) * DAMPING
      a.x += a.vx; a.y += a.vy
    })
  }

  return nodes
}
