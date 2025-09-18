import React, { useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'
import { StudentRow as RowComp, StudentVM } from '../components/StudentList'

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

  const schoolFiltered = vm.filter(s => (schools[0]==='All') || (schools as SchoolName[]).includes(s.school))

  const centerCheckinList = schoolFiltered.filter(s => s.status==='picked' || s.status==='not_picked')
  const directCheckinCandidates = schoolFiltered.filter(s => s.status==='not_picked' || s.status==='skipped')
  const checkoutList = schoolFiltered.filter(s => s.status==='arrived')
  const checkedOut = schoolFiltered.filter(s => s.status==='checked')

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
              {centerCheckinList.map(s=> <RowComp key={s.id} s={s} onSet={(id,st)=> onSet(id, st==='picked'?'arrived':st)} />)}
              {!centerCheckinList.length && <div className="muted">No students</div>}
            </div>
          </div>
          <div>
            <h3 className="heading">Direct Check-in (No Bus)</h3>
            <div className="list" style={{marginTop:8}}>
              {directCheckinCandidates.map(s=> <RowComp key={s.id} s={s} onSet={(id)=> onSet(id, 'arrived')} />)}
              {!directCheckinCandidates.length && <div className="muted">No students</div>}
            </div>
          </div>
        </div>
      )}

      {tab==='out' && (
        <div className="grid cols-2" style={{marginTop:12}}>
          <div>
            <h3 className="heading">Checkout</h3>
            <div className="list" style={{marginTop:8}}>
              {checkoutList.map(s=> <RowComp key={s.id} s={s} onSet={(id)=> onSet(id, 'checked')} />)}
              {!checkoutList.length && <div className="muted">No students ready to check out</div>}
            </div>
          </div>
          <div>
            <h3 className="heading">Checked Out</h3>
            <div className="list" style={{marginTop:8}}>
              {checkedOut.map(s=> <RowComp key={s.id} s={s} onSet={(id)=> onSet(id, 'arrived')} />)}
              {!checkedOut.length && <div className="muted">None</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
