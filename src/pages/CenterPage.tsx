import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes: Record<string, string>
  onSet: (id: string, st: Status, meta?: any) => void
  inferPrevStatus?: (s: StudentRow) => Status
}

// direct-eligible years (unchanged)
const DIRECT_YEARS = new Set([
  'B', 'H',
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

function fmt(st: Status | undefined, iso?: string) {
  if (!st || st === 'not_picked') return 'Not Picked'
  if (st === 'skipped') return 'Skipped'
  if (!iso) return st === 'picked' ? 'Picked' : st === 'arrived' ? 'Arrived' : 'Checked Out'
  const h = new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  return `${st === 'picked' ? 'Picked' : st === 'arrived' ? 'Arrived' : 'Checked Out'} : ${h}`
}

export default function CenterPage({
  students, roster, rosterTimes, onSet,
  inferPrevStatus = (s) => (roster[s.id] === 'arrived' ? 'picked' : 'not_picked'),
}: Props) {
  const [schoolSel, setSchoolSel] = useState<string>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')
  const [tab, setTab] = useState<'checkin' | 'checkout'>('checkin')

  // global counts (respect filters/search)
  const counts = useMemo(() => {
    let toPick = 0, picked = 0, arrived = 0, checked = 0, skipped = 0
    const ql = q.trim().toLowerCase()
    for (const s of students) {
      if (!s.active) continue
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

  const pickedForCheckin = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = students.filter((s) => {
      if (!s.active) return false
      const st = roster[s.id]
      if (st !== 'picked') return false
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

  const directForCheckin = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = students.filter((s) => {
      if (!s.active) return false
      if (!DIRECT_YEARS.has(s.school_year ?? '')) return false
      const st = roster[s.id]
      if (st === 'picked' || st === 'arrived' || st === 'checked' || st === 'skipped') return false
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

  const arrived = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = students.filter((s) => {
      if (!s.active) return false
      if (roster[s.id] !== 'arrived') return false
      if (schoolSel !== 'All' && s.school !== schoolSel) return false
      if (ql) {
        const full = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!full.includes(ql)) return false
      }
      return true
    })
    list.sort((a, b) => a.last_name.localeCompare(b.last_name))
    return list
  }, [students, roster, q, schoolSel])

  const checkedOut = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = students.filter((s) => {
      if (!s.active) return false
      if (roster[s.id] !== 'checked') return false
      if (schoolSel !== 'All' && s.school !== schoolSel) return false
      if (ql) {
        const full = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!full.includes(ql)) return false
      }
      return true
    })
    list.sort((a, b) => a.last_name.localeCompare(b.last_name))
    return list
  }, [students, roster, q, schoolSel])

  return (
    <div className="page container">
      {/* TOP BAR — identical to Skip page */}
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

        {/* Global counts under same bar */}
        <div className="row gap wrap" style={{ marginTop: 8 }}>
          <span className="badge">To Pick <b>{counts.toPick}</b></span>
          <span className="badge">Picked <b>{counts.picked}</b></span>
          <span className="badge">Arrived <b>{counts.arrived}</b></span>
          <span className="badge">Checked <b>{counts.checked}</b></span>
          <span className="badge">Skipped <b>{counts.skipped}</b></span>
        </div>
      </div>

      {/* tabs strip, same style as before */}
      <div className="seg" style={{ marginTop: 12, marginBottom: 12 }}>
        <button className={`seg-btn ${tab === 'checkin' ? 'active' : ''}`} onClick={() => setTab('checkin')}>Check-in</button>
        <button className={`seg-btn ${tab === 'checkout' ? 'active' : ''}`} onClick={() => setTab('checkout')}>Checkout</button>
      </div>

      {tab === 'checkin' ? (
        <div className="two-col">
          <div className="card">
            <h3 className="title">Center Check-in (from Bus)</h3>
            {pickedForCheckin.length === 0 ? (
              <div className="muted">No students to check in from bus.</div>
            ) : (
              <div className="vlist gap">
                {pickedForCheckin.map((s) => (
                  <div key={s.id} className="item row between">
                    <div>
                      <div className="name">{s.first_name} {s.last_name}</div>
                      <div className="muted">School: {s.school} | Picked</div>
                    </div>
                    <div className="sd-card-actions">
                      <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>Mark Arrived</button>
                      <button className="btn" onClick={() => onSet(s.id, 'not_picked')}>Undo</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="title">Direct Check-in (No Bus)</h3>
            {directForCheckin.length === 0 ? (
              <div className="muted">No students for direct check-in.</div>
            ) : (
              <div className="vlist gap">
                {directForCheckin.map((s) => (
                  <div key={s.id} className="item row between">
                    <div>
                      <div className="name">{s.first_name} {s.last_name}</div>
                      <div className="muted">School: {s.school} | Not Picked</div>
                    </div>
                    <div className="sd-card-actions">
                      <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>Mark Arrived</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="two-col">
          <div className="card">
            <h3 className="title">Checkout</h3>
            {arrived.length === 0 ? (
              <div className="muted">No students to checkout.</div>
            ) : (
              <div className="vlist gap">
                {arrived.map((s) => (
                  <div key={s.id} className="item row between">
                    <div>
                      <div className="name">{s.first_name} {s.last_name}</div>
                      <div className="muted">School: {s.school} | {fmt('arrived', rosterTimes[s.id])}</div>
                    </div>
                    <div className="sd-card-actions">
                      <button className="btn primary" onClick={() => onSet(s.id, 'checked')}>Checkout</button>
                      <button className="btn" onClick={() => onSet(s.id, inferPrevStatus(s))}>Undo</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="title">Checked Out</h3>
            {checkedOut.length === 0 ? (
              <div className="muted">No checked-out students.</div>
            ) : (
              <div className="vlist gap">
                {checkedOut.map((s) => (
                  <div key={s.id} className="item row between">
                    <div>
                      <div className="name">{s.first_name} {s.last_name}</div>
                      <div className="muted">School: {s.school} | {fmt('checked', rosterTimes[s.id])}</div>
                    </div>
                    <div className="sd-card-actions">
                      <button className="btn" onClick={() => onSet(s.id, 'arrived')}>Undo</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
