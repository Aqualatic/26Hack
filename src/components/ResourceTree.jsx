import { useRef, useEffect, useState, useCallback } from 'react'
import { COLLEGES, CATEGORY_COLORS, CATEGORY_SYMBOLS } from '../lib/constants'
import { Tooltip } from './Tooltip'

const NS = 'http://www.w3.org/2000/svg'

// Layout constants
const ROOT_X = 340
const ROOT_Y = 48
const COL_Y = 130
const CAT_Y = 230
const RES_START_Y = 340
const COL_R = 30
const CAT_R = 20
const RES_R = 10
const CAT_GAP = 170
const COL_GAP = 230
const RES_GAP = 38

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
  return el
}

function curve(svg, x1, y1, x2, y2, color, opacity = 1, width = 1.5) {
  const my = (y1 + y2) / 2
  const d = `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`
  const path = svgEl('path', {
    d, fill: 'none',
    stroke: color,
    'stroke-width': width,
    'stroke-linecap': 'round',
    opacity,
  })
  svg.appendChild(path)
}

export function ResourceTree({ resources, searchQuery }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const visible = searchQuery
    ? resources.filter((r) =>
        (r.title + r.organization + (r.description || ''))
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : resources

  const buildTree = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.innerHTML = ''

    const colleges = ['canada', 'csm', 'skyline']

    // Group visible resources by college → category
    const tree = {}
    colleges.forEach((col) => {
      tree[col] = {}
      visible
        .filter((r) => r.college === col)
        .forEach((r) => {
          if (!tree[col][r.type]) tree[col][r.type] = []
          tree[col][r.type].push(r)
        })
    })

    // Compute college center x positions
    function colWidth(col) {
      const catCount = Object.keys(tree[col]).length
      return Math.max(COL_R * 2 + 40, catCount * CAT_GAP)
    }
    const totalWidth = colleges.reduce(
      (sum, c) => sum + colWidth(c) + COL_GAP, -COL_GAP
    )
    let cx = Math.max(60, (680 - totalWidth) / 2)
    const colCenters = {}
    colleges.forEach((col) => {
      colCenters[col] = cx + colWidth(col) / 2
      cx += colWidth(col) + COL_GAP
    })

    // Compute SVG height
    let maxY = RES_START_Y + 60
    colleges.forEach((col) => {
      Object.values(tree[col]).forEach((arr) => {
        const y = RES_START_Y + (arr.length - 1) * RES_GAP + RES_R + 30
        if (y > maxY) maxY = y
      })
    })

    svg.setAttribute('viewBox', `0 0 680 ${maxY}`)
    svg.setAttribute('height', maxY)

    // Root node
    const rootG = svgEl('g', {})
    rootG.appendChild(svgEl('circle', {
      cx: ROOT_X, cy: ROOT_Y, r: 14,
      fill: '#f0ede6', opacity: 0.9,
    }))
    const rootLabel = svgEl('text', {
      x: ROOT_X, y: ROOT_Y - 22,
      'text-anchor': 'middle',
      fill: '#7a7a72',
      'font-size': 11,
      'font-family': 'Outfit, sans-serif',
      'font-weight': 500,
    })
    rootLabel.textContent = 'SMCCD'
    rootG.appendChild(rootLabel)
    svg.appendChild(rootG)

    colleges.forEach((col) => {
      const colData = COLLEGES[col]
      const ccx = colCenters[col]
      const cats = tree[col]
      const catKeys = Object.keys(cats)

      // Root → College
      curve(svg, ROOT_X, ROOT_Y + 14, ccx, COL_Y - COL_R, colData.color, 0.5)

      // College node
      const colG = svgEl('g', { cursor: 'default' })
      colG.appendChild(svgEl('circle', {
        cx: ccx, cy: COL_Y, r: COL_R,
        fill: colData.dim,
        stroke: colData.color,
        'stroke-width': 2,
      }))
      const colText = svgEl('text', {
        x: ccx, y: COL_Y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: colData.color,
        'font-size': 11,
        'font-family': 'DM Mono, monospace',
        'font-weight': 500,
      })
      colText.textContent = colData.abbr
      colG.appendChild(colText)

      const colName = svgEl('text', {
        x: ccx, y: COL_Y + COL_R + 16,
        'text-anchor': 'middle',
        fill: '#b0ada6',
        'font-size': 11,
        'font-family': 'Outfit, sans-serif',
      })
      colName.textContent = colData.label.split(' ')[0]
      colG.appendChild(colName)
      svg.appendChild(colG)

      if (catKeys.length === 0) {
        const emptyText = svgEl('text', {
          x: ccx, y: CAT_Y,
          'text-anchor': 'middle',
          fill: '#444440',
          'font-size': 11,
          'font-family': 'Outfit, sans-serif',
        })
        emptyText.textContent = 'no resources yet'
        svg.appendChild(emptyText)
        return
      }

      // Layout categories under college
      const catSpread = (catKeys.length - 1) * CAT_GAP
      const catStartX = ccx - catSpread / 2

      catKeys.forEach((cat, ci) => {
        const catX = catStartX + ci * CAT_GAP
        const catColor = CATEGORY_COLORS[cat] || '#94a3b8'
        const catResources = cats[cat]

        // College → Category
        curve(svg, ccx, COL_Y + COL_R, catX, CAT_Y - CAT_R, catColor, 0.4)

        // Category node
        const catG = svgEl('g', {})
        catG.appendChild(svgEl('circle', {
          cx: catX, cy: CAT_Y, r: CAT_R,
          fill: 'rgba(0,0,0,0.5)',
          stroke: catColor,
          'stroke-width': 1.5,
        }))
        const catSym = svgEl('text', {
          x: catX, y: CAT_Y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: catColor,
          'font-size': 11,
        })
        catSym.textContent = CATEGORY_SYMBOLS[cat] || '·'
        catG.appendChild(catSym)

        const catLabel = svgEl('text', {
          x: catX, y: CAT_Y + CAT_R + 14,
          'text-anchor': 'middle',
          fill: '#7a7a72',
          'font-size': 10,
          'font-family': 'Outfit, sans-serif',
          'font-weight': 500,
        })
        catLabel.textContent = cat.charAt(0).toUpperCase() + cat.slice(1) + 's'
        catG.appendChild(catLabel)
        svg.appendChild(catG)

        // Resource leaf nodes
        catResources.forEach((res, ri) => {
          const ry = RES_START_Y + ri * RES_GAP
          const drift = catResources.length === 1
            ? 0
            : (ri - (catResources.length - 1) / 2) * 16
          const rx = catX + drift

          // Category → Resource
          curve(svg, catX, CAT_Y + CAT_R, rx, ry - RES_R, catColor + '55', 1, 1)

          // Glow ring for urgent deadlines
          const days = daysUntil(res.deadline)
          if (days !== null && days >= 0 && days <= 14) {
            const glow = svgEl('circle', {
              cx: rx, cy: ry, r: RES_R + 5,
              fill: 'none',
              stroke: catColor,
              'stroke-width': 1,
              opacity: 0.35,
            })
            svg.appendChild(glow)
          }

          // Resource node
          const resG = svgEl('g', { cursor: 'pointer' })
          resG.appendChild(svgEl('circle', {
            cx: rx, cy: ry, r: RES_R,
            fill: catColor,
            'fill-opacity': 0.85,
          }))

          // Label
          const resLabel = svgEl('text', {
            x: rx + RES_R + 7, y: ry,
            'text-anchor': 'start',
            'dominant-baseline': 'central',
            fill: '#c8c4bc',
            'font-size': 10.5,
            'font-family': 'Outfit, sans-serif',
          })
          const title = res.title.length > 28
            ? res.title.slice(0, 26) + '…'
            : res.title
          resLabel.textContent = title
          resG.appendChild(resLabel)

          // Events
          resG.addEventListener('mouseenter', (e) => {
            setTooltip({ resource: res, color: catColor })
            setMousePos({ x: e.clientX, y: e.clientY })
          })
          resG.addEventListener('mouseleave', () => setTooltip(null))
          resG.addEventListener('mousemove', (e) => {
            setMousePos({ x: e.clientX, y: e.clientY })
          })
          resG.addEventListener('click', () => {
            if (res.apply_url && res.apply_url !== '#') {
              window.open(res.apply_url, '_blank')
            }
          })

          svg.appendChild(resG)
        })
      })
    })
  }, [visible])

  useEffect(() => {
    buildTree()
  }, [buildTree])

  return (
    <>
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, padding: '24px' }}>
        <svg
          ref={svgRef}
          style={{ width: '100%', display: 'block', overflow: 'visible' }}
        />
      </div>
      {tooltip && (
        <Tooltip
          resource={tooltip.resource}
          color={tooltip.color}
          mousePos={mousePos}
        />
      )}
    </>
  )
}
