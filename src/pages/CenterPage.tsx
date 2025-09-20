import React, { useMemo, useState } from 'react'
import type { StudentRow, Status } from '../types'
import { toESTLocalISO } from '../utils/time' // helper we’ll define below if you don’t already have one

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
}

const SCHOOLS = ['All', 'Bain', 'QG', 'MHE', 'MC'] as const
type SchoolFilter = typeof SCHOOLS[number]

type CheckoutModalProps = {
  student: StudentRow | null
  onClose: () => void
  onConfirm: (pickupPerson: string, pickedAtISO: string) => void
}

function CheckoutModal({ student, onClose, onConfirm }: CheckoutModalProps) {
  if (!student) return null

  const [override, setOverride] = useState('')
  const [timeISO, setTimeISO] = useState(toESTLocalISO(new Date()))
  const [selected, setSelected] = useState<string | null>(null)

  const approved = (student.approved_pickups ?? []) as string[]

  function confirm() {
    const name = (selected && selected.length > 0) ? selected : override.trim()
    if (!name) { alert('Select or type a pickup person.'); return }
    onConfirm(name, timeISO)
  }

  return (
    <div className="modal">
      <div className="modal-card">
        <div className="modal-head">
          <div className="heading">Verify Pickup</div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="muted" style={{ marginBottom: 8 }}>
            Student: <b>{student.first_name} {student.last_name}</b> &nbsp; <span className="sub">({student.school})</span>
          </div>

          <div className="label" style={{ marginTop: 8 }}>Approved Pickup</div>
          <div className="grid grid-2" style={{ marginBottom: 8 }}>
            {approved.length === 0 ? (
              <div className="muted">No approved names on file.</div>
            ) : approved.map(name => (
              <button
                key={name}
                className={'chip ' + (selected === name ? 'chip-on' : '')}
                onClick={() => setSelected(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="label">Admin Override</div>
          <input
            placeholder="Type full name"
            value={override}
            onChange={e => setOverride(e.target.value)}
          />

          <div className="label" style={{ marginTop: 8 }}>Pickup time (EST)</div>
          <input
            type="datetime-local"
            value={timeISO}
            onChange={e => setTimeISO(e.target.value)}
          />
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={confirm}>Checkout</button>
        </div>
      </div>
    </div>
  )
}

export default function CenterPage({ students, roster, onSet }: Props) {
  // SINGLE-SELECT school filter
  const [school, setSchool] = useState<SchoolFilter>('All')
  const [q, setQ] = useState('')
  const [checkingOut, setCheckingOut] = useState<StudentRow | null>(null)

  const norm = (s: string) => s.toLowerCase().trim()
  const matches = (s: StudentRow) => {
    const hit = norm(s.first_name).includes(norm(q)) || norm(s.last_name).includes(norm(q))
    if (!hit) return false
    if (school === 'All') return true
    return s.school === school
  }

  // Center Check-in (from Bus): status = picked
  const centerCheckinFromBus = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'picked' && matches(s)),
    [students, roster, school, q]
  )

  // Direct Check-in (No Bus): status != picked and != skipped
  const directCheckin = useMemo(
    () => students.filter(s => {
      const st = roster[s.id] ?? 'not_picked'
      return st !== 'picked' && st !== 'skipped' && matches(s)
    }),
    [students, roster, school, q]
  )

  // Checkout queue: status = arrived
  const checkoutQueue = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'arrived' && matches(s)),
    [students, roster, school, q]
  )

  // Checked Out: status = checked
  const checkedOut = useMemo(
    () => students.filter(s => (roster[s.id] ?? 'not_picked') === 'checked' && matches(s)),
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
            <CardRow
              key={s.id}
              s={s}
              right={
                <>
                  <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>Mark Arrived</button>
                  <button className="btn" onClick={() => onSet(s.id, 'not_picked')}>Undo</button>
                </>
              }
            />
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
            <CardRow
              key={s.id}
              s={s}
              right={<button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>Mark Arrived</button>}
            />
          ))}
        </div>
      )}

      {/* Checkout */}
      <h3 className="section-title" style={{ marginTop: 18 }}>Checkout</h3>
      {checkoutQueue.length === 0 ? (
        <div className="muted">No students ready for checkout.</div>
      ) : (
        <div className="list">
          {checkoutQueue.map(s => (
            <CardRow
              key={s.id}
              s={s}
              right={
                <button className="btn primary" onClick={() => setCheckingOut(s)}>Checkout</button>
              }
            />
          ))}
        </div>
      )}

      {/* Checked Out — read-only */}
      <h3 className="section-title" style={{ marginTop: 18 }}>Checked Out</h3>
      {checkedOut.length === 0 ? (
        <div className="muted">No students checked out.</div>
      ) : (
        <div className="list">
          {checkedOut.map(s => (
            <CardRow key={s.id} s={s} right={<span className="muted">Checked-out</span>} />
          ))}
        </div>
      )}

      {/* Modal */}
      <CheckoutModal
        student={checkingOut}
        onClose={() => setCheckingOut(null)}
        onConfirm={(pickupPerson, pickedAtISO) => {
          if (!checkingOut) return
          onSet(checkingOut.id, 'checked', {
            pickup_person: pickupPerson,
            picked_at: pickedAtISO,
          })
          setCheckingOut(null)
        }}
      />
    </div>
  )
}
