import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes: Record<string, string> // not used here; kept for signature parity
  onSet: (id: string, st: Status, meta?: any) => void
}

// same eligibility logic you already had
const BUS_SCHOOLS = new Set(['Bain', 'MC', 'MHE', 'QG'])
const BUS_YEARS = new Set([
  'FT - A',
  'FT - B/A',
  'PT3 - A - TWR',
  'PT3 - A - MWF',
  'PT2 - A - WR',
  'PT3 - A - TWF',
])

const SCHOOL_FILTERS: Array<{ key: string; label: string }> = [
  { key: 'All', label: 'All' },
  { key: 'Bain', label: 'Bain' },
  { key: 'QG', label: 'QG' },
  { key: 'MHE', label: 'MHE' },
  { key: 'MC', label: 'MC' },
]

export default function BusPage({ students, roster, rosterTimes, onSet }: Props) {
  const [schoolSel, setSchoolSel] = useState<string>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')

  // global counts (respect school filter + search)
  const counts = useMemo(() => {
    let toPick = 0, picked = 0, arrived = 0, checked = 0, skipped = 0
    const ql = q.trim().toLowerCase()
    for (const s of students) {
      if (!s.active) continue
      if (!BUS_SCHOOLS.has(s.school)) continue
      if (!BUS_YEARS.has(s.school_year ?? '')) continue

      if (schoolSel !== 'All' && s.school !== schoolSel) continue
      if (ql) {
        const full = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!full.includes(ql)) continue
      }

      const st = roster[s.id] ?? 'not_picked'
      if (st === 'not_picked') toPick++
      else if (st === 'picked') picked++
      else if (st === 'arrived') arrived++
      else if (st === 'checked') checked++
      else if (st === 'skipped') skipped++
    }
    return { toPick, picked, arrived, checked, skipped }
  }, [students, roster, schoolSel, q])

  const toPickup = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = students.filter((s) => {
      if (!s.active) return false
      if (!BUS_SCHOOLS.has(s.school)) return false
      if (!BUS_YEARS.has(s.school_year ?? '')) return false

      const st = roster[s.id]
      if (st === 'skipped' || st === 'arrived' || st === 'checked') return false
      if (st === 'picked') return false // only “Not Picked” here

      if (schoolSel !== 'All' && s.school !== schoolSel) return false
      if (ql) {
        const full = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!full.includes(ql)) return false
      }
      return true
    })
    list.sort((a, b) =>
      sortBy === 'first'
        ? a.first_name.localeCompare(b.first_name)
        : a.last_name.localeCompare(b.last_name)
    )
    return list
  }, [students, roster, q, schoolSel, sortBy])

  const skippedToday = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = students.filter((s) => {
      if (!s.active) return false
      if (schoolSel !== 'All' && s.school !== schoolSel) return false
      if (ql) {
        const full = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!full.includes(ql)) return false
      }
      return roster[s.id] === 'skipped'
    })
    list.sort((a, b) => a.last_name.localeCompare(b.last_name))
    return list
  }, [students, roster, q, schoolSel])

  return (
    <div className="page container">
      {/* TOP BAR — identical structure to Skip page */}
      <div className="card" style={{ paddingBottom: 10 }}>
        <div className="row gap wrap" style={{ alignItems: 'center' }}>
          <div className="seg seg-scroll">
            {SCHOOL_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`seg-btn ${schoolSel === f.key ? 'active' : ''}`}
                onClick={() => setSchoolSel(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <input
            className="search"
            placeholder="Search student…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div className="row gap" style={{ marginLeft: 'auto' }}>
            <label className="muted">Sort</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="first">First Name</option>
              <option value="last">Last Name</option>
            </select>
          </div>
        </div>

        {/* Global counts (inline under same bar) */}
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          <span className="badge">To Pick <b>{counts.toPick}</b></span>
          <span className="badge">Picked <b>{counts.picked}</b></span>
          <span className="badge">Arrived <b>{counts.arrived}</b></span>
          <span className="badge">Checked <b>{counts.checked}</b></span>
          <span className="badge">Skipped <b>{counts.skipped}</b></span>
          <span className="muted" style={{ marginLeft: 'auto' }}>build: ui-parity-3</span>
        </div>
      </div>

      {/* Two columns — same as Skip */}
      <div className="two-col" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 className="title">Bus Pickup</h3>
          {toPickup.length === 0 ? (
            <div className="muted">No students to pick up.</div>
          ) : (
            <div className="vlist gap">
              {toPickup.map((s) => (
                <div key={s.id} className="item row between">
                  <div>
                    <div className="name">{s.first_name} {s.last_name}</div>
                    <div className="muted">School: {s.school} | Not Picked</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => onSet(s.id, 'picked')}>
                      Mark Picked
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="title">Skipped Today</h3>
          {skippedToday.length === 0 ? (
            <div className="muted">No skipped students.</div>
          ) : (
            <div className="vlist gap">
              {skippedToday.map((s) => (
                <div key={s.id} className="item row between">
                  <div>
                    <div className="name">{s.first_name} {s.last_name}</div>
                    <div className="muted">School: {s.school} | Skipped</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn" onClick={() => onSet(s.id, 'not_picked')}>
                      Unskip Today
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
