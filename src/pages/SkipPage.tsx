import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'
import TopToolbar from '../components/TopToolbar'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes?: Record<string, string>   // last status change time ISO per student
  onSet: (id: string, st: Status, meta?: any) => void
}

const STATUS_LABEL: Record<Status, string> = {
  not_picked: 'Not Picked',
  picked: 'Picked',
  arrived: 'Arrived',
  checked: 'Checked Out',
  skipped: 'Skipped',
}

function fullName(s: StudentRow) {
  return `${s.first_name} ${s.last_name}`
}

function formatESTTime(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).formatToParts(d)
  const h = p.find(x => x.type === 'hour')?.value ?? ''
  const m = p.find(x => x.type === 'minute')?.value ?? ''
  const ap = p.find(x => x.type === 'dayPeriod')?.value?.toUpperCase() ?? ''
  return `${h}:${m} ${ap}`
}

// helper for the modal default
function nowESTForInput(): string {
  const now = new Date()
  const est = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now)
  const get = (t: string) => est.find(p => p.type === t)?.value || ''
  const mm = get('month'); const dd = get('day'); const yyyy = get('year')
  const hh = get('hour'); const mi = get('minute')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

export default function CenterPage({ students, roster, rosterTimes, onSet }: Props) {
  const [tab, setTab] = useState<'in' | 'out'>('in')

  // local toolbar state (shared UI)
  const [schoolSel, setSchoolSel] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')

  const clearSearch = () => setQ('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = students.filter(s => {
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

  // global counts (respect filters)
  const counts = useMemo(() => {
    const c: Record<Status, number> = { not_picked: 0, picked: 0, arrived: 0, checked: 0, skipped: 0 }
    for (const s of filtered) c[(roster[s.id] ?? 'not_picked') as Status]++
    return c
  }, [filtered, roster])

  // lists
  const fromBus   = useMemo(() => filtered.filter(s => roster[s.id] === 'picked'), [filtered, roster])
  const directIn  = useMemo(() => filtered.filter(s => {
    const st = roster[s.id] ?? 'not_picked'
    return st !== 'picked' && st !== 'skipped' && st !== 'arrived' && st !== 'checked'
  }), [filtered, roster])
  const toCheckout = useMemo(() => filtered.filter(s => roster[s.id] === 'arrived'), [filtered, roster])
  const checkedOut = useMemo(() => filtered.filter(s => roster[s.id] === 'checked'), [filtered, roster])

  // checkout modal
  const [modalOpen, setModalOpen] = useState(false)
  const [checkoutStudent, setCheckoutStudent] = useState<StudentRow | null>(null)
  const [pickupPerson, setPickupPerson] = useState<string | null>(null)
  const [pickupAt, setPickupAt] = useState<string>(nowESTForInput())

  function openCheckout(s: StudentRow) {
    setCheckoutStudent(s); setPickupPerson(null); setPickupAt(nowESTForInput()); setModalOpen(true)
  }
  function closeCheckout() { setModalOpen(false); setCheckoutStudent(null) }
  async function confirmCheckout() {
    if (!checkoutStudent) return
    await onSet(checkoutStudent.id, 'checked', {
      pickupPerson: pickupPerson ?? undefined,
      pickupAtISO_EST: pickupAt,
    })
    clearSearch()
    closeCheckout()
  }

  const statusWithTime = (id: string, label: string) => {
    const iso = rosterTimes?.[id]; const t = formatESTTime(iso)
    return t ? `${label} : ${t}` : label
  }

  return (
    <div className="page container">
      <TopToolbar
        schoolSel={schoolSel} onSchoolSel={setSchoolSel}
        search={q} onSearch={setQ}
        sortBy={sortBy} onSortBy={setSortBy}
        counts={counts}
      />

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
                    <div className="sub">School: {s.school} | {statusWithTime(s.id, STATUS_LABEL['picked'])}</div>
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
                    <div className="sub">School: {s.school} | {statusWithTime(s.id, STATUS_LABEL['arrived'])}</div>
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
                    <div className="sub">School: {s.school} | {statusWithTime(s.id, STATUS_LABEL['checked'])}</div>
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

      {/* Checkout Modal (unchanged) */}
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
