import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => void
}

/** Get an ISO string for now in America/New_York suitable for datetime-local input */
function nowESTForInput(): string {
  const now = new Date()
  // Convert "now" to EST/EDT wall time components
  const est = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now)
  const get = (t: string) => est.find(p => p.type === t)?.value || ''
  // to yyyy-MM-ddTHH:mm
  const mm = get('month'); const dd = get('day'); const yyyy = get('year')
  const hh = get('hour'); const mi = get('minute')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function fullName(s: StudentRow) {
  return `${s.first_name} ${s.last_name}`
}

export default function CenterPage({ students, roster, onSet }: Props) {
  const [tab, setTab] = useState<'in' | 'out'>('in')

  // local page filters/search/sort (v1.6 had these locally on pages)
  const [schoolSel, setSchoolSel] = useState<'All' | 'Bain' | 'QG' | 'MHE' | 'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')

  // checkout modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [checkoutStudent, setCheckoutStudent] = useState<StudentRow | null>(null)
  const [pickupPerson, setPickupPerson] = useState<string | null>(null)
  const [pickupAt, setPickupAt] = useState<string>(nowESTForInput())

  const matchesSchool = (s: StudentRow) => (schoolSel === 'All' ? true : s.school === schoolSel)
  const matchesSearch = (s: StudentRow) => {
    const term = q.trim().toLowerCase()
    if (!term) return true
    return fullName(s).toLowerCase().includes(term)
  }
  const byName = (a: StudentRow, b: StudentRow) =>
    (sortBy === 'first'
      ? a.first_name.localeCompare(b.first_name)
      : a.last_name.localeCompare(b.last_name))

  // lists
  const fromBus = useMemo(() =>
    students.filter(s => roster[s.id] === 'picked')
      .filter(matchesSchool).filter(matchesSearch).sort(byName),
    [students, roster, schoolSel, q, sortBy])

  const directIn = useMemo(() =>
    students.filter(s => {
      const st = roster[s.id] ?? 'not_picked'
      // direct: not picked, not skipped, not arrived/checked
      return st !== 'picked' && st !== 'skipped' && st !== 'arrived' && st !== 'checked'
    }).filter(matchesSchool).filter(matchesSearch).sort(byName),
    [students, roster, schoolSel, q, sortBy])

  const toCheckout = useMemo(() =>
    students.filter(s => roster[s.id] === 'arrived')
      .filter(matchesSchool).filter(matchesSearch).sort(byName),
    [students, roster, schoolSel, q, sortBy])

  const checkedOut = useMemo(() =>
    students.filter(s => roster[s.id] === 'checked')
      .filter(matchesSchool).filter(matchesSearch).sort(byName),
    [students, roster, schoolSel, q, sortBy])

  function clearSearch() { setQ('') }

  function openCheckout(s: StudentRow) {
    setCheckoutStudent(s)
    setPickupPerson(null)                 // no default selection
    setPickupAt(nowESTForInput())         // default to now (EST)
    setModalOpen(true)
  }
  function closeCheckout() {
    setModalOpen(false)
    setCheckoutStudent(null)
  }
  async function confirmCheckout() {
    if (!checkoutStudent) return
    await onSet(checkoutStudent.id, 'checked', {
      pickupPerson: pickupPerson ?? undefined,
      pickupAtISO_EST: pickupAt, // keep for logs if you store it
    })
    clearSearch()
    closeCheckout()
  }

  return (
    <div className="page container">
      {/* Toolbar (school filter + search + sort) */}
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
      </div>

      <div className="seg" style={{ marginTop: 12, marginBottom: 12 }}>
        <button className={`seg-btn ${tab === 'in' ? 'on' : ''}`} onClick={() => setTab('in')}>Check-in</button>
        <button className={`seg-btn ${tab === 'out' ? 'on' : ''}`} onClick={() => setTab('out')}>Checkout</button>
      </div>

      {tab === 'in' ? (
        <div className="two-col">
          <div className="card">
            <h3 className="section-title">Center Check-in (from Bus)</h3>
            <div className="list">
              {fromBus.length === 0 && <div className="muted">No students to check in from bus.</div>}
              {fromBus.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">School: {s.school} | Picked</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => { onSet(s.id, 'arrived'); clearSearch() }}>Mark Arrived</button>
                    <button className="btn" onClick={() => { onSet(s.id, 'not_picked'); clearSearch() }}>Undo</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Direct Check-in (No Bus)</h3>
            <div className="list">
              {directIn.length === 0 && <div className="muted">No students for direct check-in.</div>}
              {directIn.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">School: {s.school} | Not Picked</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => { onSet(s.id, 'arrived'); clearSearch() }}>Mark Arrived</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="two-col">
          <div className="card">
            <h3 className="section-title">Checkout</h3>
            <div className="list">
              {toCheckout.length === 0 && <div className="muted">No students to checkout.</div>}
              {toCheckout.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">School: {s.school} | Arrived</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => openCheckout(s)}>Checkout</button>
                    <button className="btn" onClick={() => { onSet(s.id, 'picked'); clearSearch() }}>Undo</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Checked Out</h3>
            <div className="list">
              {checkedOut.length === 0 && <div className="muted">No checked-out students.</div>}
              {checkedOut.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">School: {s.school} | Checked-out</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn" onClick={() => { onSet(s.id, 'arrived'); clearSearch() }}>Undo</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- Checkout Modal --- */}
      {modalOpen && checkoutStudent && (
        <div className="modal" onClick={closeCheckout}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="heading">Checkout</div>
              <button className="btn" onClick={closeCheckout}>✕</button>
            </div>

            <div className="modal-body">
              <div className="label">Student</div>
              <div className="heading">{fullName(checkoutStudent)}</div>

              <div className="label" style={{ marginTop: 8 }}>Approved pickup</div>
              <div className="row wrap gap">
                {(checkoutStudent.approved_pickups ?? []).length === 0 && (
                  <div className="muted">No approved names on file. You can continue without a name.</div>
                )}
                {(checkoutStudent.approved_pickups ?? []).map((n) => (
                  <button
                    key={n}
                    className={`chip ${pickupPerson === n ? 'chip-on' : ''}`}
                    onClick={() => setPickupPerson(n === pickupPerson ? null : n)}
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="label" style={{ marginTop: 8 }}>Pickup time (EST)</div>
              <input type="datetime-local" value={pickupAt} onChange={e => setPickupAt(e.target.value)} />
            </div>

            <div className="modal-foot">
              <button className="btn primary" onClick={confirmCheckout}>Checkout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
