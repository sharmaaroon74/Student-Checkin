import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
}

const BUS_SCHOOLS = new Set(['Bain', 'MC', 'MHE', 'QG'])
const BUS_YEARS = new Set([
  'FT - A',
  'FT - B/A',
  'PT3 - A - TWR',
  'PT3 - A - MWF',
  'PT2 - A - WR',
  'PT3 - A - TWF',
])

const STATUS_LABEL: Record<Status, string> = {
  not_picked: 'To Pick',
  picked: 'Picked',
  arrived: 'Arrived',
  checked: 'Checked Out',
  skipped: 'Skipped',
}

export default function BusPage({ students, roster, onSet }: Props) {
  const [schoolSel, setSchoolSel] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')

  const clearSearch = () => setQ('')

  // Page-level filtered list (this is what counts will respect)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = students.filter(s => {
      if (!s.active) return false
      if (!BUS_SCHOOLS.has(s.school)) return false
      if (!BUS_YEARS.has(s.school_year ?? '')) return false
      if (schoolSel !== 'All' && s.school !== schoolSel) return false
      if (term) {
        const name = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!name.includes(term)) return false
      }
      return true
    })
    list.sort((a,b) =>
      sortBy === 'first'
        ? a.first_name.localeCompare(b.first_name)
        : a.last_name.localeCompare(b.last_name))
    return list
  }, [students, schoolSel, q, sortBy])

  // Global counts (respect page filters)
  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      not_picked: 0, picked: 0, arrived: 0, checked: 0, skipped: 0
    }
    for (const s of filtered) {
      const st = (roster[s.id] ?? 'not_picked') as Status
      c[st]++
    }
    return c
  }, [filtered, roster])

  // Panels
  const toPickup = filtered.filter(s => (roster[s.id] ?? 'not_picked') === 'not_picked')
  const skipped = filtered.filter(s => roster[s.id] === 'skipped')

  return (
    <div className="page container">
      {/* Toolbar */}
      <div className="toolbar-bg">
        <div className="row gap wrap toolbar">
          <div className="seg seg-scroll">
            {(['All','Bain','QG','MHE','MC'] as const).map(k => (
              <button key={k}
                className={`seg-btn ${schoolSel === k ? 'on' : ''}`}
                onClick={() => setSchoolSel(k)}
              >{k}</button>
            ))}
          </div>

          <input className="search" placeholder="Search student…" value={q} onChange={e => setQ(e.target.value)} />

          <div className="row gap" style={{ marginLeft: 'auto' }}>
            <label className="muted">Sort</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="first">First Name</option>
              <option value="last">Last Name</option>
            </select>
          </div>
        </div>

        {/* Global counts respecting filters */}
        <div className="counts row wrap gap">
          {(Object.keys(counts) as Status[]).map(st => (
            <span key={st} className="chip">
              {STATUS_LABEL[st]} <b>{counts[st]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 className="section-title">Bus Pickup</h3>
          <div className="list">
            {toPickup.length === 0 && <div className="muted">No students to pick up.</div>}
            {toPickup.map(s => (
              <div key={s.id} className="card-row sd-row">
                <div>
                  <div className="heading">{s.first_name} {s.last_name}</div>
                  <div className="sub">School: {s.school} | Not Picked</div>
                </div>
                <div className="sd-card-actions">
                  <button className="btn primary" onClick={() => { onSet(s.id, 'picked'); clearSearch() }}>
                    Mark Picked
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="section-title">Skipped Today</h3>
          <div className="list">
            {skipped.length === 0 && <div className="muted">No skipped students.</div>}
            {skipped.map(s => (
              <div key={s.id} className="card-row sd-row">
                <div>
                  <div className="heading">{s.first_name} {s.last_name}</div>
                  <div className="sub">School: {s.school} | Skipped</div>
                </div>
                <div className="sd-card-actions">
                  <button className="btn" onClick={() => { onSet(s.id, 'not_picked'); clearSearch() }}>
                    Unskip Today
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
