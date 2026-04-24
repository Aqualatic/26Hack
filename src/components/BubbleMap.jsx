import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useTheme } from '../hooks/useTheme.jsx'
import { themeColors } from '../lib/theme'
import { CATEGORY_COLORS, MAJOR_COLOR, COLLEGES, SEARCH_ALIASES, FILTER_CATEGORIES } from '../lib/constants'
import { isActive, detectMajors, deadlineLabel } from '../lib/helpers'
import { buildGraph, simulate } from '../lib/graph'
import { DetailCard } from './DetailCard'
import { FilterPanel } from './FilterPanel'

const LEGEND = [
  { label:'Has link', shape:'solid', color:'#a78bfa' },
  { label:'Info only', shape:'dashed', color:'#a78bfa' },
  { label:'Cañada', color:COLLEGES.canada.color },
  { label:'CSM', color:COLLEGES.csm.color },
  { label:'Skyline', color:COLLEGES.skyline.color },
  { label:'Major', color:MAJOR_COLOR },
]

export function BubbleMap({ resources, searchQuery }) {
  const { theme } = useTheme()
  const t = themeColors[theme]

  const containerRef = useRef(null)
  const [dims, setDims] = useState({ w:0, h:0 })
  const [selected, setSelected] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [pan, setPan] = useState({ x:0, y:0 })
  const [zoom, setZoom] = useState(1)
  const [hiddenFilters, setHiddenFilters] = useState([])

  const zoomRef = useRef(1), panRef = useRef({ x:0, y:0 })
  const dragging = useRef(false), dragStart = useRef({ x:0, y:0, px:0, py:0 }), didDrag = useRef(false)

  const applyView = useCallback((z, p) => { zoomRef.current = z; panRef.current = p; setZoom(z); setPan(p) }, [])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(e => { const { width, height } = e[0].contentRect; setDims({ w:Math.max(width,400), h:Math.max(height,400) }) })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const h = e => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      const f = e.deltaY > 0 ? 0.9 : 1.1
      const oldZ = zoomRef.current, newZ = Math.min(4, Math.max(0.08, oldZ * f))
      applyView(newZ, { x: mx - (mx - panRef.current.x) * (newZ/oldZ), y: my - (my - panRef.current.y) * (newZ/oldZ) })
    }
    el.addEventListener('wheel', h, { passive:false }); return () => el.removeEventListener('wheel', h)
  }, [applyView])

  const onDown = useCallback(e => { if (e.target.closest('[data-node]')) return; dragging.current = true; didDrag.current = false; dragStart.current = { x:e.clientX, y:e.clientY, px:panRef.current.x, py:panRef.current.y } }, [])
  const onMove = useCallback(e => { if (!dragging.current) return; const dx = e.clientX - dragStart.current.x, dy = e.clientY - dragStart.current.y; if (Math.abs(dx)+Math.abs(dy) > 3) didDrag.current = true; const p = { x:dragStart.current.px+dx, y:dragStart.current.py+dy }; panRef.current = p; setPan(p) }, [])
  const onUp = useCallback(() => { dragging.current = false }, [])

  const toggleFilter = useCallback(id => setHiddenFilters(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]), [])

  const filtered = useMemo(() => {
    let result = resources.filter(isActive)
    if (hiddenFilters.length) {
      result = result.filter(r => {
        const txt = `${r.title} ${r.organization||''} ${r.description||''}`.toLowerCase()
        const majorsTxt = detectMajors(r).map(m => m.toLowerCase()).join(' ')
        return !hiddenFilters.some(fid => {
          const cat = FILTER_CATEGORIES.find(c => c.id === fid)
          return cat && cat.keys.some(k => txt.includes(k) || majorsTxt.includes(k) || r.type === fid)
        })
      })
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(r => {
        const txt = `${r.title} ${r.organization||''} ${r.description||''}`.toLowerCase()
        const majors = detectMajors(r)
        const collegeName = r.college ? COLLEGES[r.college]?.label || r.college : ''
        if (txt.includes(q)) return true
        if (majors.some(m => m.toLowerCase().includes(q))) return true
        if (r.type?.toLowerCase().includes(q)) return true
        if (collegeName.toLowerCase().includes(q)) return true
        for (const [kw, targets] of Object.entries(SEARCH_ALIASES)) {
          if (q.includes(kw) || kw.includes(q)) {
            if (targets.some(tgt => txt.includes(tgt) || majors.some(m => m.toLowerCase().includes(tgt)) || r.college === tgt || r.type === tgt)) return true
          }
        }
        return false
      })
    }
    return result
  }, [resources, searchQuery, hiddenFilters])

  const { settled, nodeMap, edges } = useMemo(() => {
    const { nodes, edges } = buildGraph(filtered, t)
    const settled = simulate(nodes.map(n => ({ ...n })), edges)
    const nodeMap = {}; settled.forEach(n => nodeMap[n.id] = n)
    return { settled, nodeMap, edges }
  }, [filtered, t])

  const fitView = useCallback(() => {
    if (!settled.length || !dims.w) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    settled.forEach(n => { minX = Math.min(minX, n.x-n.r); maxX = Math.max(maxX, n.x+n.r); minY = Math.min(minY, n.y-n.r); maxY = Math.max(maxY, n.y+n.r) })
    const pad = 60, z = Math.min((dims.w - pad*2)/Math.max(maxX-minX,1), (dims.h - pad*2)/Math.max(maxY-minY,1), 1.6)
    const newZ = Math.max(0.1, z)
    applyView(newZ, { x: dims.w/2 - ((minX+maxX)/2)*newZ, y: dims.h/2 - ((minY+maxY)/2)*newZ })
  }, [settled, dims, applyView])

  useEffect(() => { fitView() }, [fitView])

  const edgeColor = e => {
    const a = nodeMap[e.from], b = nodeMap[e.to]
    if (!a || !b) return t.edgeColor
    if (e.kind === 'hierarchy') { const s = a.type==='school'?a:b.type==='school'?b:null; return s ? s.color : t.edgeColorLight }
    const res = a.type==='resource'?a:b.type==='resource'?b:null
    return res ? res.color : a.color
  }

  const isConnected = (id, hoveredId) => hoveredId && edges.some(e => (e.from===hoveredId && e.to===id) || (e.to===hoveredId && e.from===id))

  const nodeBase = (n, click) => {
    const isHov = hovered === n.id, isDim = hovered && !isHov && !isConnected(n.id, hovered)
    return { isHov, isDim, props: {
      key:n.id, 'data-node':'true',
      onMouseEnter:() => setHovered(n.id), onMouseLeave:() => setHovered(null),
      ...(click && !dragging.current ? { onClick:() => { if (!didDrag.current) setSelected(n) } } : {}),
      style: { opacity: isDim ? (n.type==='resource'?0.1:n.type==='school'?0.25:0.15) : 1, transition:'opacity 0.2s', cursor: click ? 'pointer' : 'default' }
    }}
  }

  return (
    <div ref={containerRef} style={{ flex:1, position:'relative', overflow:'hidden', cursor:'grab' }} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>

      <div className="map-legend">
        {LEGEND.map(({label,shape,color}) => (
          <div key={label} className="map-legend-item">
            <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray={shape==='dashed'?'3,2':'none'} strokeOpacity={shape==='dashed'?0.7:1}/>{shape==='solid' && <circle cx="6" cy="6" r="2.5" fill={color} fillOpacity="0.7"/>}</svg>
            <span className="map-legend-label">{label}</span>
          </div>
        ))}
      </div>

      <div className="map-zoom">
        {[
          ['＋', () => { const newZ = Math.min(4, zoomRef.current*1.2); const cx=dims.w/2, cy=dims.h/2; applyView(newZ, { x:cx-(cx-panRef.current.x)*(newZ/zoomRef.current), y:cy-(cy-panRef.current.y)*(newZ/zoomRef.current) }) }],
          ['－', () => { const newZ = Math.max(0.08, zoomRef.current*0.8); const cx=dims.w/2, cy=dims.h/2; applyView(newZ, { x:cx-(cx-panRef.current.x)*(newZ/zoomRef.current), y:cy-(cy-panRef.current.y)*(newZ/zoomRef.current) }) }],
          ['⊙', fitView],
        ].map(([label, fn]) => (
          <button key={label} className="zoom-btn" onClick={fn}>{label}</button>
        ))}
      </div>

      <div className="map-hint">drag · scroll to zoom · click resource to open</div>

      <svg width="100%" height="100%" style={{ position:'absolute', inset:0 }}>
        <defs>
          <filter id="edgeGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          {settled.map(n => (
            <radialGradient key={`g-${n.id}`} id={`g-${n.id}`} cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor={n.color} stopOpacity="1"/>
              <stop offset="55%" stopColor={n.color} stopOpacity="0.75"/>
              <stop offset="100%" stopColor={n.dim||t.nodeDimDefault} stopOpacity="0.97"/>
            </radialGradient>
          ))}
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {edges.map((e, i) => {
            const a = nodeMap[e.from], b = nodeMap[e.to]
            if (!a || !b) return null
            const lit = hovered && (e.from===hovered || e.to===hovered)
            const col = edgeColor(e), hier = e.kind==='hierarchy'
            return <line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={lit?2.5:hier?1.5:0.9} strokeOpacity={lit?0.8:hier?0.45:0.15} strokeDasharray={e.kind==='weak'?'4,3':'none'} filter={lit?'url(#edgeGlow)':undefined}/>
          })}

          {settled.filter(n => n.type==='district').map(n => {
            const { isHov, props } = nodeBase(n)
            return <g {...props}>
              <circle cx={n.x} cy={n.y} r={n.r+8} fill="none" stroke={n.color} strokeWidth="1" strokeOpacity="0.12"/>
              <circle cx={n.x} cy={n.y} r={n.r} fill={`url(#g-${n.id})`} stroke={n.color} strokeWidth={isHov?2:1} strokeOpacity={isHov?0.9:0.55}/>
              <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fill={t.detailText} fontSize="11" fontWeight="700" fontFamily="'DM Mono', monospace" style={{pointerEvents:'none'}}>SMCCD</text>
              <text x={n.x} y={n.y+n.r+14} textAnchor="middle" fill={t.legendText} fontSize="9.5" fontFamily="'Outfit', sans-serif" style={{pointerEvents:'none'}}>San Mateo CCD</text>
            </g>
          })}

          {settled.filter(n => n.type==='school').map(n => {
            const { isHov, props } = nodeBase(n)
            return <g {...props}>
              {isHov && <circle cx={n.x} cy={n.y} r={n.r+8} fill="none" stroke={n.color} strokeWidth="1.2" strokeOpacity="0.3"/>}
              <circle cx={n.x} cy={n.y} r={n.r} fill={`url(#g-${n.id})`} stroke={n.color} strokeWidth={isHov?2:1.2} strokeOpacity={isHov?1:0.65}/>
              <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fill={n.color} fontSize="11" fontWeight="700" fontFamily="'DM Mono', monospace" style={{pointerEvents:'none'}}>{n.abbr}</text>
              <text x={n.x} y={n.y+n.r+14} textAnchor="middle" fill={t.legendText} fontSize="9.5" fontFamily="'Outfit', sans-serif" style={{pointerEvents:'none'}}>{n.label.split(' ')[0]}</text>
            </g>
          })}

          {settled.filter(n => n.type==='category').map(n => {
            const { isHov, props } = nodeBase(n)
            return <g {...props}>
              <circle cx={n.x} cy={n.y} r={n.r} fill={n.dim} stroke={n.color} strokeWidth="1" strokeOpacity="0.5" fillOpacity="0.7"/>
              <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fill={n.color} fontSize="9" fontWeight="600" fontFamily="'Outfit', sans-serif" style={{pointerEvents:'none'}}>{n.label}</text>
            </g>
          })}

          {settled.filter(n => n.type==='major').map(n => {
            const { isHov, props } = nodeBase(n)
            return <g {...props}>
              <rect x={n.x-n.r-10} y={n.y-n.r*0.6} width={(n.r+10)*2} height={n.r*1.2} rx={n.r*0.6} ry={n.r*0.6} fill={n.dim} stroke={n.color} strokeWidth="1" strokeOpacity="0.5" fillOpacity="0.8"/>
              <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central" fill={n.color} fontSize="9" fontWeight="600" fontFamily="'Outfit', sans-serif" style={{pointerEvents:'none'}}>{n.label.length>16 ? n.label.slice(0,15)+'…' : n.label}</text>
            </g>
          })}

          {settled.filter(n => n.type==='resource').map(n => {
            const { isHov, props } = nodeBase(n, true)
            const R = isHov ? n.r+5 : n.r
            const dl = deadlineLabel(n.resource?.deadline)
            const urgent = dl?.urgent && n.resource?.type !== 'club'
            return <g {...props}>
              {isHov && <>
                <circle cx={n.x} cy={n.y} r={R+14} fill="none" stroke={n.color} strokeWidth="0.8" strokeOpacity="0.1"/>
                <circle cx={n.x} cy={n.y} r={R+9} fill="none" stroke={n.color} strokeWidth="1" strokeOpacity="0.2"/>
                <circle cx={n.x} cy={n.y} r={R+4} fill="none" stroke={n.color} strokeWidth="1.5" strokeOpacity="0.4"/>
              </>}
              {urgent && <circle cx={n.x} cy={n.y} r={R+6} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="3,3"/>}
              <circle cx={n.x} cy={n.y} r={R} fill={`url(#g-${n.id})`} stroke={n.color} strokeWidth={isHov?2.5:1.5} strokeOpacity={isHov?1:n.hasLink?0.75:0.4} strokeDasharray={n.hasLink?'none':'5,4'} fillOpacity={n.hasLink?1:0.65}/>
              {n.hasLink && <circle cx={n.x+R*0.65} cy={n.y-R*0.65} r="4" fill={n.color} fillOpacity="0.9"/>}
              <foreignObject x={n.x-R+5} y={n.y-R+5} width={(R-5)*2} height={(R-5)*2} style={{pointerEvents:'none'}}>
                <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', padding:2, overflow:'hidden' }}>
                  <span style={{ fontFamily:"'Outfit', sans-serif", fontSize:Math.max(7, Math.min(10, R*0.25)), fontWeight:700, color:n.hasLink?t.resourceTextHasLink:t.resourceTextNoLink, lineHeight:1.2, display:'-webkit-box', WebkitLineClamp:4, WebkitBoxOrient:'vertical', overflow:'hidden', textShadow:t.textShadow, wordBreak:'break-word' }}>{n.label}</span>
                </div>
              </foreignObject>
            </g>
          })}
        </g>
      </svg>

      {!filtered.length && (
        <div className="map-empty">
          <p style={{ fontFamily:"'DM Serif Display', serif", fontSize:18, color:t.emptyStateTitle }}>No active resources found</p>
          <p style={{ fontSize:13, color:t.emptyStateSub }}>Try a different search or add a link</p>
        </div>
      )}

      <FilterPanel hiddenFilters={hiddenFilters} onToggleFilter={toggleFilter} onClearAll={() => setHiddenFilters([])} t={t} />
      {selected && <DetailCard node={selected} onClose={() => setSelected(null)} t={t} />}
    </div>
  )
}
