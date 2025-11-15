// src/pages/AdminStudentsPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ---------- Types ----------
type Student = {
  id: string;
  first_name: string;
  last_name: string;
  school: string | null;
  school_year: string | null; // Program
  active: boolean;
  no_bus_days: string[] | null;
};

const weekdayOptions = ["M", "T", "W", "R", "F"];

// ---------- Main Page ----------
export default function AdminStudentsPage() {
  const [tab, setTab] = useState<"students" | "approved" | "history">(
    "students"
  );

  return (
    <div className="container">
      {/* Segmented Tabs */}
      <div className="row wrap gap" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button
            className={`seg-btn ${tab === "students" ? "on" : ""}`}
            onClick={() => setTab("students")}
          >
            Students
          </button>
          <button
            className={`seg-btn ${tab === "approved" ? "on" : ""}`}
            onClick={() => setTab("approved")}
          >
            Approved Pickups
          </button>
          <button
            className={`seg-btn ${tab === "history" ? "on" : ""}`}
            onClick={() => setTab("history")}
          >
            Student History
          </button>
        </div>
      </div>

      {/* Render Tabs */}
      {tab === "students" && <StudentsManager />}
      {tab === "approved" && <ApprovedPickupsTab />}
      {tab === "history" && <StudentHistoryTab />}
    </div>
  );
}

