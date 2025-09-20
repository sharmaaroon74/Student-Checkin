import React, { useMemo, useState } from 'react'
import type { StudentRow, Status } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status) => void
}

const SCHOOLS = ['All', 'Bain', 'QG', 'MHE', 'MC'] as const
type SchoolFilter = typeof SCHOOLS[number]

export default function CenterPage({ students, roster, onSet }: Props) {
  // SINGLE-SELECT school filter
  const [school, setSchool] = useState<SchoolFilter>('All')
  const [q, setQ] = useState('')

  const norm = (s: string) => s.toLowerCase().trim()
  const matches = (s: StudentRow) => {
    const hit = norm(s.first_name).includes(norm(q)) || norm(s.last_name).includes(norm(q))
    if (!hit) return false
    if (school === 'All') return true
    return s.school === school
  }

  // Center Check-in (from Bus): only students picked
  const centerCheckinFromBus = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'picked' && matches(s)),
    [students, roster, school, q]
  )

  // Direct Check-in (No Bus): active students who are not picked and not skipped
  const directCheckin = useMemo(
    () => students.filter(s => {
      const st = roster[s.id] ?? 'not_picked'
      return (st !== 'picked' && st !== 'skipped') && matches(s)
    }),
    [students, roster, school, q]
  )

  // Checkout queue: arrived
  const checkoutQueue = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'arrived' && matches(s)),
    [students, roster, school, q]
  )

  // Checked Out: checked
  const checkedOut = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'checked' && matches(s)),
    [students, roster, school, q]
  )

  function CardRow({ s, children }: { s: StudentRow; children: React.ReactNode }) {
    return (
      <div className="row card-row">
        <div className="grow">
          <div className="name">{s.first_name} {s.last_name}</div>
          <div className="sub">School: {s.school}</div>
        </div>
        <div className="actions">{children}</div>
      </div>
    )
  }

  return (
    <div className="card">
      {/* Top filters */}
      <div className="row wrap gap">
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

      {/* Center Check-in (from Bus) */}
      <h3 className="section-title">Center Check-in (from Bus)</h3>
      {centerCheckinFromBus.length === 0 ? (
        <div className="muted">No students picked yet.</div>
      ) : (
        <div className="list">
          {centerCheckinFromBus.map(s => (
            <CardRow key={s.id} s={s}>
              <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>Mark Arrived</button>
              <button className="btn" onClick={() => onSet(s.id, 'not_picked')}>Undo</button>
            </CardRow>
          ))}
        </div>
      )}

      {/* Direct Check-in (No Bus) — NO UNDO */}
      <h3 className="section-title" style={{ marginTop: 18 }}>Direct Check-in (No Bus)</h3>
      {directCheckin.length === 0 ? (
        <div className="muted">No students available for direct check-in.</div>
      ) : (
        <div className="list">
          {directCheckin.map(s => (
            <CardRow key={s.id} s={s}>
              <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>Mark Arrived</button>
              {/* Undo intentionally removed */}
            </CardRow>
          ))}
        </div>
      )}

      {/* Checkout (Arrived queue) */}
      <h3 className="section-title" style={{ marginTop: 18 }}>Checkout</h3>
      {checkoutQueue.length === 0 ? (
        <div className="muted">No students ready for checkout.</div>
      ) : (
        <div className="list">
          {checkoutQueue.map(s => (
            <CardRow key={s.id} s={s}>
              <button className="btn primary" onClick={() => onSet(s.id, 'checked')}>Checkout</button>
              {/* Keep Undo here (goes back to picked) since you didn't request its removal */}
              <button className="btn" onClick={() => onSet(s.id, 'picked')}>Undo</button>
            </CardRow>
          ))}
        </div>
      )}

      {/* Checked Out — NO UNDO */}
      <h3 className="section-title" style={{ marginTop: 18 }}>Checked Out</h3>
      {checkedOut.length === 0 ? (
        <div className="muted">No students checked out.</div>
      ) : (
        <div className="list">
          {checkedOut.map(s => (
            <CardRow key={s.id} s={s}>
              {/* No buttons here per request */}
              <span className="muted">Checked-out</span>
            </CardRow>
          ))}
        </div>
      )}
    </div>
  )
}
