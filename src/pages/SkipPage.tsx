// src/pages/SkipPage.tsx
import React, { useMemo, useState } from 'react'
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
}

export default function SkipPage({
  students, roster, onSet
}:{ 
  students: StudentRow[], 
  roster: Record<string, Status>, 
  onSet:(id:string, st: Status, meta?: Record<string,any>)=>Promise<void>|void 
}){
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  const [school, setSchool] = useState<AllowedSchool | 'All'>('All')
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
    await onSet(studentId, 'skipped', { prev_status: prev })
  }

  async function unskipToday(studentId: string) {
    // Look up last "skipped" log to find prev_status; fallback to not_picked
    const { data, error } = await supabase
      .from('logs')
      .select('meta')
      .eq('roster_date', todayKeyEST())
      .eq('student_id', studentId)
      .eq('action', 'skipped')
      .order('at', { ascending: false })
      .limit(1)
    const prev = (data?.[0]?.meta?.prev_status as Status) || 'not_picked'
    if (error) console.error(error)
    await onSet(studentId, prev, { undo_of: 'skipped' })
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
            <input placeholder="Search name…" value={q} onChange={e=>setQ(e.target.value)} style={{ marginLeft: 8, minWidth: 180 }} />
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
            <input placeholder="Search name…" value={q} onChange={e=>setQ(e.target.value)} style={{ marginLeft: 8, minWidth: 180 }} />
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
