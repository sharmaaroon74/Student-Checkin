import React, { useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'
import { supabase } from '../lib/supabase'

type StudentVM = {
  id: string
  name: string
  room: number | null
  school: 'Bain'|'QG'|'MHE'|'MC'
  status: Status
  approved: string[]   // from students.approved_pickups
}

const todayKey = () => new Date().toISOString().slice(0,10)
const nowHHMM = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

function Row({
  s, primaryLabel, onPrimary, onUndo
}:{
  s: StudentVM,
  primaryLabel: string,
  onPrimary: (id:string)=>void,
  onUndo: (id:string)=>void
}){
  return (
    <div className="item">
      <div>
        <div className="heading">{s.name}</div>
        <div className="muted" style={{fontSize:13}}>
          Room {s.room ?? '-'} • {s.school} • Status: <b>{s.status}</b>
        </div>
      </div>
      <div className="row">
        <button className="btn small" onClick={()=>onUndo(s.id)}>Undo</button>
        <button className="btn small" onClick={()=>onPrimary(s.id)}>{primaryLabel}</button>
      </div>
    </div>
  )
}

function Modal({
  open, title, onClose, children
}:{ open:boolean, title:string, onClose:()=>void, children:React.ReactNode }){
  if (!open) return null
  return (
    <div className="fixed" style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.4)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:50
    }}>
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

  // Checkout modal state
  const [showVerify, setShowVerify] = useState(false)
  const [verifyStudent, setVerifyStudent] = useState<StudentVM | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [overrideName, setOverrideName] = useState<string>('')
  const [pickupTime, setPickupTime] = useState<string>(nowHHMM())

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

  const vm = useMemo<StudentVM[]>(()=> students.map(s=>({
    id: s.id,
    name: s.first_name + ' ' + s.last_name,
    room: s.room_id, school: s.school,
    status: roster[s.id] ?? 'not_picked',
    approved: s.approved_pickups || []
  })), [students, roster])

  const bySchool = vm.filter(s => (schools[0]==='All') || (schools as SchoolName[]).includes(s.school))

  // Check-in tab filters
  const centerCheckin = bySchool.filter(s => s.status === 'picked')       // from Bus only
  const directCheckin = bySchool.filter(s => s.status === 'not_picked')   // not picked, not skipped

  // Checkout tab filters
  const checkoutList = bySchool.filter(s => s.status === 'arrived')       // only Arrived
  const checkedOut   = bySchool.filter(s => s.status === 'checked')

  async function markArrived(studentId: string) {
    const prev = (roster[studentId] ?? 'not_picked') as Status // 'picked' or 'not_picked'
    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_roster_date: todayKey(),
      p_new_status: 'arrived',
      p_pickup_person: null,
      p_meta: { source: 'ui', prev_status: prev, arrived_via: prev }
    })
    if (error) { alert(error.message); return }
    onSet(studentId, 'arrived')
  }

  async function undoArrived(studentId: string) {
    // Restore to the previous status recorded when marking Arrived
    const { data, error } = await supabase
      .from('logs')
      .select('action, meta')
      .eq('roster_date', todayKey())
      .eq('student_id', studentId)
      .eq('action', 'arrived')
      .order('at', { ascending: false })
      .limit(1)
    if (error) { alert(error.message); return }
    const prev = (data?.[0]?.meta?.prev_status as Status) || 'picked'
    const { error: e2 } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_roster_date: todayKey(),
      p_new_status: prev,
      p_pickup_person: null,
      p_meta: { source: 'ui', undo_of: 'arrived' }
    })
    if (e2) { alert(e2.message); return }
    onSet(studentId, prev)
  }

  function openVerifyModal(s: StudentVM){
    setVerifyStudent(s)
    setSelectedName(null)
    setOverrideName('')
    setPickupTime(nowHHMM())
    setShowVerify(true)
  }

  async function confirmCheckout(){
    if (!verifyStudent) return
    const chosen = (selectedName && selectedName.trim()) || (overrideName && overrideName.trim())
    if (!chosen) { alert('Please select an approved pickup OR enter an admin override name.'); return }

    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: verifyStudent.id,
      p_roster_date: todayKey(),
      p_new_status: 'checked',
      p_pickup_person: chosen,
      p_meta: {
        source: 'ui',
        approved_list: verifyStudent.approved,
        chosen_from_approved: !!selectedName,
        override: !!overrideName && !selectedName,
        pickup_time_edit: pickupTime
      }
    })
    if (error) { alert(error.message); return }
    onSet(verifyStudent.id, 'checked')
    setShowVerify(false)
    setVerifyStudent(null)
  }

  async function undoCheckout(studentId: string) {
    // Undo checkout always returns to 'arrived'
    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_roster_date: todayKey(),
      p_new_status: 'arrived',
      p_pickup_person: null,
      p_meta: { source: 'ui', undo_of: 'checked' }
    })
    if (error) { alert(error.message); return }
    onSet(studentId, 'arrived')
  }

  return (
    <div className="card">
      <div className="row spread">
        <div className="tabs">
          <button className={"tab " + (tab==='in'?'active':'')} onClick={()=>setTab('in')}>Center Check-in / Direct Check-in</button>
          <button className={"tab " + (tab==='out'?'active':'')} onClick={()=>setTab('out')}>Checkout / Checked Out</button>
        </div>
        <div className="row">
          {(['All','Bain','QG','MHE','MC'] as const).map(sc=>{
            const active = (schools[0]==='All' && sc==='All') || (schools[0]!=='All' && (schools as SchoolName[]).includes(sc as any))
            return <button key={sc} className={"chip " + (active?'active':'')} onClick={()=> sc==='All'? setSchools(['All']): toggleSchool(sc as any)}>{sc}</button>
          })}
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
                    // typical undo from 'picked' → 'not_picked'
                    supabase.rpc('api_set_status', {
                      p_student_id: id,
                      p_roster_date: todayKey(),
                      p_new_status: 'not_picked',
                      p_pickup_person: null,
                      p_meta: { source: 'ui', undo_from: 'picked' }
                    }).then(({ error })=>{
                      if(error){ alert(error.message); return }
                      onSet(id, 'not_picked')
                    })
                  }}
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
                Room {verifyStudent.room ?? '-'} • {verifyStudent.school}
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
