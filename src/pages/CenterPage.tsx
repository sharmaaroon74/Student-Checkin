import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'
import TopToolbar from '../components/TopToolbar'

// Bus-eligible gates for TO PICK total (exclude B/H)
const ALLOWED_SCHOOLS = ['Bain', 'QG', 'MHE', 'MC']
const BUS_ELIGIBLE_YEARS = [
  'FT - A',
  'FT - B/A',
  'PT3 - A - TWR',
  'PT3 - A - MWF',
  'PT2 - A - WR',
  'PT3 - A - TWF',
]


type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes: Record<string, string>
  onSet: (id: string, st: Status, meta?: any) => Promise<void> | void
}

type Tab = 'in' | 'out'

/** format an ISO string to h:mm AM/PM in EST (no seconds) */
function fmtEST(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit'
  }).format(d)
}

/** now (EST) in yyyy-MM-ddThh:mm format, suitable for datetime-local */
function nowLocalESTForInput() {
  const d = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export default function CenterPage({ students, roster, rosterTimes, onSet }: Props) {
  const [tab, setTab] = useState<Tab>('out')
  const [schoolSel, setSchoolSel] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  // Display name according to current sort toggle
  const nameFor = (s: StudentRow) =>
    sortBy === 'first' ? `${s.first_name} ${s.last_name}` : `${s.last_name}, ${s.first_name}`
  // --- Checkout modal state ---
  const [modalOpen, setModalOpen] = useState(false)
  const [modalStudent, setModalStudent] = useState<StudentRow | null>(null)
  const [modalPickup, setModalPickup] = useState<string | null>(null)
  const [modalOverride, setModalOverride] = useState('')
  const [modalTime, setModalTime] = useState(nowLocalESTForInput())

  const clearSearch = () => setQ('')

  // Base filtered list by school/search/sort
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

  // Buckets (use existing status logic from roster)
  const picked   = filtered.filter(s => (roster[s.id] ?? 'not_picked') === 'picked')
  const arrived  = filtered.filter(s => roster[s.id] === 'arrived')
  const checked  = filtered.filter(s => roster[s.id] === 'checked')
  const skipped  = filtered.filter(s => roster[s.id] === 'skipped')
  const toPick   = filtered.filter(s => (roster[s.id] ?? 'not_picked') === 'not_picked' && !skipped.includes(s))

  // Show in the two columns on the Check-in tab:
  //   Left  = from Bus (picked)
  //   Right = Direct Check-in (not picked AND not skipped)
  const checkinFromBus = picked
  const directCheckin  = toPick

  // Global counts (respect current school / search exactly like Skip/Bus)
  const counts = useMemo(() => {
    // For TO PICK total, count only bus-eligible students currently not picked.
    const notPickedCount = filtered.filter(s => {
      const st = (roster[s.id] ?? 'not_picked') as Status
      if (st !== 'not_picked') return false
      const yr = (s.school_year ?? '').trim()
      return s.active && ALLOWED_SCHOOLS.includes(s.school) && BUS_ELIGIBLE_YEARS.includes(yr)
    }).length
    return {
      not_picked: notPickedCount,
      picked: picked.length,
      arrived: arrived.length,
      checked: checked.length,
      skipped: skipped.length,
    }
  }, [filtered, roster, picked.length, arrived.length, checked.length, skipped.length])

  // --- Modal handlers ---
  function openCheckoutModal(s: StudentRow) {
    setModalStudent(s)
    setModalPickup(null)
    setModalOverride('')
    setModalTime(nowLocalESTForInput())
    setModalOpen(true)
  }
  function closeModal() { setModalOpen(false); setModalStudent(null) }

  async function doCheckout() {
    if (!modalStudent) return
    const meta: any = {}
    if (modalPickup)   meta.pickupPerson = modalPickup
    if (modalOverride) meta.override = modalOverride
    if (modalTime)     meta.pickupTime = modalTime   // store raw; backend/timezone convert if desired

    await onSet(modalStudent.id, 'checked', meta)
    setModalOpen(false)
    setModalStudent(null)
    clearSearch()
  }

  // helper to show "School: X | Status [time]"
  const statusLine = (s: StudentRow) => {
    const st = (roster[s.id] ?? 'not_picked') as Status
    const label =
      st === 'not_picked' ? 'Not Picked'
      : st === 'picked'   ? 'Picked'
      : st === 'arrived'  ? 'Arrived'
      : st === 'checked'  ? 'Checked-out'
      : 'Skipped'
    const t = rosterTimes[s.id] ? ` : ${fmtEST(rosterTimes[s.id])}` : ''
    return `School: ${s.school} | ${label}${(st==='picked'||st==='arrived'||st==='checked') ? t : ''}`
  }

  return (
    <div className="page container">
      {/* shared toolbar (school filters + search + sort + counts) */}
      <TopToolbar
        schoolSel={schoolSel} onSchoolSel={setSchoolSel}
        search={q} onSearch={setQ}
        sortBy={sortBy} onSortBy={setSortBy}
        counts={{
          not_picked: counts.not_picked,
          picked: counts.picked,
          arrived: counts.arrived,
          checked: counts.checked,
          skipped: counts.skipped
        }}
      />

      {/* tab pills */}
      <div className="row gap toolbar-bg" style={{ marginTop: 8 }}>
        <button className={`btn ${tab==='out'?'primary':''}`} onClick={()=>setTab('out')}>Checkout</button>
        <button className={`btn ${tab==='in'?'primary':''}`} onClick={()=>setTab('in')}>Check-in</button>
      </div>

      {tab === 'in' && (
        <div className="two-col" style={{ marginTop: 12 }}>
          {/* Left: from Bus  */}
          {false && (<div className="card">
            <h3 className="section-title">Center Check-in (from Bus)</h3>
            <div className="list">
              {checkinFromBus.length === 0 && <div className="muted">No students to check in from bus.</div>}
              {checkinFromBus.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{nameFor(s)}</div>
                    <div className="sub">{statusLine(s)}</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => { onSet(s.id, 'arrived'); clearSearch() }}>
                      Mark Arrived
                    </button>
                    <button className="btn" onClick={() => { onSet(s.id, 'not_picked'); clearSearch() }}>
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
)}
          {/* Right: Direct Check-in (No Bus) */}
          <div className="card">
            <h3 className="section-title">Direct Check-in (No Bus)</h3>
            <div className="list">
              {directCheckin.length === 0 && <div className="muted">No students for direct check-in.</div>}
              {directCheckin.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{nameFor(s)}</div>
                    <div className="sub">{statusLine(s)}</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => { onSet(s.id, 'arrived'); clearSearch() }}>
                      Mark Arrived
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'out' && (
        <div className="two-col" style={{ marginTop: 12 }}>
          {/* Left: Checkout (Arrived) */}
          <div className="card">
            <h3 className="section-title">Checkout</h3>
            <div className="list">
              {arrived.length === 0 && <div className="muted">No students to check out.</div>}
              {arrived.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{nameFor(s)}</div>
                    <div className="sub">{statusLine(s)}</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => { openCheckoutModal(s) }}>
                      Checkout
                    </button>
                    <button className="btn" onClick={() => { onSet(s.id, 'not_picked'); clearSearch() }}>
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Checked Out */}
          <div className="card">
            <h3 className="section-title">Checked Out</h3>
            <div className="list">
              {checked.length === 0 && <div className="muted">No students checked out.</div>}
              {checked.map(s => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">{nameFor(s)}</div>
                    <div className="sub">{statusLine(s)}</div>
                  </div>
                  <div className="sd-card-actions">
                    <button className="btn" onClick={() => { onSet(s.id, 'arrived'); clearSearch() }}>
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Verify Pickup Modal ---- */}
      {modalOpen && modalStudent && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Verify Pickup">
          <div className="modal-card">
            <div className="modal-head">
              <div className="heading">
                Checkout — {sortBy === 'first' ? `${modalStudent.first_name} ${modalStudent.last_name}` : `${modalStudent.last_name}, ${modalStudent.first_name}`}
              </div>
              <button className="btn" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-body" style={{ gap: 12 }}>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Approved Pickup</div>
                <div className="row wrap" style={{ gap: 8 }}>
                  {(modalStudent.approved_pickups ?? []).map((name) => (
                    <button
                      key={name}
                      className={`chip ${modalPickup === name ? 'chip-on' : ''}`}
                      onClick={() => setModalPickup(name)}
                      type="button"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="row gap">
                <div className="grow">
                  <div className="label" style={{ marginBottom: 6 }}>Admin Override (type name)</div>
                  <input
                    placeholder="Override name (optional)"
                    value={modalOverride}
                    onChange={e => setModalOverride(e.target.value)}
                  />
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Pickup Time (EST)</div>
                  <input
                    type="datetime-local"
                    value={modalTime}
                    onChange={e => setModalTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="modal-foot">
              <button className="btn" onClick={closeModal}>Cancel</button>
              <button className="btn primary" onClick={doCheckout}>Checkout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
