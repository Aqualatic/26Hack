import { COLLEGES, MAJOR_COLOR } from '../lib/constants'
import { deadlineLabel } from '../lib/helpers'

export function DetailCard({ node, onClose, t }) {
  const r = node.resource
  const color = node.color || '#60a5fa'
  const dl = deadlineLabel(r.deadline)
  const school = r.college ? COLLEGES[r.college] : null

  const badge = (bg, border, text, label) => (
    <span className="badge" style={{ background: bg, borderColor: border, color: text }}>{label}</span>
  )

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-card" onClick={e => e.stopPropagation()} style={{ background: t.detailCardBg }}>
        <div className="detail-badges">
          {badge(node.dim || '#1e293b', `${color}40`, color, r.type)}
          {school
            ? badge(t.schoolDim[r.college] || '#222', `${school.color}50`, school.color, school.abbr)
            : badge(t.elevatedBg, t.borderLight, t.detailText, 'SMCCD')}
        </div>

        <h2 className="detail-title" style={{ color: t.detailText }}>{r.title}</h2>
        <p className="detail-org" style={{ color: t.detailOrg }}>{r.organization}</p>

        {r.description && (
          <p className="detail-desc" style={{ color: t.detailDesc }}>{r.description}</p>
        )}

        {node.majors?.length > 0 && (
          <div className="detail-majors">
            {node.majors.map(m => (
              <span key={m} className="major-tag">{m}</span>
            ))}
          </div>
        )}

        {dl && (
          <div className="detail-deadline" style={{
            background: dl.urgent ? t.detailDeadlineUrgentBg : t.detailDeadlineNormalBg,
            color: dl.urgent ? t.detailDeadlineUrgentText : t.detailDeadlineNormalText,
          }}>
            {dl.urgent ? '⚡ ' : ''}Deadline: {dl.text !== dl.fmt ? `${dl.text} · ` : ''}{dl.fmt}
          </div>
        )}

        {!node.hasLink && (
          <div style={{ fontSize: 12, color: t.detailNoLinkText, marginBottom: 14 }}>
            No direct link — search for this resource at your campus
          </div>
        )}

        <div className="detail-actions">
          <button className="detail-btn detail-btn-secondary" onClick={onClose}>Close</button>
          {r.apply_url && r.apply_url !== '#' && (
            <a href={r.apply_url} target="_blank" rel="noreferrer" className="detail-btn detail-btn-primary" style={{ background: color }}>
              Apply / Open ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
