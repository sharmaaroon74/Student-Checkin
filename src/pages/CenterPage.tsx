import React, { useMemo, useState, useCallback } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes: Record<string, string>
  onSet: (id: string, st: Status, meta?: any) => void
  inferPrevStatus: (s: StudentRow) => 'picked' | 'not_picked'
  // optional: ignored; page now computes filtered counts locally
  globalCounts?: { not_picked: number; picked: number; arrived: number; checked: number; skipped: number }
}

type CenterTab = 'in' | 'out'
type SortKey = 'first' | 'last'
const SCHOOLS = ['Bain', 'QG', 'MHE', 'MC'] as const

function fmtEST(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}
function currentTimeEST_HHMM() {
  const nowEST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hh = String(nowEST.getHours()).padStart(2, '0')
  const mm = String(nowEST.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
function nameOf(s: StudentRow) { return `${s.first_name} ${s.last_name}` }

function StudentRowCard({ s, subtitle, actions }:{
  s: StudentRow; subtitle: React.ReactNode; actions?: React.ReactNode
}) {
  return (
    <div className="card row" style={{ alignItems:'center' }}>
      <div style={{ minWidth: 0 }}>
        <div className="title">{nameOf(s)}</div>
        <div className="muted">{subtitle}</div>
      </div>
      <div className="row gap" style={{ marginLeft:'auto' }}>{actions}</div>
    </div>
  )
}

/** Centered modal */
function Modal({ open, title, onClose, children }:{
  open: boolean; title: string; onClose: ()=>void; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="sd-overlay">
      <div className="sd-modal">
        <button className="sd-close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="sd-title">{title}</h3>
        <div className="sd-body">{children}</div>
      </div>
      <style>{`
        .sd-overlay{ position:fixed; inset:0; background:rgba(0,0,0,0.45);
          display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px; }
        .sd-modal{ position:relative; width:min(600px, 92vw); background:#fff; border-radius:16px; padding:20px 20px 16px;
          box-shadow:0 18px 50px rgba(0,0,0,0.25); }
        .sd-close{ position:absolute; top:10px; right:10px; border:1px solid #E5E7EB; background:#fff; border-radius:10px; padding:4px 8px; cursor:pointer; }
        .sd-title{ margin:0 28px 12px 0; font-size:18px; font-weight:600; }
        .sd-body{ display:block }
        .pill-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(180px,1fr)); gap:10px; }
        .pill{ border:1px solid #d1d5db; padding:10px 12px; border-radius:999px; background:#fff; cursor:pointer; text-align:left; }
        .pill.on{ background:#0b1220; color:#fff; border-color:#0b1220; }
      `}</style>
    </div>
  )
}

export default function CenterPage({
  students, roster, rosterTimes, onSet, inferPrevStatus
}: Props) {
  const [tab, setTab] = useState<CenterTab>('in')
  const [school, setSchool] = useState<string>('All')
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('first')

  // checkout modal state
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutStudent, setCheckoutStudent] = useState<StudentRow | null>(null)
  const [pickupSelect, setPickupSelect] = useState<string>('') // no default selection
  const [pickupOther, setPickupOther] = useState<string>('')   // admin override
  const [pickupTime, setPickupTime] = useState<string>(currentTimeEST_HHMM())

  const twoCol: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }

  const act = useCallback((id: string, st: Status, meta?: any) => {
    setQ('')
    onSet(id, st, meta)
  }, [onSet])

  const openCheckout = useCallback((s: StudentRow) => {
    setCheckoutStudent(s)
    setPickupSelect('')
    setPickupOther('')
    setPickupTime(currentTimeEST_HHMM())
    setCheckoutOpen(true)
  }, [])

  const confirmCheckout = useCallback(() => {
    if (!checkoutStudent) return
    const pickupPerson = (pickupOther?.trim() || pickupSelect?.trim())
    if (!pickupPerson) { alert('Please tap a pickup name or type an override.'); return }
    act(checkoutStudent.id, 'checked', { pickupPerson, time_est: pickupTime })
    setCheckoutOpen(false)
    setCheckoutStudent(null)
  }, [checkoutStudent, pickupOther, pickupSelect, pickupTime, act])

  const sorted = useMemo(() => {
    const arr = students.filter(s => s.active)
    arr.sort((a, b) => {
      const A = sortKey === 'first' ? a.first_name : a.last_name
      const B = sortKey === 'first' ? b.first_name : b.last_name
      return A.localeCompare(B, undefined, { sensitivity:'base' })
    })
    return arr
  }, [students, sortKey])

  const matches = useCallback((s: StudentRow) => {
    if (school!=='All' && s.school!==school) return false
    if (q) {
      const hay = `${s.first_name} ${s.last_name}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }, [school, q])

  // Filtered universe
  const filtered = useMemo(() => sorted.filter(matches), [sorted, matches])

  // Filtered-counts (respect filters)
  const counts = useMemo(() => {
    let not_picked = 0, picked = 0, arrived = 0, checked = 0, skipped = 0
    for (const s of filtered) {
      const st = roster[s.id] ?? 'not_picked'
      if (st === 'picked') picked++
      else if (st === 'arrived') arrived++
      else if (st === 'checked') checked++
      else if (st === 'skipped') skipped++
      else not_picked++
    }
    return { not_picked, picked, arrived, checked, skipped }
  }, [filtered, roster])

  // Panels from filtered
  const pickedFromBus = useMemo(
    () => filtered.filter(s => roster[s.id]==='picked'),
    [filtered, roster]
  )
  const directCheckIn = useMemo(
    () => filtered.filter(s => {
      const st = roster[s.id]
      return !st || st==='not_picked'
    }),
    [filtered, roster]
  )
  const arrived = useMemo(
    () => filtered.filter(s => roster[s.id]==='arrived'),
    [filtered, roster]
  )
  const checkedOut = useMemo(
    () => filtered.filter(s => roster[s.id]==='checked'),
    [filtered, roster]
  )

  const subtitleFor = (s: StudentRow) => {
    const st = roster[s.id]
    const base = `School: ${s.school} | ${
      st==='checked'?'Checked Out': st==='arrived'?'Arrived': st==='picked'?'Picked': st==='skipped'?'Skipped':'Not Picked'
    }`
    if (st==='picked' || st==='arrived' || st==='checked') {
      const t = fmtEST(rosterTimes[s.id])
      return t ? `${base} : ${t}` : base
    }
    return base
  }

  return (
    <div className="panel">
      {/* Filters */}
      <div className="row gap wrap" style={{ marginBottom: 8 }}>
        <div className="seg">
          <button className={'seg-btn' + (school==='All'?' on':'')} onClick={()=>setSchool('All')}>All</button>
          {SCHOOLS.map(sch=>(
            <button key={sch} className={'seg-btn' + (school===sch?' on':'')} onClick={()=>setSchool(sch)}>{sch}</button>
          ))}
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student…" style={{ flex:1, minWidth:220 }}/>
        <div className="row gap" style={{ alignItems:'center' }}>
          <span className="muted">Sort</span>
          <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}>
            <option value="first">First Name</option>
            <option value="last">Last Name</option>
          </select>
        </div>
      </div>

      {/* Filtered counts (under filters) */}
      <div className="row gap" style={{ marginBottom: 12 }}>
        <span className="chip">To Pick <b>{counts.not_picked}</b></span>
        <span className="chip">Picked <b>{counts.picked}</b></span>
        <span className="chip">Arrived <b>{counts.arrived}</b></span>
        <span className="chip">Checked Out <b>{counts.checked}</b></span>
        <span className="chip">Skipped <b>{counts.skipped}</b></span>
      </div>

      {/* Tabs */}
      <div className="seg" style={{ marginBottom: 10 }}>
        <button className={'seg-btn' + (tab==='in'?' on':'')} onClick={()=>setTab('in')}>Check-in</button>
        <button className={'seg-btn' + (tab==='out'?' on':'')} onClick={()=>setTab('out')}>Checkout</button>
      </div>

      {tab==='in' ? (
        <div style={twoCol}>
          {/* Center Check-in (from Bus) */}
          <div className="card">
            <h3>Center Check-in (from Bus)</h3>
            {pickedFromBus.length===0 ? <div className="muted">No students to check in from bus.</div> : (
              pickedFromBus.map(s=>(
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={
                    <>
                      <button className="btn primary" onClick={()=>act(s.id,'arrived')}>Mark Arrived</button>
                      <button className="btn" onClick={()=>act(s.id, 'not_picked')}>Undo</button>
                    </>
                  }
                />
              ))
            )}
          </div>

          {/* Direct Check-in (No Bus) */}
          <div className="card">
            <h3>Direct Check-in (No Bus)</h3>
            {directCheckIn.length===0 ? <div className="muted">No students for direct check-in.</div> : (
              directCheckIn.map(s=>(
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={<button className="btn primary" onClick={()=>act(s.id,'arrived')}>Mark Arrived</button>}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={twoCol}>
          {/* Checkout */}
          <div className="card">
            <h3>Checkout</h3>
            {arrived.length===0 ? <div className="muted">No students ready to check out.</div> : (
              arrived.map(s=>(
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={
                    <>
                      <button className="btn primary" onClick={()=>openCheckout(s)}>Checkout</button>
                      <button className="btn" onClick={()=>act(s.id, inferPrevStatus(s))}>Undo</button>
                    </>
                  }
                />
              ))
            )}
          </div>

          {/* Checked Out */}
          <div className="card">
            <h3>Checked Out</h3>
            {checkedOut.length===0 ? <div className="muted">No checked-out students.</div> : (
              checkedOut.map(s=>(
                <StudentRowCard
                  key={s.id}
                  s={s}
                  subtitle={subtitleFor(s)}
                  actions={<button className="btn" onClick={()=>act(s.id,'arrived')}>Undo</button>}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      <Modal
        open={checkoutOpen}
        title={checkoutStudent ? `Checkout — ${nameOf(checkoutStudent)}` : 'Checkout'}
        onClose={()=>{ setCheckoutOpen(false); setCheckoutStudent(null) }}
      >
        {checkoutStudent && (
          <div className="col gap">
            <div className="muted" style={{ marginBottom: 6 }}>Approved Pickup</div>
            <div className="pill-grid" style={{ marginBottom: 10 }}>
              {(checkoutStudent.approved_pickups ?? []).map((p, idx) => {
                const active = pickupSelect === p
                return (
                  <button
                    key={idx}
                    className={'pill' + (active ? ' on' : '')}
                    onClick={() => setPickupSelect(active ? '' : p)}
                    type="button"
                  >
                    {p}
                  </button>
                )
              })}
            </div>

            <div className="row gap wrap" style={{ marginTop: 4 }}>
              <div style={{ minWidth: 260, flex: 1 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Admin Override (type name)</div>
                <input value={pickupOther} onChange={(e) => setPickupOther(e.target.value)} placeholder="Override name (optional)" />
              </div>
              <div style={{ minWidth: 180 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Pickup Time (EST)</div>
                <input type="time" value={pickupTime} onChange={(e)=>setPickupTime(e.target.value)} />
              </div>
            </div>

            <div className="row gap" style={{ justifyContent:'flex-end', marginTop: 14 }}>
              <button className="btn" onClick={()=>{ setCheckoutOpen(false); setCheckoutStudent(null) }}>Cancel</button>
              <button className="btn primary" onClick={confirmCheckout}>Checkout</button>
            </div>
          </div>
        )}
      </Modal>

      {/* chip styles */}
      <style>{`
        .chip {
          display:inline-flex; align-items:center; gap:6px;
          padding:2px 8px; border:1px solid #e5e7eb; border-radius:999px;
          font-size:12px; background:#fff;
        }
        .chip b { font-weight:600 }
      `}</style>
    </div>
  )
}
