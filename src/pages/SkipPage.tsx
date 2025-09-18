import React, { useMemo } from 'react'
import { StudentRow, Status } from '../types'
import { supabase } from '../lib/supabase'

type StudentVM = {
  id: string
  name: string
  room: number | null
  school: 'Bain'|'QG'|'MHE'|'MC'
  status: Status
}

const todayKey = () => new Date().toISOString().slice(0,10)

export default function SkipPage({
  students, roster, onSet
}:{ 
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

  const skipped   = vm.filter(s => s.status === 'skipped')
  const candidates= vm.filter(s => s.status !== 'skipped')

  async function skipToday(studentId: string) {
    const prev = (roster[studentId] ?? 'not_picked') as Status
    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_roster_date: todayKey(),
      p_new_status: 'skipped',
      p_pickup_person: null,
      p_meta: { source: 'ui', prev_status: prev }
    })
    if (error){ alert(error.message); return }
    onSet(studentId, 'skipped')
  }

  async function undoSkip(studentId: string) {
    const { data, error } = await supabase
      .from('logs')
      .select('action, meta')
      .eq('roster_date', todayKey())
      .eq('student_id', studentId)
      .eq('action', 'skipped')
      .order('at', { ascending: false })
      .limit(1)
    if (error){ alert(error.message); return }
    const prev = (data?.[0]?.meta?.prev_status as Status) || 'not_picked'
    const { error: e2 } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_roster_date: todayKey(),
      p_new_status: prev,
      p_pickup_person: null,
      p_meta: { source: 'ui', undo_of: 'skipped' }
    })
    if (e2){ alert(e2.message); return }
    onSet(studentId, prev)
  }

  return (
    <div className="grid cols-2">
      <div className="card">
        <h3 className="heading">Mark Skip Today</h3>
        <div className="list" style={{marginTop:12}}>
          {candidates.map(s=> (
            <div key={s.id} className="item">
              <div>
                <div className="heading">{s.name}</div>
                <div className="muted" style={{fontSize:13}}>Room {s.room ?? '-'} • {s.school} • Status: <b>{s.status}</b></div>
              </div>
              <div className="row">
                {/* Only Skip and Undo are shown; Undo here is a no-op for non-skipped */}
                <button className="btn small" onClick={()=>onSet(s.id, s.status)}>Undo</button>
                <button className="btn small" onClick={()=>skipToday(s.id)}>Skip Today</button>
              </div>
            </div>
          ))}
          {!candidates.length && <div className="muted">No candidates</div>}
        </div>
      </div>
      <div className="card">
        <h3 className="heading">Skipped Today</h3>
        <div className="list" style={{marginTop:12}}>
          {skipped.map(s=> (
            <div key={s.id} className="item">
              <div>
                <div className="heading">{s.name}</div>
                <div className="muted" style={{fontSize:13}}>Room {s.room ?? '-'} • {s.school} • Status: <b>{s.status}</b></div>
              </div>
              <div className="row">
                {/* Only Undo and Skip are shown; Undo restores to the actual previous status */}
                <button className="btn small" onClick={()=>undoSkip(s.id)}>Undo</button>
                <button className="btn small" onClick={()=>skipToday(s.id)}>Skip Today</button>
              </div>
            </div>
          ))}
          {!skipped.length && <div className="muted">None</div>}
        </div>
      </div>
    </div>
  )
}
