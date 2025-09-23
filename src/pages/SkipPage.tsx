import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'
import TopToolbar from '../components/TopToolbar'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
}

// #A — Allowed bus schools & programs for "Mark Skip Today"
const BUS_SCHOOLS = new Set(['Bain', 'QG', 'MHE', 'MC'])
const BUS_PROGRAMS = new Set([
  'FT - A',
  'FT - B/A',
  'PT3 - A - TWR',
  'PT3 - A - MWF',
  'PT2 - A - WR',
  'PT3 - A - TWF',
])



export default function SkipPage({ students, roster, onSet }: Props) {
  const [schoolSel, setSchoolSel] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')

  // #B — Base filtered list (respects school filter + search + sort)
const baseFiltered = useMemo(() => {
  const term = q.trim().toLowerCase()
  const list = students.filter((s) => {
    if (schoolSel !== 'All' && s.school !== schoolSel) return false
    if (term) {
      const name = `${s.first_name} ${s.last_name}`.toLowerCase()
      if (!name.includes(term)) return false
    }
    return true
  })
  list.sort((a, b) =>
    sortBy === 'first'
      ? a.first_name.localeCompare(b.first_name)
      : a.last_name.localeCompare(b.last_name)
  )
  return list
}, [students, schoolSel, q, sortBy])



  // #C1 — Global roll-up counts (for the *filtered* subset on this page)
const counts = useMemo(() => {
  const c: Record<Status, number> = {
    not_picked: 0,
    picked: 0,
    arrived: 0,
    checked: 0,
    skipped: 0,
  }
  for (const s of baseFiltered) {
    const st = (roster[s.id] ?? 'not_picked') as Status
    c[st]++
  }
  return c
}, [baseFiltered, roster])

// #C2 — Who can be *marked skipped today* (bus programs only)
const canSkip = useMemo(() => {
  return baseFiltered.filter((s) => {
    const st = (roster[s.id] ?? 'not_picked') as Status
    return (
      s.active === true &&
      BUS_SCHOOLS.has(s.school) &&
      BUS_PROGRAMS.has((s.school_year ?? '').trim()) &&
      st === 'not_picked'
    )
  })
}, [baseFiltered, roster])

// #C3 — Already skipped today (just show the filtered ones)
const skipped = useMemo(() => {
  return baseFiltered.filter((s) => roster[s.id] === 'skipped')
}, [baseFiltered, roster])



  const clearSearch = () => setQ('')

  
  return (
    <div className="page container">
      <TopToolbar
        schoolSel={schoolSel} onSchoolSel={setSchoolSel}
        search={q} onSearch={setQ}
        sortBy={sortBy} onSortBy={setSortBy}
        counts={counts}
      />

      <div className="two-col" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 className="section-title">Mark Skip Today</h3>
          <div className="list">
            {canSkip.length === 0 && <div className="muted">No students eligible to mark as skipped.</div>}
            {canSkip.map(s => (
              <div key={s.id} className="card-row sd-row">
                <div>
                  <div className="heading">{s.first_name} {s.last_name}</div>
                  <div className="sub">School: {s.school} | Not Picked</div>
                </div>
                <div className="sd-card-actions">
                  <button className="btn primary" onClick={() => { onSet(s.id, 'skipped'); clearSearch() }}>
                    Skip Today
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="section-title">Skipped Today</h3>
          <div className="list">
            {skipped.length === 0 && <div className="muted">No students skipped today.</div>}
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
