import React, { useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'
import { supabase } from '../lib/supabase'

type StudentVM = {
  id: string
  first: string
  last: string
  name: string
  school: string
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
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  const [school, setSchool] = useState<SchoolName | 'All'>('All')
  const [q, setQ] = useState('')

  const vm = useMemo<StudentVM[]>(()=> students.map(s=>({
    id: s.id,
    first: s.first_name,
    last:  s.last_name,
    name: s.first_name + ' ' + s.last_name,
    school: (s.school as any) ?? '',
    status: roster[s.id] ?? 'not_picked'
  })), [students, roster])

  const sortFn = (a: StudentVM, b: StudentVM) =>
    sortBy === 'first'
      ? a.first.localeCompare(b.first) || a.last.localeCompare(b.last)
      : a.last.localeCompare(b.last) || a.first.localeCompare(b.first)

  const qlc = q.trim().toLowerCase()
  const matchesSearch = (s: StudentVM) => !qlc || s.first.toLowerCase().includes(qlc) || s.last.toLowerCase().includes(qlc)

  const filtered = vm.filter(s => (school === 'All' || s.school === school) && matchesSearch(s))

  const skipped   = filtered.filter(s => s.status === 'skipped').sort(sortFn)
  const candidates= filtered.filter(s => s.status !== 'skipped').sort(sortFn)

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

  async function unskipToday(studentId: string) {
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
        <div className="row spread">
          <h3 className="heading">Mark Skip Today</h3>
          <div className="row">
            {(['All', 'Bain', 'QG', 'MHE', 'MC'] as const).map(sc => (
              <button key={sc} className={'chip ' + (school === sc ? 'active' : '')} onClick={() => setSchool(sc as any)}>{sc}</button>
            ))}
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
        <div className="list" style={{marginTop:12}}>
          {candidates.map(s=> (
            <div key={s.id} className="item">
              <div>
                <div className="heading">{s.name}</div>
                <div className="muted" style={{fontSize:13}}>{s.school} • Status: <b>{s.status}</b></div>
              </div>
              <div className="row">
                <button className="btn small" onClick={()=>skipToday(s.id)}>Skip Today</button>
                <button className="btn small" onClick={()=>onSet(s.id, s.status)}>Undo</button>
              </div>
            </div>
          ))}
          {!candidates.length && <div className="muted">No candidates</div>}
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h3 className="heading">Skipped Today</h3>
          <div className="row">
            {(['All', 'Bain', 'QG', 'MHE', 'MC'] as const).map(sc => (
              <button key={sc} className={'chip ' + (school === sc ? 'active' : '')} onClick={() => setSchool(sc as any)}>{sc}</button>
            ))}
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
        <div className="list" style={{marginTop:12}}>
          {skipped.map(s=> (
            <div key={s.id} className="item">
              <div>
                <div className="heading">{s.name}</div>
                <div className="muted" style={{fontSize:13}}>{s.school} • Status: <b>skipped</b></div>
              </div>
              <div className="row">
                <button className="btn small" onClick={()=>unskipToday(s.id)}>Unskip Today</button>
              </div>
            </div>
          ))}
          {!skipped.length && <div className="muted">None</div>}
        </div>
      </div>
    </div>
  )
}
