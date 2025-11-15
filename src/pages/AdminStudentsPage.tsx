// src/pages/AdminStudentsPage.tsx
import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Student = {
  id?: string
  first_name: string
  last_name: string
  school?: string | null
  school_year?: string | null   // Program
  no_bus_days?: string[] | null
  active: boolean
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [editing, setEditing] = useState<Student | null>(null)
  const [busy, setBusy] = useState<boolean>(false)

  // -------------------------------
  // Load All Students
  // -------------------------------
  async function loadStudents() {
    setBusy(true)
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, school, school_year, no_bus_days, active')
        .order('first_name', { ascending: true })

      if (error) throw error
      setStudents(data as Student[])
    } catch (e) {
      console.error('[AdminStudents] load error:', e)
      alert('Failed to load students. Check console.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { loadStudents() }, [])

  // -------------------------------
  // Reset / Start Add Flow
  // -------------------------------
  function startAdd() {
    setEditing({
      first_name: '',
      last_name: '',
      school: '',
      school_year: '',
      no_bus_days: [],
      active: true,
    })
  }

  // -------------------------------
  // Save Student (Insert or Update)
  // -------------------------------
  async function saveStudent() {
    if (!editing) return

    const payload = {
      first_name: editing.first_name.trim(),
      last_name: editing.last_name.trim(),
      school: editing.school?.trim() || null,
      school_year: editing.school_year?.trim() || null,
      no_bus_days: editing.no_bus_days || [],
      active: editing.active
    }

    if (!payload.first_name || !payload.last_name) {
      alert('First name and last name cannot be empty.')
      return
    }

    setBusy(true)
    try {
      if (editing.id) {
        // Update
        const { error } = await supabase
          .from('students')
          .update(payload)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        // Insert
        const { error } = await supabase
          .from('students')
          .insert(payload)
        if (error) throw error
      }

      setEditing(null)
      await loadStudents()
    } catch (e) {
      console.error('[AdminStudents] save error:', e)
      alert('Save failed. See console.')
    } finally {
      setBusy(false)
    }
  }

  // -------------------------------
  // Delete Student
  // -------------------------------
  async function deleteStudent(id: string) {
    if (!window.confirm('Are you sure you want to delete this student?')) return

    setBusy(true)
    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', id)
      if (error) throw error

      await loadStudents()
    } catch (e) {
      console.error('[AdminStudents] delete error:', e)
      alert('Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  // -------------------------------
  // Render
  // -------------------------------
  return (
    <div className="container report-wrap">

      {/* -------------------------------------- */}
      {/* Header / Toolbar */}
      {/* -------------------------------------- */}
      <div className="card report-toolbar" style={{ marginBottom: 12 }}>
        <div
          className="row"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h2 style={{ margin: 0 }}>Student Management</h2>

          <button className="btn primary" onClick={startAdd}>
            ➕ Add Student
          </button>
        </div>
      </div>

      {/* -------------------------------------- */}
      {/* Add / Edit Form */}
      {/* -------------------------------------- */}
      {editing && (
        <div className="card" style={{ marginBottom: 18, padding: '18px 20px' }}>
          <h3 style={{ marginTop: 0 }}>
            {editing.id ? 'Edit Student' : 'Add Student'}
          </h3>

          <div className="col" style={{ gap: 10, maxWidth: 500 }}>

            {/* First Name */}
            <label className="label">First Name</label>
            <input
              className="input"
              value={editing.first_name}
              onChange={(e) =>
                setEditing({ ...editing, first_name: e.target.value })
              }
            />

            {/* Last Name */}
            <label className="label">Last Name</label>
            <input
              className="input"
              value={editing.last_name}
              onChange={(e) =>
                setEditing({ ...editing, last_name: e.target.value })
              }
            />

            {/* School */}
            <label className="label">School</label>
            <input
              className="input"
              placeholder="Bain / QG / MHE / MC"
              value={editing.school ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, school: e.target.value })
              }
            />

            {/* Program */}
            <label className="label">Program (School Year)</label>
            <input
              className="input"
              placeholder="After School / Before School / Full Day etc."
              value={editing.school_year ?? ''}
              onChange={(e) =>
                setEditing({ ...editing, school_year: e.target.value })
              }
            />

            {/* No Bus Days */}
            <label className="label">No Bus Days (comma separated)</label>
            <input
              className="input"
              placeholder="Mon, Tue, Wed"
              value={(editing.no_bus_days || []).join(', ')}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  no_bus_days: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />

            {/* Active Toggle */}
            <label className="row" style={{ gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />
              <span>Active</span>
            </label>

            {/* Buttons */}
            <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <button className="btn primary" disabled={busy} onClick={saveStudent}>
                💾 Save
              </button>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------- */}
      {/* Students Table */}
      {/* -------------------------------------- */}
      <div className="card report-table-card">
        {busy && <div className="muted">Loading...</div>}

        {!busy && students.length === 0 && (
          <div className="muted" style={{ padding: 10 }}>
            No students found.
          </div>
        )}

        {!busy && students.length > 0 && (
          <div className="report-table-scroll">
            <table className="report-table">
              <thead className="report-thead">
                <tr>
                  <th>Name</th>
                  <th>School</th>
                  <th>Program</th>
                  <th>Active</th>
                  <th style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>

              <tbody className="report-tbody">
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.first_name} {s.last_name}</td>
                    <td>{s.school ?? ''}</td>
                    <td>{s.school_year ?? ''}</td>
                    <td>{s.active ? '✅' : '❌'}</td>

                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="btn" onClick={() => setEditing({ ...s })}>
                          Edit
                        </button>
                        <button className="btn" onClick={() => deleteStudent(s.id!)}>
                          🗑️
                        </button>
                      </div>
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
