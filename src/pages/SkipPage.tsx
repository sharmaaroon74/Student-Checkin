import React, { useMemo, useState } from 'react'
import type { StudentRow, Status } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
}

const SCHOOLS = ['All', 'Bain', 'QG', 'MHE', 'MC'] as const
type SchoolFilter = typeof SCHOOLS[number]
const SORTS = ['First Name', 'Last Name'] as const
type SortKey = typeof SORTS[number]

export default function SkipPage({ students, roster, onSet }: Props) {
  const [school, setSchool] = useState<SchoolFilter>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('First Name')

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

  const markSkipCandidates = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') !== 'skipped' && matches(s)).sort(cmp),
    [students, roster, school, q, sortBy]
  )
  const skippedToday = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'skipped' && matches(s)).sort(cmp),
    [students, roster, school, q, sortBy]
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
          <h3 className="section-title">Mark Skip Today</h3>
          {markSkipCandidates.length === 0 ? (
            <div className="muted">No students to skip.</div>
          ) : (
            <div className="list">
              {markSkipCandidates.map(s => (
                <CardRow
                  key={s.id}
                  s={s}
                  right={<button className="btn" onClick={() => onSet(s.id, 'skipped')}>Skip Today</button>}
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
                  right={<button className="btn" onClick={() => onSet(s.id, 'not_picked')}>Unskip Today</button>}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
