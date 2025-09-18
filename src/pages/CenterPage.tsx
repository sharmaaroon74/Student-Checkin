import React, { useEffect, useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'
import { supabase } from '../lib/supabase'

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

const todayKey = () => new Date().toISOString().slice(0,10)
const fmtEST = (iso?: string) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' EST'
  } catch { return '' }
}
const ALLOWED_SCHOOLS: string[] = ['Bain', 'QG', 'MHE', 'MC']
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
  onSet:(id:string, st: Status)=>void
}){
  const [tab, setTab] = useState<'in'|'out'>('in')
  const [schools, setSchools] = useState<SchoolName[]|['All']>(['All'])
  const [lastUpdateMap, setLastUpdateMap] = useState<Record<string, string>>({})
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  const [q, setQ] = useState('')

  // Verify Pickup modal
  const [showVerify, setShowVerify] = useState(false)
  const [verifyStudent, setVerifyStudent] = useState<StudentVM | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [overrideName, setOverrideName] = useState<string>('')
  const [pickupTime, setPickupTime] = useState<string>('')

  const toggleSchool = (sc: SchoolName) => {
    setSchools(prev => {
      if (prev[0]==='All') return [sc]
      if (prev.includes(sc)) {
        const next = prev.filter(x=>x!==sc) as SchoolName[]
        return next.length? next : ['All']
      }
      return [...prev as SchoolName[], sc]
    })
  }

  // Load last_update timestamps
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('roster_status')
        .select('student_id,last_update')
        .eq('roster_date', todayKey())
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

  const bySchool = vm.filter(s =>
    ((schools[0]==='All') || (schools as SchoolName[]).includes(s.school as any)) && matchesSearch(s)
  )

  // Center Check-in (from Bus): ONLY 'picked'
  const centerCheckin = bySchool.filter(s => s.status === 'picked').sort(sortFn)

  // Direct Check-in (No Bus): active + allowed school + allowed program + not_picked
  const directCheckin = bySchool.filter(s =>
    s.status === 'not_picked'
    && s.active === true
    && ALLOWED_SCHOOLS.includes(s.school)
    && (s.school_year ? DIRECT_ALLOWED_PROGRAMS.includes(s.school_year) : false)
  ).sort(sortFn)

  // Checkout / Checked Out
  const checkoutList = bySchool.filter(s => s.status === 'arrived').sort(sortFn)
  const checkedOut   = bySchool.filter(s => s.status === 'checked').sort(sortFn)

  async function markArrived(studentId: string) {
    const prev = (roster[studentId] ?? 'not_picked') as Status
    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: studentId, p_roster_date: todayKey(),
      p_new_status: 'arrived', p_pickup_person: null,
      p_meta: { source: 'ui', prev_status: prev, arrived_via: prev }
    })
    if (error) { alert(error.message); return }
    onSet(studentId, 'arrived')
  }

  async function undoArrived(studentId: string) {
    const { data, error } = await supabase
      .from('logs').select('action,meta')
      .eq('roster_date', todayKey()).eq('student_id', studentId)
      .eq('action', 'arrived').order('at', { ascending: false }).limit(1)
    if (error) { alert(error.message); return }
    const prev = (data?.[0]?.meta?.prev_status as Status) || 'picked'
    const { error: e2 } = await supabase.rpc('api_set_status', {
      p_student_id: studentId, p_roster_date: todayKey(),
      p_new_status: prev, p_pickup_person: null,
      p_meta: { source: 'ui', undo_of: 'arrived' }
    })
    if (e2) { alert(e2.message); return }
    onSet(studentId, prev)
  }

  function openVerifyModal(s: StudentVM){
    const hhmm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    setVerifyStudent(s); setSelectedName(null); setOverrideName(''); setPickupTime(hhmm); setShowVerify(true)
  }

  async function confirmCheckout(){
    if (!verifyStudent) return
    const chosen = (selectedName && selectedName.trim()) || (overrideName && overrideName.trim())
    if (!chosen) { alert('Please select an approved pickup OR enter an admin override name.'); return }
    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: verifyStudent.id, p_roster_date: todayKey(),
      p_new_status: 'checked', p_pickup_person: chosen,
      p_meta: { source: 'ui', pickup_time_edit: pickupTime }
    })
    if (error) { alert(error.message); return }
    onSet(verifyStudent.id, 'checked'); setShowVerify(false); setVerifyStudent(null)
  }

  async function undoCheckout(studentId: string) {
    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: studentId, p_roster_date: todayKey(),
      p_new_status: 'arrived', p_pickup_person: null,
      p_meta: { source: 'ui', undo_of: 'checked' }
    })
    if (error) { alert(error.message); return }
    onSet(studentId, 'arrived')
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
            const active = (schools[0]==='All' && sc==='All') || (schools[0]!=='All' && (schools as SchoolName[]).includes(sc as any))
            return <button key={sc} className={'chip ' + (active?'active':'')} onClick={()=> sc==='All'? setSchools(['All']): toggleSchool(sc as any)}>{sc}</button>
          })}
          <div className="row" style={{ marginLeft: 8 }}>
            <span className="muted" style={{ marginRight: 6 }}>Sort</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}>
              <option value="first">First name</option>
              <option value="last">Last name</option>
            </select>
          </div>
          <input
            placeholder="Search name…"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{ marginLeft: 8, minWidth: 180 }}
          />
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
                  onUndo={(id)=> {
                    supabase.rpc('api_set_status', {
                      p_student_id: id, p_roster_date: todayKey(),
                      p_new_status: 'not_picked', p_pickup_person: null,
                      p_meta: { source: 'ui', undo_from: 'picked' }
                    }).then(({ error })=>{
                      if(error){ alert(error.message); return }
                      onSet(id, 'not_picked')
                    })
                  }}
                  lastUpdateIso={lastUpdateMap[s.id]}
                  forceShowTime={true}  // show time for picked here
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
                  onUndo={(id)=> undoArrived(id)}
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

      {/* Verify Pickup Modal */}
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
