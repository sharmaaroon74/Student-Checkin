// src/pages/AdminStudentsPage.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  school: string | null;
  school_year: string | null; // “Program”
  active: boolean;
  no_bus_days: string[] | null;
};

const weekdayOptions = ['M', 'T', 'W', 'R', 'F'];

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [school, setSchool] = useState('');
  const [program, setProgram] = useState('');
  const [active, setActive] = useState(true);
  const [noBusDays, setNoBusDays] = useState<string[]>([]);

  async function loadStudents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('students')
      .select('id, first_name, last_name, school, school_year, active, no_bus_days')
      .order('first_name', { ascending: true });

    if (error) {
      console.error('[AdminStudents] fetch error', error);
      setStudents([]);
    } else {
      setStudents(data as Student[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
  }, []);

  function resetForm() {
    setEditingId(null);
    setFirstName('');
    setLastName('');
    setSchool('');
    setProgram('');
    setActive(true);
    setNoBusDays([]);
  }

  function fillForm(st: Student) {
    setEditingId(st.id);
    setFirstName(st.first_name);
    setLastName(st.last_name);
    setSchool(st.school || '');
    setProgram(st.school_year || '');
    setActive(st.active);
    setNoBusDays(st.no_bus_days || []);
  }

  async function saveStudent() {
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      school: school.trim(),
      school_year: program.trim(),
      active,
      no_bus_days: noBusDays,
    };

    if (!payload.first_name || !payload.last_name) {
      alert('First and last name are required');
      return;
    }

    let result;
    if (editingId) {
      result = await supabase
        .from('students')
        .update(payload)
        .eq('id', editingId)
        .select()
        .maybeSingle();
    } else {
      result = await supabase
        .from('students')
        .insert(payload)
        .select()
        .maybeSingle();
    }

    if (result.error) {
      console.error('[AdminStudents] save error:', result.error);
      alert('Save failed — check console.');
      return;
    }

    resetForm();
    loadStudents();
  }

  async function deleteStudent(id: string) {
    if (!window.confirm('Delete this student?')) return;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) {
      console.error('[AdminStudents] delete error:', error);
      alert('Delete failed — check console.');
      return;
    }
    loadStudents();
  }

  function toggleNoBus(day: string) {
    setNoBusDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  return (
    <div className="container">

      <div className="card" style={{ marginBottom: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          Student Management
        </h2>

        <div className="two-col" style={{ gap: 20 }}>

          {/* ================= ADD STUDENT (Improved UI) ================= */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 16, textAlign: 'left' }}>
              {editingId ? 'Edit Student' : 'Add Student'}
            </h3>

            <div className="col" style={{ gap: 14, maxWidth: 420 }}>

              {/* Row: First + Last Name */}
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="label">First Name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label className="label">Last Name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              {/* School */}
              <div>
                <label className="label">School</label>
                <input
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                />
              </div>

              {/* Program */}
              <div>
                <label className="label">Program (School Year)</label>
                <input
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                />
              </div>

              {/* Active */}
              <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                <label className="label">Active</label>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
              </div>

              {/* No-bus days */}
              <div>
                <label className="label" style={{ marginBottom: 6 }}>
                  No-Bus Days
                </label>
                <div className="row wrap" style={{ gap: 8 }}>
                  {weekdayOptions.map((d) => (
                    <label
                      key={d}
                      className="chip"
                      style={{
                        padding: '6px 10px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={noBusDays.includes(d)}
                        onChange={() => toggleNoBus(d)}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div className="row" style={{ gap: 10, marginTop: 10 }}>
                <button className="btn primary" onClick={saveStudent}>
                  {editingId ? 'Save Changes' : 'Add Student'}
                </button>
                <button className="btn" onClick={resetForm}>
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* ================= STUDENTS TABLE ================= */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 12, textAlign: 'left' }}>All Students</h3>

            {loading ? (
              <div className="muted">Loading…</div>
            ) : (
              <div className="report-table-scroll" style={{ maxHeight: 600 }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Name</th>
                      <th style={{ textAlign: 'left' }}>School</th>
                      <th style={{ textAlign: 'left' }}>Program</th>
                      <th style={{ textAlign: 'left' }}>Active</th>
                      <th style={{ textAlign: 'left' }}>No-Bus</th>
                      <th style={{ textAlign: 'left' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((st) => (
                      <tr key={st.id}>
                        <td>{st.first_name} {st.last_name}</td>
                        <td>{st.school}</td>
                        <td>{st.school_year}</td>
                        <td>{st.active ? 'Yes' : 'No'}</td>
                        <td>{(st.no_bus_days || []).join(', ')}</td>
                        <td>
                          <button className="btn" onClick={() => fillForm(st)}>
                            Edit
                          </button>
                          <button
                            className="btn"
                            style={{ marginLeft: 6 }}
                            onClick={() => deleteStudent(st.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
