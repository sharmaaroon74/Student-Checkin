import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes?: Record<string, string>   // ISO timestamptz string of the student's LAST status change (v1.6 already had this available)
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
  // Format to America/New_York local time
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value ?? ''
  const m = parts.find(p => p.type === 'minute')?.value ?? ''
  const day = parts.find(p => p.type === 'dayPeriod')?.value?.toUpperCase() ?? ''
  return `${h}:${m} ${day}`
}

export default function CenterPage({ students, roster, rosterTimes, onSet }: Props) {
  const [tab, setTab] = useState<'in' | 'out'>('in')

  // local page filters/search/sort (as in v1.6)
  const [schoolSel, setSchoolSel] = useState<'All' | 'Bain' | 'QG' | 'MHE' | 'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')

  const clearSearch = () => setQ('')

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

  // Filtered set (used for counts + lists)
  const filtered = useMemo(() =>
    students.filter(matchesSchool).filter(matchesSearch).sort(byName),
    [students, schoolSel, q, sortBy])

  // Global counts (respect page filters)
  const counts = useMemo(() => {
    const c: Record<Status, number> = { not_picked: 0, picked: 0, arrived: 0, checked: 0, skipped: 0 }
    for (const s of filtered) {
      const st = (roster[s.id] ?? 'not_picked') as Status
      c[st]++
    }
    return c
  }, [filtered, roster])

  // Lists
  const fromBus = useMemo(() =>
    filtered.filter(s => roster[s.id] === 'picked'),
    [filtered, roster])

  const directIn = useMemo(() =>
    filtered.filter(s => {
      const st = roster[s.id] ?? 'not_picked'
      return st !== 'picked' && st !== 'skipped' && st !== 'arrived' && st !== 'checked'
    }),
    [filtered, roster])

  const toCheckout = useMemo(() =>
    filtered.filter(s => roster[s.id] === 'arrived'),
    [filtered, roster])

  const checkedOut = useMemo(() =>
    filtered.filter(s => roster[s.id] === 'checked'),
    [filtered, roster])

  // Checkout modal state (kept exactly as you approved)
  const [modalOpen, setModalOpen] = useState(false)
  const [checkoutStudent, setCheckoutStudent] = useState<StudentRow | null>(null)
  const [pickupPerson, setPickupPerson] = useState<string | null>(null)
  const [pickupAt, setPickupAt] = useState<string>(nowESTForInput())

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

  function openCheckout(s: StudentRow) {
    setCheckoutStudent(s)
    setPickupPerson(null)
    setPickupAt(nowESTForInput())
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
      pickupAtISO_EST: pickupAt,
    })
    clearSearch()
    closeCheckout()
  }

  // Helper to show "Status | optional time"
  function statusWithTime(id: string, label: string) {
    const iso = rosterTimes?.[id]
    const t = formatESTTime(iso || '')
    return t ? `${label} : ${t}` : label
  }

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

      {/* Tabs */}
      <div className="seg" style={{ marginTop: 12, marginBottom: 12 }}>
        <button className={`seg-btn ${tab === 'in' ? 'on' : ''}`} onClick={() => setTab('in')}>Check-in</button>
        <button className={`seg-btn ${tab === 'out' ? 'on' : ''}`} onClick={() => setTab('out')}>Checkout</button>
      </div>

      {tab === 'in' ? (
        <div className="two-col">
          {/* Center Check-in (from Bus) */}
          <div className="card">
            <h3 className="section-title">Center Check-in (from Bus)</h3>
            <div className="list">
              {fromBus.length === 0 && <div className="muted">No students to check in from bus.</div>}
              {fromBus.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">
                      School: {s.school} | {statusWithTime(s.id, STATUS_LABEL['picked'])}
                    </div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => { onSet(s.id, 'arrived'); clearSearch() }}>Mark Arrived</button>
                    <button className="btn" onClick={() => { onSet(s.id, 'not_picked'); clearSearch() }}>Undo</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Direct Check-in (No Bus) */}
          <div className="card">
            <h3 className="section-title">Direct Check-in (No Bus)</h3>
            <div className="list">
              {directIn.length === 0 && <div className="muted">No students for direct check-in.</div>}
              {directIn.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">
                      School: {s.school} | {STATUS_LABEL['not_picked']}
                    </div>
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
          {/* Checkout */}
          <div className="card">
            <h3 className="section-title">Checkout</h3>
            <div className="list">
              {toCheckout.length === 0 && <div className="muted">No students to checkout.</div>}
              {toCheckout.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">
                      School: {s.school} | {statusWithTime(s.id, STATUS_LABEL['arrived'])}
                    </div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => openCheckout(s)}>Checkout</button>
                    <button className="btn" onClick={() => { onSet(s.id, 'picked'); clearSearch() }}>Undo</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checked Out */}
          <div className="card">
            <h3 className="section-title">Checked Out</h3>
            <div className="list">
              {checkedOut.length === 0 && <div className="muted">No checked-out students.</div>}
              {checkedOut.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">
                      School: {s.school} | {statusWithTime(s.id, STATUS_LABEL['checked'])}
                    </div>
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

      {/* --- Checkout Modal (unchanged behavior) --- */}
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
