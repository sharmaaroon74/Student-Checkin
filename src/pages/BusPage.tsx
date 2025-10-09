import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'
import TopToolbar from '../components/TopToolbar'


type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
}

// Shared constants used for the Bus-eligible panel
const ALLOWED_SCHOOLS = ['Bain', 'QG', 'MHE', 'MC']
const BUS_ELIGIBLE_YEARS = [
  'FT - A',
  'FT - B/A',
  'PT3 - A - TWR',
  'PT3 - A - MWF',
  'PT2 - A - WR',
  'PT3 - A - TWF',
]

export default function BusPage({ students, roster, onSet }: Props) {
  const [schoolSel, setSchoolSel] =
    useState<'All' | 'Bain' | 'QG' | 'MHE' | 'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')

   // Display name according to current sort toggle
  const nameFor = (s: StudentRow) =>
    sortBy === 'first' ? `${s.first_name} ${s.last_name}` : `${s.last_name}, ${s.first_name}`

  // ---------- BASE FILTER (used for GLOBAL COUNTS on every page) ----------
  const base = useMemo(() => {
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

  // ---------- GLOBAL COUNTS (same logic on all pages) ----------
  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      not_picked: 0,
      picked: 0,
      arrived: 0,
      checked: 0,
      skipped: 0,
    }
    for (const s of base) {
      const st = (roster[s.id] ?? 'not_picked') as Status
      if (st === 'not_picked') {
        const yr = (s.school_year ?? '').trim()
        if (s.active && ALLOWED_SCHOOLS.includes(s.school) && BUS_ELIGIBLE_YEARS.includes(yr)) {
          c.not_picked++
        }
      } else {
        c[st]++
      }
    }
    return c
  }, [base, roster])

  // ---------- PAGE SECTIONS (unchanged behavior) -- --------
  const busPickup = useMemo(() => {
    return base.filter((s) => {
      const st = (roster[s.id] ?? 'not_picked') as Status
      if (st !== 'not_picked') return false
      if (!ALLOWED_SCHOOLS.includes(s.school)) return false
      const yr = (s.school_year ?? '').trim()
      return BUS_ELIGIBLE_YEARS.includes(yr)
    })
  }, [base, roster])

  const skippedToday = useMemo(
    () => base.filter((s) => roster[s.id] === 'skipped'),
    [base, roster]
  )

  const clearSearch = () => setQ('')

  return (
    <div className="page container">
      <TopToolbar
        schoolSel={schoolSel}
        onSchoolSel={setSchoolSel}
        search={q}
        onSearch={setQ}
        sortBy={sortBy}
        onSortBy={setSortBy}
        counts={counts}
      />

      <div className="two-col" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 className="section-title">Bus Pickup</h3>
          <div className="list">
            {busPickup.length === 0 && (
              <div className="muted">No students to pick up.</div>
            )}
            {busPickup.map((s) => (
              <div key={s.id} className="card-row sd-row">
                <div>
                  <div className="heading">
                    {nameFor(s)}
                  </div>
                  <div className="sub">School: {s.school} | Not Picked</div>
                </div>
                <div className="sd-card-actions">
                  <button
                    className="btn primary"
                    onClick={() => {
                      onSet(s.id, 'picked')
                      onSet(s.id, 'arrived', { autoArrive: true, source: 'bus' })
                      clearSearch()
                    }}
                  >
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
            {skippedToday.length === 0 && (
              <div className="muted">No skipped students.</div>
            )}
            {skippedToday.map((s) => (
              <div key={s.id} className="card-row sd-row">
                <div>
                  <div className="heading">
                    {nameFor(s)}
                  </div>
                  <div className="sub">School: {s.school} | Skipped</div>
                </div>
                <div className="sd-card-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      onSet(s.id, 'not_picked')
                      clearSearch()
                    }}
                  >
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
