// src/pages/AdminStudentsPage.tsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Student = {
  id?: string
  first_name: string
  last_name: string
  room_id?: string | null
  school?: string | null
  approved_pickups?: string[] | null
  no_bus_days?: string[] | null
  active: boolean
  school_year?: string | null
}

const SCHOOL_OPTIONS = ['Bain','QG','MHE','MC']
const PROGRAM_OPTIONS = ['Before School','After School','Full Day','Summer Camp']

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [editing, setEditing] = useState<Student | null>(null)
  const [busy, setBusy] = useState(false)

  // Load all students
  async function load() {
    setBusy(true)
    try {
      const { data, error } = await supabase.from('students')
        .select('id, first_name, last_name, room_id, school, approved_pickups, no_bus_days, active, school_year')
        .order('first_name', { ascending: true })
      if (error) throw error
      setStudents(data as Student[])
    } catch(e) {
      console.error('[AdminStudents] load failed', e)
      alert('Failed to load students.')
    } finally { setBusy(false) }
  }

  useEffect(()=>{ load() },[])

  function resetForm() {
    setEditing({
      first_name:'', last_name:'', room_id:null, school:null,
      approved_pickups:[], no_bus_days:[], active:true, school_year:null
    })
  }

  async function save() {
    if (!editing) return
    const rec = { ...editing }
    setBusy(true)
    try {
      if (rec.id) {
        const { error } = await supabase.from('students').update(rec).eq('id', rec.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('students').insert(rec)
        if (error) throw error
      }
      setEditing(null)
      await load()
    } catch(e) {
      console.error('[AdminStudents] save failed', e)
      alert('Save failed. See console.')
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this student?')) return
    setBusy(true)
    try {
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) throw error
      await load()
    } catch(e) {
      console.error('[AdminStudents] delete failed', e)
      alert('Delete failed.')
    } finally { setBusy(false) }
  }

  return (
    <div className="container report-wrap">
      <div className="card report-toolbar">
        <div className="row" style={{justifyContent:'space-between',alignItems:'center'}}>
          <h2>Student Management</h2>
          <button className="btn primary" onClick={resetForm}>➕ Add Student</button>
        </div>
      </div>

      {editing && (
        <div className="card" style={{marginTop:12}}>
          <h3>{editing.id ? 'Edit Student' : 'Add Student'}</h3>
          <div className="col" style={{gap:8, maxWidth:600}}>
            <label>First Name</label>
            <input value={editing.first_name} onChange={e=>setEditing({...editing,first_name:e.target.value})} />

            <label>Last Name</label>
            <input value={editing.last_name} onChange={e=>setEditing({...editing,last_name:e.target.value})} />

            <label>Room ID</label>
            <input value={editing.room_id ?? ''} onChange={e=>setEditing({...editing,room_id:e.target.value})} />

            <label>School</label>
            <select value={editing.school ?? ''} onChange={e=>setEditing({...editing,school:e.target.value||null})}>
              <option value="">— Select —</option>
              {SCHOOL_OPTIONS.map(s=> <option key={s} value={s}>{s}</option>)}
            </select>

            <label>Program</label>
            <select value={editing.school_year ?? ''} onChange={e=>setEditing({...editing,school_year:e.target.value||null})}>
              <option value="">— Select —</option>
              {PROGRAM_OPTIONS.map(p=> <option key={p} value={p}>{p}</option>)}
            </select>

            <label>Approved Pickups (comma separated)</label>
            <input value={(editing.approved_pickups||[]).join(', ')} onChange={e=>
              setEditing({...editing,approved_pickups:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />

            <label>No Bus Days (comma separated weekdays)</label>
            <input value={(editing.no_bus_days||[]).join(', ')} onChange={e=>
              setEditing({...editing,no_bus_days:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />

            <label className="row" style={{gap:6,alignItems:'center'}}>
              <input type="checkbox" checked={editing.active}
                onChange={e=>setEditing({...editing,active:e.target.checked})}/>
              <span>Active</span>
            </label>

            <div className="row" style={{gap:8,marginTop:12}}>
              <button className="btn primary" onClick={save} disabled={busy}>💾 Save</button>
              <button className="btn" onClick={()=>setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card report-table-card" style={{marginTop:12}}>
        {busy && <div className="muted">Loading...</div>}
        {!busy && students.length===0 && <div className="muted">No students.</div>}
        {!busy && students.length>0 && (
          <div className="report-table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>School</th>
                  <th>Program</th>
                  <th>Room ID</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s=>(
                  <tr key={s.id}>
                    <td>{s.first_name} {s.last_name}</td>
                    <td>{s.school ?? ''}</td>
                    <td>{s.school_year ?? ''}</td>
                    <td>{s.room_id ?? ''}</td>
                    <td>{s.active ? '✅' : '❌'}</td>
                    <td>
                      <button className="btn" onClick={()=>setEditing({...s})}>Edit</button>
                      <button className="btn" onClick={()=>remove(s.id!)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