//
// ============================================================
// TAB 1: STUDENTS MANAGER  (Add / Edit + Table)
// ============================================================
//
function StudentsManager() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  // Form fields
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [school, setSchool] = useState("");
  const [program, setProgram] = useState("");
  const [active, setActive] = useState(true);
  const [noBusDays, setNoBusDays] = useState<string[]>([]);

  async function loadStudents() {
    setLoading(true);
    const { data, error } = await supabase
      .from("students")
      .select(
        "id, first_name, last_name, school, school_year, active, no_bus_days"
      )
      .order("first_name", { ascending: true });

    if (!error) setStudents(data as Student[]);
    setLoading(false);
  }

  useEffect(() => {
    loadStudents();
  }, []);

  function resetForm() {
    setEditingId(null);
    setFirstName("");
    setLastName("");
    setSchool("");
    setProgram("");
    setActive(true);
    setNoBusDays([]);
  }

  function fillForm(st: Student) {
    setEditingId(st.id);
    setFirstName(st.first_name);
    setLastName(st.last_name);
    setSchool(st.school || "");
    setProgram(st.school_year || "");
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
      alert("First and last name are required");
      return;
    }

    // INSERT
    if (!editingId) {
      const { error } = await supabase.from("students").insert(payload);
      if (error) {
        console.error("[AdminStudents] save error", error);
        alert("Save failed.");
        return;
      }
    } else {
      // UPDATE
      const { error } = await supabase
        .from("students")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        console.error("[AdminStudents] update error", error);
        alert("Save failed.");
        return;
      }
    }

    resetForm();
    loadStudents();
  }

  async function deleteStudent(id: string) {
    if (!window.confirm("Delete this student?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (!error) loadStudents();
  }

  function toggleNoBus(day: string) {
    setNoBusDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  }

  return (
    <div className="two-col" style={{ gap: 20 }}>
      {/* LEFT COLUMN — FORM */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 12 }}>
          {editingId ? "Edit Student" : "Add Student"}
        </h3>

        <div className="col" style={{ gap: 10 }}>
          <label className="label">First Name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />

          <label className="label">Last Name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />

          <label className="label">School</label>
          <input value={school} onChange={(e) => setSchool(e.target.value)} />

          <label className="label">Program (School Year)</label>
          <input value={program} onChange={(e) => setProgram(e.target.value)} />

          <label className="label">Active</label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />

          <label className="label">No-Bus Days</label>
          <div className="row wrap" style={{ gap: 6 }}>
            {weekdayOptions.map((d) => (
              <label key={d} className="chip" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={noBusDays.includes(d)}
                  onChange={() => toggleNoBus(d)}
                  style={{ marginRight: 4 }}
                />
                {d}
              </label>
            ))}
          </div>

          {/* ACTION BUTTONS */}
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button className="btn primary" onClick={saveStudent}>
              {editingId ? "Save Changes" : "Add Student"}
            </button>
            <button className="btn" onClick={resetForm}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN — TABLE */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ marginBottom: 12, textAlign: "left" }}>All Students</h3>

        {loading ? (
          <div className="muted">Loading…</div>
        ) : (
          <div className="report-table-scroll" style={{ maxHeight: 600 }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Name</th>
                  <th style={{ textAlign: "left" }}>School</th>
                  <th style={{ textAlign: "left" }}>Program</th>
                  <th style={{ textAlign: "left" }}>Active</th>
                  <th style={{ textAlign: "left" }}>No-Bus</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {students.map((st) => (
                  <tr key={st.id}>
                    <td>
                      {st.first_name} {st.last_name}
                    </td>
                    <td>{st.school}</td>
                    <td>{st.school_year}</td>
                    <td>{st.active ? "Yes" : "No"}</td>
                    <td>{(st.no_bus_days || []).join(", ")}</td>
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
  );
}

//
// ============================================================
// TAB 2: Approved Pickups  (MOVED FROM REPORTS PAGE — unchanged)
// ============================================================
//

function ApprovedPickupsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setBusy(true);
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, school, approved_pickups")
        .eq("active", true);
      if (!error) {
        const mapped = (data || []).map((s: any) => {
          let ap = s.approved_pickups;
          if (typeof ap === "string") {
            try {
              ap = JSON.parse(ap);
            } catch {
              ap = null;
            }
          }
          return {
            student_id: s.id,
            student_name: `${s.first_name} ${s.last_name}`,
            school: s.school,
            approved_pickups: Array.isArray(ap) ? ap : [],
          };
        });
        setRows(mapped);
      }
      setBusy(false);
    })();
  }, []);

  async function savePickups(row: any, newList: string[]) {
    const clean = newList.map((x) => x.trim()).filter(Boolean);

    const { error } = await supabase.rpc(
      "rpc_update_student_approved_pickups",
      {
        p_student_id: row.student_id,
        p_pickups: clean,
      }
    );

    if (error) {
      alert("Save failed.");
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.student_id === row.student_id
          ? { ...r, approved_pickups: clean }
          : r
      )
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 12 }}>Approved Pickups</h3>
      {busy ? (
        <div className="muted">Loading…</div>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Student</th>
              <th style={{ textAlign: "left" }}>School</th>
              <th style={{ textAlign: "left" }}>Approved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <ApprovedRow key={r.student_id} row={r} onSave={savePickups} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ApprovedRow({ row, onSave }: any) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState([...row.approved_pickups]);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    setItems((prev) => [...prev, v]);
    setDraft("");
  }

  return (
    <tr>
      <td>{row.student_name}</td>
      <td>{row.school}</td>
      {editing ? (
        <td colSpan={2}>
          <div className="col" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              {items.map((x: string, i: number) => (
                <span key={i} className="chip">
                  {x}
                  <button
                    className="btn"
                    onClick={() =>
                      setItems((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="row" style={{ gap: 6 }}>
              <input
                value={draft}
                placeholder="Add name"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
              <button className="btn" onClick={add}>
                Add
              </button>
            </div>

            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <button
                className="btn primary"
                onClick={() => {
                  onSave(row, items);
                  setEditing(false);
                }}
              >
                Save
              </button>
              <button
                className="btn"
                onClick={() => {
                  setItems([...row.approved_pickups]);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </td>
      ) : (
        <>
          <td>
            {row.approved_pickups.length === 0 ? (
              <span className="muted">None</span>
            ) : (
              row.approved_pickups.map((x: string, i: number) => (
                <span key={i} className="chip" style={{ marginRight: 6 }}>
                  {x}
                </span>
              ))
            )}
          </td>
          <td>
            <button className="btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          </td>
        </>
      )}
    </tr>
  );
}

//
// ============================================================
// TAB 3: STUDENT HISTORY  (MOVED FROM REPORTS PAGE — unchanged)
// ============================================================
//

function StudentHistoryTab() {
  const [studentId, setStudentId] = useState("");
  const [start, setStart] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, active")
        .eq("active", true);

      setStudents(
        (data || [])
          .map((s: any) => ({
            id: s.id,
            name: `${s.first_name} ${s.last_name}`,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    })();
  }, []);

  async function run() {
    if (!studentId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("logs")
      .select("id, roster_date, action, at, meta, student_name")
      .eq("student_id", studentId)
      .gte("roster_date", start)
      .lte("roster_date", end)
      .order("roster_date", { ascending: true })
      .order("at", { ascending: true });

    if (!error) {
      setRows(data || []);
    } else {
      setRows([]);
    }

    setLoading(false);
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 12 }}>Student History</h3>

      {/* Controls */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <label className="label">Student</label>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          <option value="">— Select —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <label className="label">From</label>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />

        <label className="label">To</label>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />

        <button className="btn" onClick={run} disabled={loading}>
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {/* Results */}
      {rows.length === 0 ? (
        <div className="muted">No logs.</div>
      ) : (
        <div
          className="report-table-scroll"
          style={{ maxHeight: 500, paddingRight: 8 }}
        >
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "left" }}>Action</th>
                <th style={{ textAlign: "left" }}>Time</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const timeLabel = new Intl.DateTimeFormat("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                }).format(new Date(r.at));

                return (
                  <tr key={r.id}>
                    <td>{r.roster_date}</td>
                    <td>{r.action}</td>
                    <td>{timeLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
