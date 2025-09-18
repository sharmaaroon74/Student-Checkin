import React, { useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'

type StudentVM = {
  id: string
  name: string
  room: number | null
  school: 'Bain'|'QG'|'MHE'|'MC'
  status: Status
}

function Row({ s, primaryLabel, onPrimary, onUndo }:{
  s: StudentVM,
  primaryLabel: string,
  onPrimary: (id:string)=>void,
  onUndo: (id:string)=>void
}){
  return (
    <div className="item">
      <div>
        <div className="heading">{s.name}</div>
        <div className="muted" style={{fontSize:13}}>Room {s.room ?? '-'} • {s.school} • Status: <b>{s.status}</b></div>
      </div>
      <div className="row">
        <button className="btn small" onClick={()=>onUndo(s.id)}>Undo</button>
        <button className="btn small" onClick={()=>onPrimary(s.id)}>{primaryLabel}</button>
      </div>
    </div>
  )
}

export default function CenterPage({ students, roster, onSet }:{
  students: StudentRow[],
  roster: Record<string, Status>,
  onSet:(id:string, st: Status)=>void
}){
  const [tab, setTab] = useState<'in'|'out'>('in')
  const [schools, setSchools] = useState<SchoolName[]|['All']>(['All'])

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
    status: roster[s.id] ?? 'not_picked'
  })), [students, roster])

  const bySchool = vm.filter(s => (schools[0]==='All') || (schools as SchoolName[]).includes(s.school))

  // Center Check-in (from Bus): ONLY students already 'picked'
  const centerCheckin = bySchool.filter(s => s.status === 'picked')

  // Direct Check-in (No Bus): ONLY students 'not_picked'
  const directCheckin = bySchool.filter(s => s.status === 'not_picked')

  // Checkout list: ONLY 'arrived'
  const checkoutList = bySchool.filter(s => s.status === 'arrived')
  const checkedOut = bySchool.filter(s => s.status === 'checked')

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
                  onPrimary={(id)=> onSet(id, 'arrived')}
                  onUndo={(id)=> onSet(id, 'not_picked')}
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
                  onPrimary={(id)=> onSet(id, 'arrived')}
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
                  primaryLabel="Check Out"
                  onPrimary={(id)=> onSet(id, 'checked')}
                  onUndo={(id)=> onSet(id, 'arrived')}
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
                  onPrimary={(id)=> onSet(id, 'arrived')}
                  onUndo={(id)=> onSet(id, 'arrived')}
                />
              ))}
              {!checkedOut.length && <div className="muted">None</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
