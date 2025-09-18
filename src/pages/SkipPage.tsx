import React, { useMemo } from 'react'
import { StudentRow, Status } from '../types'
import { StudentRow as RowComp, StudentVM } from '../components/StudentList'

export default function SkipPage({ students, roster, onSet }:{ 
  students: StudentRow[], 
  roster: Record<string, Status>, 
  onSet:(id:string, st: Status)=>void 
}){
  const vm = useMemo<StudentVM[]>(()=> students.map(s=>({
    id: s.id,
    name: s.first_name + ' ' + s.last_name,
    room: s.room_id, school: s.school,
    status: roster[s.id] ?? 'not_picked'
  })), [students, roster])

  const skipped = vm.filter(s => s.status === 'skipped')
  const candidates = vm.filter(s => s.status!=='skipped')

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3 className="heading">Mark Skip Today</h3>
        <div className="list" style={{marginTop:12}}>
          {candidates.map(s=> <RowComp key={s.id} s={s} onSet={(id)=> onSet(id, 'skipped')} />)}
          {!candidates.length && <div className="muted">No candidates</div>}
        </div>
      </div>
      <div className="card">
        <h3 className="heading">Skipped Today</h3>
        <div className="list" style={{marginTop:12}}>
          {skipped.map(s=> <RowComp key={s.id} s={s} onSet={(id)=> onSet(id, 'not_picked')} />)}
          {!skipped.length && <div className="muted">None</div>}
        </div>
      </div>
    </div>
  )
}
