import React, { useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'
import { StudentRow as RowComp, StudentVM } from '../components/StudentList'

export default function BusPage({ students, roster, onSet }:{ 
  students: StudentRow[], 
  roster: Record<string, Status>, 
  onSet:(id:string, st: Status)=>void 
}){
  const [school, setSchool] = useState<SchoolName | 'All'>('All')

  const vm = useMemo<StudentVM[]>(()=> students.map(s=>({
    id: s.id,
    name: s.first_name + ' ' + s.last_name,
    room: s.room_id, school: s.school,
    status: roster[s.id] ?? 'not_picked'
  })), [students, roster])

  const filtered = vm.filter(s => school==='All' || s.school===school)

  const pickupList = filtered.filter(s => s.status === 'not_picked')
  const picked = filtered.filter(s => s.status === 'picked')
  const skipped = filtered.filter(s => s.status === 'skipped')

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="row spread">
          <h3 className="heading">Bus Pickup</h3>
          <div className="row">
            {(['All','Bain','QG','MHE','MC'] as const).map(sc=>(
              <button key={sc} className={"chip " + (school===sc?'active':'')} onClick={()=>setSchool(sc as any)}>{sc}</button>
            ))}
          </div>
        </div>
        <div className="list" style={{marginTop:12}}>
          <div className="muted" style={{marginBottom:6}}>TO PICK UP</div>
          {pickupList.map(s=> <RowComp key={s.id} s={s} onSet={onSet} />)}
          {!pickupList.length && <div className="muted">No students to pick up</div>}
        </div>

        <div className="list" style={{marginTop:20}}>
          <div className="muted" style={{marginBottom:6}}>PICKED</div>
          {picked.map(s=> <RowComp key={s.id} s={s} onSet={onSet} />)}
          {!picked.length && <div className="muted">None</div>}
        </div>
      </div>

      <div className="card">
        <h3 className="heading">Skipped Today</h3>
        <div className="list" style={{marginTop:12}}>
          {skipped.map(s=> <RowComp key={s.id} s={s} onSet={onSet} />)}
          {!skipped.length && <div className="muted">None</div>}
        </div>
      </div>
    </div>
  )
}
