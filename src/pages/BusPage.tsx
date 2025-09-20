import React, { useMemo, useState } from 'react'
import type { StudentRow, Status } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
}

const SCHOOLS = ['All', 'Bain', 'QG', 'MHE', 'MC'] as const
type SchoolFilter = typeof SCHOOLS[number]

export default function BusPage({ students, roster, onSet }: Props) {
  const [school, setSchool] = useState<SchoolFilter>('All')
  const [q, setQ] = useState('')

  const norm = (s: string) => s.toLowerCase().trim()
  const matches = (s: StudentRow) => {
    const hit = norm(s.first_name).includes(norm(q)) || norm(s.last_name).includes(norm(q))
    if (!hit) return false
    if (school === 'All') return true
    return s.school === school
  }

  const toPickup = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'not_picked' && matches(s)),
    [students, roster, school, q]
  )

  const skippedToday = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'skipped' && matches(s)),
    [students, roster, school, q]
  )

  function CardRow({ s, right }: { s: StudentRow; right: React.ReactNode }) {
    return (
      <div className="row card-row">
        <div className="grow">
          <div className="name">{s.first_name} {s.last_name}</div>
          <div className="sub">School: {s.school}</div>
        </div>
        <div className="actions">{right}</div>
      </div>
    )
  }

  return (
    <div className="card">
      {/* Filters */}
      <div className="row wrap gap" style={{ marginBottom: 8 }}>
        <div className="row gap">
          <label className="label">School</label>
          <select value={school} onChange={e => setSchool(e.target.value as SchoolFilter)}>
            {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search student…"
          style={{ minWidth: 220 }}
        />
      </div>

      {/* Two columns */}
      <div className="columns">
        {/* Left column: Bus Pickup (Pick only) */}
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
                  right={<button className="btn primary" onClick={() => onSet(s.id, 'picked')}>Pick</button>}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right column: Skipped Today (Undo only) */}
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
                  right={<button className="btn" onClick={() => onSet(s.id, 'not_picked')}>Undo</button>}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
