import React, { useMemo, useState } from 'react'
import type { StudentRow, Status } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
  /** optional: ISO timestamp per student (e.g., roster_status.last_update) */
  rosterTimes?: Record<string, string>
}

const SCHOOLS = ['All', 'Bain', 'QG', 'MHE', 'MC'] as const
type SchoolFilter = typeof SCHOOLS[number]
const SORTS = ['First Name', 'Last Name'] as const
type SortKey = typeof SORTS[number]

const fmtEST = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  let h = est.getHours()
  const m = est.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${m}${ampm}`
}

const statusText = (st: Status, t?: string) => {
  switch (st) {
    case 'picked': return `Picked${t ? ` : ${t}` : ''}`
    case 'arrived': return `Arrived${t ? ` : ${t}` : ''}`
    case 'checked': return `Checked Out${t ? ` : ${t}` : ''}`
    case 'skipped': return 'Skipped'
    default: return 'Not Picked'
  }
}

export default function BusPage({ students, roster, onSet, rosterTimes }: Props) {
  const [school, setSchool] = useState<SchoolFilter>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('First Name')

  const setStatus = (id: string, st: Status, meta?: any) => {
    onSet(id, st, meta)
    setQ('') // ✨ clear search after any action
  }

  const norm = (s: string) => s.toLowerCase().trim()
  const matches = (s: StudentRow) => {
    const hit = norm(s.first_name).includes(norm(q)) || norm(s.last_name).includes(norm(q))
    if (!hit) return false
    if (school === 'All') return true
    return s.school === school
  }
  const cmp = (a: StudentRow, b: StudentRow) =>
    sortBy === 'First Name'
      ? a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      : a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)

  const toPickup = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'not_picked' && matches(s)).sort(cmp),
    [students, roster, school, q, sortBy]
  )
  const skippedToday = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'skipped' && matches(s)).sort(cmp),
    [students, roster, school, q, sortBy]
  )

  function CardRow({ s, right }: { s: StudentRow; right: React.ReactNode }) {
    const st = roster[s.id] ?? 'not_picked'
    const t = fmtEST(rosterTimes?.[s.id])
    return (
      <div className="row card-row">
        <div className="grow">
          <div className="name">{s.first_name} {s.last_name}</div>
          <div className="sub">School: {s.school} | {statusText(st, t)}</div>
        </div>
        <div className="actions">{right}</div>
      </div>
    )
  }

  return (
    <div className="card">
      {/* Page-level filters */}
      <div className="row wrap gap" style={{ marginBottom: 8 }}>
        <div className="seg">
          {SCHOOLS.map(s => (
            <button
              key={s}
              className={'seg-btn' + (school === s ? ' on' : '')}
              onClick={() => setSchool(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search student…"
          style={{ minWidth: 220 }}
        />
        <div className="row gap">
          <label className="label">Sort</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}>
            {SORTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Two columns */}
      <div className="columns">
        <div className="subcard">
          <h3 className="section-title">Bus Pickup</h3>
          {toPickup.length === 0 ? (
            <div className="muted">No students to pick up.</div>
          ) : (
            <div className="list">
              {toPickup.map(s => (
                <CardRow
                  key={s.id}
                  s={s}
                  right={<button className="btn primary" onClick={() => setStatus(s.id, 'picked')}>Pick</button>}
                />
              ))}
            </div>
          )}
        </div>

        <div className="subcard">
          <h3 className="section-title">Skipped Today</h3>
          {skippedToday.length === 0 ? (
            <div className="muted">No skipped students.</div>
          ) : (
            <div className="list">
              {skippedToday.map(s => (
                <CardRow
                  key={s.id}
                  s={s}
                  right={<button className="btn" onClick={() => setStatus(s.id, 'not_picked')}>Undo</button>}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
