import React, { useMemo, useState, useCallback } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes: Record<string, string>
  onSet: (id: string, st: Status, meta?: any) => void
  // For Undo on "Checkout" (left column): arrived -> picked/not_picked
  inferPrevStatus: (s: StudentRow) => 'picked' | 'not_picked'
}

type CenterTab = 'in' | 'out'
type SortKey = 'first' | 'last'
const SCHOOLS = ['Bain', 'QG', 'MHE', 'MC'] as const

/** Format time in America/New_York (no seconds) */
function fmtEST(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Current time (HH:MM) in EST for <input type="time"> */
function currentTimeEST_HHMM() {
  const nowEST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hh = String(nowEST.getHours()).padStart(2, '0')
  const mm = String(nowEST.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function nameOf(s: StudentRow) {
  return `${s.first_name} ${s.last_name}`
}

/** shared row UI */
function StudentRowCard({
  s,
  subtitle,
  actions,
}: {
  s: StudentRow
  subtitle: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="card row between" style={{ alignItems: 'center' }}>
      <div>
        <div className="title">{nameOf(s)}</div>
        <div className="muted">{subtitle}</div>
      </div>
      <div className="row gap">{actions}</div>
    </div>
  )
}

/** simple modal */
function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed-overlay">
      <div className="modal">
        <div className="row between" style={{ marginBottom: 8 }}>
          <div className="title">{title}</div>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
      <style>{`
        .fixed-overlay{
          position: fixed; inset: 0; background: rgba(0,0,0,0.4);
          display:flex; align-items:center; justify-content:center; z-index:9999;
          padding: 16px;
        }
        .modal{
          background:#fff; border-radius:16px; padding:16px; width:min(560px, 100%);
          box-shadow:0 10px 30px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  )
}

export default function CenterPage({ students, roster, rosterTimes, onSet, inferPrevStatus }: Props) {
  const [tab, setTab] = useState<CenterTab>('in')
  const [school, setSchool] = useState<string>('All') // single select (like Skip page)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('first')

  // checkout modal state
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutStudent, setCheckoutStudent] = useState<StudentRow | null>(null)
  const [pickupSelect, setPickupSelect] = useState<string>('') // selected from approved list
  const [pickupOther, setPickupOther] = useState<string>('')   // admin override
  const [pickupTime, setPickupTime] = useState<string>(currentTimeEST_HHMM())

  // two-column wrapper (guaranteed side-by-side on typical widths)
  const twoCol: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    alignItems: 'start',
  }

  // Clear search whenever we take an action (requested behavior)
  const act = useCallback(
    (id: string, st: Status, meta?: any) => {
      setQ('')
      onSet(id, st, meta)
    },
    [onSet]
  )

  // Open checkout modal for a student
  const openCheckout = useCallback((s: StudentRow) => {
    setCheckoutStudent(s)
    setPickupSelect(s.approved_pickups?.[0] ?? '')
    setPickupOther('')
    setPickupTime(currentTimeEST_HHMM())
    setCheckoutOpen(true)
  }, [])

  // Confirm checkout → choose pickup person + time (EST)
  const confirmCheckout = useCallback(() => {
    if (!checkoutStudent) return
    const pickupPerson = pickupOther?.trim() ? pickupOther.trim() : pickupSelect?.trim()
    if (!pickupPerson) {
      alert('Please select or enter the pickup person.')
      return
    }
    act(checkoutStudent.id, 'checked', {
      pickupPerson,
      time_est: pickupTime, // HH:MM EST
    })
    setCheckoutOpen(false)
    setCheckoutStudent(null)
  }, [checkoutStudent, pickupOther, pickupSelect, pickupTime, act])

  const sorted = useMemo(() => {
    const arr = [...students]
    arr.sort((a, b) => {
      const A = sortKey === 'first' ? a.first_name : a.last_name
      const B = sortKey === 'first' ? b.first_name : b.last_name
      return A.localeCompare(B, undefined, { sensitivity: 'base' })
    })
    return arr
  }, [students, sortKey])

  const matchesFilters = useCallback(
    (s: StudentRow) => {
      if (school !== 'All' && s.school !== school) return false
      if (q) {
        const hay = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!hay.includes(q.toLowerCase())) return false
      }
      return true
    },
    [school, q]
  )

  // Buckets by current status
  const pickedFromBus = useMemo(
    () => sorted.filter((s) => roster[s.id] === 'picked' && matchesFilters(s)),
    [sorted, roster, matchesFilters]
  )

  const directCheckIn = useMemo(
    () =>
      sorted.filter((s) => {
        const st = roster[s.id]
        // Direct check-in shows students not on bus & not skipped & not arrived/checked
        return (!st || st === 'not_picked') && matchesFilters(s)
      }),
    [sorted, roster, matchesFilters]
  )

  const arrived = useMemo(
    () => sorted.filter((s) => roster[s.id] === 'arrived' && matchesFilters(s)),
    [sorted, roster, matchesFilters]
  )

  const checkedOut = useMemo(
    () => sorted.filter((s) => roster[s.id] === 'checked' && matchesFilters(s)),
    [sorted, roster, matchesFilters]
  )

  // Build subtitle with current status + time
  const subtitleFor = (s: StudentRow) => {
    const st = roster[s.id]
    const base = `School: ${s.school} | ${
      st === 'checked' ? 'Checked Out' :
      st === 'arrived' ? 'Arrived' :
      st === 'picked' ? 'Picked' :
      st === 'skipped' ? 'Skipped' : 'Not Picked'
    }`
    if (st === 'picked' || st === 'arrived' || st === 'checked') {
      const t = fmtEST(rosterTimes[s.id])
      return t ? `${base} : ${t}` : base
    }
    return base
  }

  return (
    <div className="panel">
      {/* Page filters */}
      <div className="row gap wrap" style={{ marginBottom: 12 }}>
        {/* School pills (single select, like Skip page) */}
        <div className="seg">
          <button className={'seg-btn' + (school === 'All' ? ' on' : '')} onClick={() => setSchool('All')}>All</button>
          {SCHOOLS.map((sch) => (
            <button key={sch} className={'seg-btn' + (school === sch ? ' on' : '')} onClick={() => setSchool(sch)}>{sch}</button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search student…"
          style={{ flex: 1, minWidth: 220 }}
        />
        <div className="row gap" style={{ alignItems: 'center' }}>
          <span className="muted">Sort</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="first">First Name</option>
            <option value="last">Last Name</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={'seg-btn' + (tab === 'in' ? ' on' : '')} onClick={() => setTab('in')}>Check-in</button>
        <button className={'seg-btn' + (tab === 'out' ? ' on' : '')} onClick={() => setTab('out')}>Checkout</button>
      </div>

      {tab === 'in' ? (
        <div style={twoCol}>
          {/* Left: Center Check-in (from Bus) */}
          <div className="card">
            <h3>Center Check-in (from Bus)</h3>
            {pickedFromBus.length === 0 ? (
              <div className="muted">No students to check in from bus.</div>
            ) : (
              pickedFromBus.map((s) => (
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={
                    <>
                      <button className="btn primary" onClick={() => act(s.id, 'arrived')}>Mark Arrived</button>
                      {/* Undo here: sends picked -> not_picked */}
                      <button className="btn" onClick={() => act(s.id, 'not_picked')}>Undo</button>
                    </>
                  }
                />
              ))
            )}
          </div>

          {/* Right: Direct Check-in (No Bus) */}
          <div className="card">
            <h3>Direct Check-in (No Bus)</h3>
            {directCheckIn.length === 0 ? (
              <div className="muted">No students for direct check-in.</div>
            ) : (
              directCheckIn.map((s) => (
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={<button className="btn primary" onClick={() => act(s.id, 'arrived')}>Mark Arrived</button>}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={twoCol}>
          {/* Left: Checkout (arrived) */}
          <div className="card">
            <h3>Checkout</h3>
            {arrived.length === 0 ? (
              <div className="muted">No students ready to check out.</div>
            ) : (
              arrived.map((s) => (
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={
                    <>
                      <button className="btn primary" onClick={() => openCheckout(s)}>Checkout</button>
                      {/* Single Undo: Arrived -> (picked | not_picked) based on log heuristic */}
                      <button
                        className="btn"
                        onClick={() => act(s.id, inferPrevStatus(s))}
                        title="Send back to previous queue"
                      >
                        Undo
                      </button>
                    </>
                  }
                />
              ))
            )}
          </div>

          {/* Right: Checked Out */}
          <div className="card">
            <h3>Checked Out</h3>
            {checkedOut.length === 0 ? (
              <div className="muted">No checked-out students.</div>
            ) : (
              checkedOut.map((s) => (
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={
                    // Undo on Checked Out panel → move back to Arrived
                    <button className="btn" onClick={() => act(s.id, 'arrived')}>
                      Undo
                    </button>
                  }
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Approved Pickup Modal */}
      <Modal
        open={checkoutOpen}
        title={checkoutStudent ? `Checkout — ${nameOf(checkoutStudent)}` : 'Checkout'}
        onClose={() => { setCheckoutOpen(false); setCheckoutStudent(null) }}
      >
        {checkoutStudent && (
          <div className="col gap">
            <div className="row gap wrap">
              <div style={{ minWidth: 240, flex: 1 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Approved Pickup</div>
                <select
                  value={pickupSelect}
                  onChange={(e) => setPickupSelect(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">— Select —</option>
                  {(checkoutStudent.approved_pickups ?? []).map((p, idx) => (
                    <option key={idx} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 240, flex: 1 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Admin Override (type name)</div>
                <input
                  value={pickupOther}
                  onChange={(e) => setPickupOther(e.target.value)}
                  placeholder="Override name (optional)"
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Pickup Time (EST)</div>
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                />
              </div>
            </div>

            <div className="row gap" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setCheckoutOpen(false); setCheckoutStudent(null) }}>Cancel</button>
              <button className="btn primary" onClick={confirmCheckout}>Save & Checkout</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
