import React from 'react'
import { Status } from '../types'

export type StudentVM = {
  id: string
  name: string
  room: number | null
  school: 'Bain'|'QG'|'MHE'|'MC'
  status: Status
}

export function StudentRow({ s, onSet }:{ s: StudentVM, onSet:(id:string, st: Status)=>void }){
  return (
    <div className="item">
      <div>
        <div className="heading">{s.name}</div>
        <div className="muted" style={{fontSize:13}}>Room {s.room ?? '-'} • {s.school} • Status: <b>{s.status}</b></div>
      </div>
      <div className="row">
        <button className="btn small" onClick={()=>onSet(s.id, 'picked')}>Picked</button>
        <button className="btn small" onClick={()=>onSet(s.id, 'arrived')}>Arrived</button>
        <button className="btn small" onClick={()=>onSet(s.id, 'checked')}>Check Out</button>
        <button className="btn small" onClick={()=>onSet(s.id, 'skipped')}>Skip</button>
      </div>
    </div>
  )
}
