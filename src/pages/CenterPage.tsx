// src/pages/CenterPage.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { StudentRow, Status } from '../types'
import { todayKeyEST } from '../lib/date'

type AllowedSchool = 'Bain' | 'QG' | 'MHE' | 'MC'

type StudentVM = {
  id: string
  first: string
  last: string
  name: string
  school: string
  status: Status
  active: boolean
  approved: string[]
  school_year?: string | null
}

const fmtEST = (iso?: string) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' EST'
  } catch { return '' }
}

const ALLOWED_SCHOOLS: AllowedSchool[] = ['Bain', 'QG', 'MHE', 'MC']
const DIRECT_ALLOWED_PROGRAMS: string[] = [
  'B','H','FT - A','FT - B/A','PT3 - A - TWR','PT3 - A - MWF','PT2 - A - WR','PT3 - A - TWF'
]

function Row({
  s, primaryLabel, onPrimary, onUndo, lastUpdateIso, forceShowTime, labelOverride
}:{
  s: StudentVM,
  primaryLabel: string,
  onPrimary: (id:string)=>void,
  onUndo: (id:string)=>void,
  lastUpdateIso?: string,
  forceShowTime?: boolean,
  labelOverride?: string
}){
  const defaultHide = s.status === 'picked' || s.status === 'skipped' || s.status === 'not_picked'
  const showTime = forceShowTime ? true : !defaultHide
  const time = showTime ? fmtEST(lastUpdateIso) : ''
  const label = labelOverride ?? s.status
  return (
    <div className="item">
      <div>
        <div className="heading">{s.name}</div>
        <div className="muted" style={{fontSize:13}}>
          {s.school} • Status: <b>{label}</b>{time ? ` — ${time}` : ''}
        </div>
      </div>
      <div className="row">
        <button className="btn small" onClick={()=>onUndo(s.id)}>Undo</button>
        <button className="btn small" onClick={()=>onPrimary(s.id)}>{primaryLabel}</button>
      </div>
    </div>
  )
}

function Modal({ open, title, onClose, children }:{
  open:boolean, title:string, onClose:()=>void, children:React.ReactNode
}){
  if (!open) return null
  return (
    <div className="fixed" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50}}>
      <div className="card" style={{width:'min(720px, 96vw)'}}>
        <div className="row spread" style={{marginBottom:8}}>
          <div className="heading">{title}</div>
          <button className="btn small" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function CenterPage({
  students, roster, onSet
}:{
  students: StudentRow[],
  roster: Record<string, Status>,
  onSet:(id:string, st: Status, meta?: Record<string, any>)=>Promise<void>|void
}){
  const [tab, setTab] = useState<'in'|'out'>('in')
  const [schools, setSchools] = useState<Array<AllowedSchool | 'All'>>(['All'])
  const [lastUpdateMap, setLastUpdateMap] = useState<Record<string, string>>({})
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  const [q, setQ] = useState('')

  // Verify Pickup modal
  const [showVerify, setShowVerify] = useState(false)
  const [verifyStudent, setVerifyStudent] = useState<StudentVM | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [overrideName, setOverrideName] = useState<string>('')
  const [pickupTime, setPickupTime] = useState<string>('')

  const toggleSchool = (sc: AllowedSchool) => {
    setSchools(prev => {
      if (prev[0] === 'All') return [sc]
      if (prev.includes(sc)) {
        const next = prev.filter(x => x !== sc) as AllowedSchool[]
        return next.length ? next : ['All']
      }
      return [...(prev as AllowedSchool[]), sc]
    })
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('roster_status')
        .select('student_id,last_update')
        .eq('roster_date', todayKeyEST())
      const m: Record<string, string> = {}
      ;(data || []).forEach((r: any) => { m[r.student_id] = r.last_update })
      setLastUpdateMap(m)
    })()
  }, [roster])

  const vm = useMemo<StudentVM[]>(()=> students.map(s=>({
    id: s.id,
    first: s.first_name,
    last:  s.last_name,
    name: s.first_name + ' ' + s.last_name,
    school: (s.school as any) ?? '',
    status: roster[s.id] ?? 'not_picked',
    active: s.active,
    approved: s.approved_pickups || [],
    school_year: (s as any).school_year ?? null
  })), [students, roster])

  const sortFn = (a: StudentVM, b: StudentVM) =>
    sortBy === 'first'
      ? a.first.localeCompare(b.first) || a.last.localeCompare(b.last)
      : a.last.localeCompare(b.last) || a.first.localeCompare(b.first)

  const qlc = q.trim().toLowerCase()
  const matchesSearch = (s: StudentVM) => !qlc || s.first.toLowerCase().includes(qlc) || s.last.toLowerCase().includes(qlc)

  const bySchool = vm.filter(s => {
    if (schools[0] === 'All') return matchesSearch(s)
    return (schools as AllowedSchool[]).includes(s.school as AllowedSchool) && matchesSearch(s)
  })

  const centerCheckin = bySchool.filter(s => s.status === 'picked').sort(sortFn)

  const directCheckin = bySchool.filter(s =>
    s.status === 'not_picked'
    && s.active === true
    && ALLOWED_SCHOOLS.includes(s.school as AllowedSchool)
    && (s.school_year ? DIRECT_ALLOWED_PROGRAMS.includes(s.school_year) : false)
  ).sort(sortFn)

  const checkoutList = bySchool.filter(s => s.status === 'arrived').sort(sortFn)
  const checkedOut   = bySchool.filter(s => s.status === 'checked').sort(sortFn)

  async function markArrived(studentId: string) {
    const prev = (roster[studentId] ?? 'not_picked') as Status
    await onSet(studentId, 'arrived', { arrived_via: prev })
  }

  async function undoArrived(studentId: string) {
    // default back to 'picked' (if they arrived from bus) else 'not_picked'
    const lastPrev = roster[studentId] // current is 'arrived', but we stored prev in meta; if you want perfect fidelity, query logs here.
    const fallbackPrev: Status = 'picked'
    await onSet(studentId, fallbackPrev, { undo_of: 'arrived' })
  }

  function openVerifyModal(s: StudentVM){
    const hhmm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    setVerifyStudent(s); setSelectedName(null); setOverrideName(''); setPickupTime(hhmm); setShowVerify(true)
  }

  async function confirmCheckout(){
    if (!verifyStudent) return
    const chosen = (selectedName && selectedName.trim()) || (overrideName && overrideName.trim())
    if (!chosen) { alert('Please select an approved pickup OR enter an admin override name.'); return }
    await onSet(verifyStudent.id, 'checked', { pickup_person: chosen, pickup_time_edit: pickupTime })
    setShowVerify(false); setVerifyStudent(null)
  }

  async function undoCheckout(studentId: string) {
    await onSet(studentId, 'arrived', { undo_of: 'checked' })
  }

  return (
    <div className="card">
      <div className="row spread">
        <div className="tabs">
          <button className={'tab ' + (tab==='in'?'active':'')} onClick={()=>setTab('in')}>Center Check-in / Direct Check-in</button>
          <button className={'tab ' + (tab==='out'?'active':'')} onClick={()=>setTab('out')}>Checkout / Checked Out</button>
        </div>
        <div className="row">
          {(['All','Bain','QG','MHE','MC'] as const).map(sc=>{
            const active =
              (schools[0]==='All' && sc==='All') ||
              (schools[0]!=='All' && (schools as (AllowedSchool|'All')[]).includes(sc))
            return (
              <button
                key={sc}
                className={'chip ' + (active?'active':'')}
                onClick={()=>{
                  if (sc === 'All') setSchools(['All'])
                  else toggleSchool(sc)
                }}
              >
                {sc}
              </button>
            )
          })}
          <div className="row" style={{ marginLeft: 8 }}>
            <span className="muted" style={{ marginRight: 6 }}>Sort</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}>
              <option value="first">First name</option>
              <option value="last">Last name</option>
            </select>
          </div>
          <input placeholder="Search name…" value={q} onChange={e=>setQ(e.target.value)} style={{ marginLeft: 8, minWidth: 180 }} />
        </div>
      </div>

      {tab==='in' && (
        <div className="grid cols-2" style={{marginTop:12}}>
          <div>
            <h3 className="heading">Center Check-in (from Bus)</h3>
            <div className="list" style={{marginTop:8}}>
              {centerCheckin.map(s=> (
                <Row key={s.id} s={s}
                  primaryLabel="Mark Arrived"
                  onPrimary={(id)=> markArrived(id)}
                  onUndo={(id)=> onSet(id, 'not_picked', { undo_from: 'picked' })}
                  lastUpdateIso={lastUpdateMap[s.id]}
                  forceShowTime={true}
                />
              ))}
              {!centerCheckin.length && <div className="muted">No students (waiting for Picked on Bus)</div>}
            </div>
          </div>

          <div>
            <h3 className="heading">Direct Check-in (No Bus)</h3>
            <div className="list" style={{marginTop:8}}>
              {directCheckin.map(s=> (
                <Row key={s.id} s={s}
                  primaryLabel="Mark Arrived"
                  onPrimary={(id)=> markArrived(id)}
                  onUndo={(id)=> onSet(id, 'not_picked')}
                  lastUpdateIso={lastUpdateMap[s.id]}
                />
              ))}
              {!directCheckin.length && <div className="muted">No students</div>}
            </div>
          </div>
        </div>
      )}

      {tab==='out' && (
        <div className="grid cols-2" style={{marginTop:12}}>
          <div>
            <h3 className="heading">Checkout</h3>
            <div className="list" style={{marginTop:8}}>
              {checkoutList.map(s=> (
                <Row key={s.id} s={s}
                  primaryLabel="Checkout"
                  onPrimary={()=> openVerifyModal(s)}
                  onUndo={(id)=> onSet(id, 'picked', { undo_of: 'arrived' })}
                  lastUpdateIso={lastUpdateMap[s.id]}
                />
              ))}
              {!checkoutList.length && <div className="muted">No students ready to check out</div>}
            </div>
          </div>
          <div>
            <h3 className="heading">Checked Out</h3>
            <div className="list" style={{marginTop:8}}>
              {checkedOut.map(s=> (
                <Row key={s.id} s={s}
                  primaryLabel="Undo to Arrived"
                  onPrimary={(id)=> undoCheckout(id)}
                  onUndo={(id)=> undoCheckout(id)}
                  lastUpdateIso={lastUpdateMap[s.id]}
                  labelOverride="checked-out"
                />
              ))}
              {!checkedOut.length && <div className="muted">None</div>}
            </div>
          </div>
        </div>
      )}

      <Modal open={showVerify} title="Verify Pickup" onClose={()=> setShowVerify(false)}>
        {verifyStudent && (
          <div style={{display:'grid', gap:12}}>
            <div className="card" style={{padding:12}}>
              <div className="heading">{verifyStudent.name}</div>
              <div className="muted" style={{fontSize:13, marginTop:4}}>
                {verifyStudent.school}
              </div>
            </div>

            <div>
              <div className="muted" style={{marginBottom:6}}>Approved Pickup</div>
              <div className="grid" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))', gap:8}}>
                {verifyStudent.approved.length ? verifyStudent.approved.map(name=>(
                  <button
                    key={name}
                    className={'btn ' + (selectedName===name ? 'primary' : '')}
                    onClick={()=> { setSelectedName(selectedName===name ? null : name); setOverrideName('') }}
                    style={{justifyContent:'flex-start'}}
                  >
                    {selectedName===name ? '☑ ' : '☐ '}{name}
                  </button>
                )): <div className="muted">No approved pickups on file</div>}
              </div>
            </div>

            <div className="card" style={{padding:12}}>
              <div className="muted" style={{marginBottom:6}}>Admin Override</div>
              <div className="row">
                <input
                  placeholder="Type full name"
                  value={overrideName}
                  onChange={e=> { setOverrideName(e.target.value); if(e.target.value) setSelectedName(null) }}
                  style={{flex:1}}
                />
              </div>
            </div>

            <div className="card" style={{padding:12}}>
              <div className="muted" style={{marginBottom:6}}>Pickup Time</div>
              <input type="time" value={pickupTime} onChange={e=> setPickupTime(e.target.value)} />
            </div>

            <div className="row" style={{justifyContent:'flex-end'}}>
              <button className="btn" onClick={()=> setShowVerify(false)}>Cancel</button>
              <button className="btn primary" onClick={confirmCheckout}>Checkout</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
