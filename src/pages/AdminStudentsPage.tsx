// src/pages/AdminStudentsPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";

/* ============================================================
   TYPES
============================================================ */
type Student = {
  id: string;
  first_name: string;
  last_name: string;
  school: string | null;
  school_year: string | null;   // Program
  active: boolean;
  no_bus_days: string[] | null;
};

const weekdayOptions = ["M", "T", "W", "R", "F"];
const SCHOOL_FILTERS = ["All", "Bain", "QG", "MHE", "MC"];

/* ============================================================
   MAIN PAGE WRAPPER
============================================================ */
export default function AdminStudentsPage() {
  const [tab, setTab] = useState<"students" | "approved" | "history">(
    "students"
  );

  return (
    <div className="container">

      {/* Seg Buttons - full width */}
      <div className="row wrap" style={{ marginBottom: 20 }}>
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

      {/* Render each tab */}
      {tab === "students" && <StudentsManager />}
      {tab === "approved" && <ApprovedPickupsTab />}
      {tab === "history" && <StudentHistoryTab />}
    </div>
  );
}

/* ============================================================
   TAB 1 — STUDENTS MANAGER
============================================================ */
function StudentsManager() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [school, setSchool] = useState("");
  const [program, setProgram] = useState("");
  const [active, setActive] = useState(true);
  const [noBusDays, setNoBusDays] = useState<string[]>([]);

  // NEW — search + sort + filters
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"first" | "last">("first");
  const [schoolFilter, setSchoolFilter] = useState("All");

  async function loadStudents() {
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select(
        "id, first_name, last_name, school, school_year, active, no_bus_days"
      )
      .order("first_name", { ascending: true });

    setStudents((data || []) as Student[]);
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

    if (!editingId) {
      await supabase.from("students").insert(payload);
    } else {
      await supabase
        .from("students")
        .update(payload)
        .eq("id", editingId);
    }

    resetForm();
    loadStudents();
  }

  async function deleteStudent(id: string) {
    if (!window.confirm("Delete this student?")) return;
    await supabase.from("students").delete().eq("id", id);
    loadStudents();
  }

  function toggleNoBus(day: string) {
    setNoBusDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  /* ------------------ FILTER + SORT + SEARCH ------------------ */
  const filtered = useMemo(() => {
    let out = [...students];

    if (schoolFilter !== "All") {
      out = out.filter((s) => s.school === schoolFilter);
    }

    if (search.trim() !== "") {
      const q = search.toLowerCase();
      out = out.filter(
        (s) =>
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q)
      );
    }

    out.sort((a, b) => {
      const A = sortBy === "first"
        ? `${a.first_name} ${a.last_name}`.toLowerCase()
        : a.last_name.toLowerCase();
      const B = sortBy === "first"
        ? `${b.first_name} ${b.last_name}`.toLowerCase()
        : b.last_name.toLowerCase();
      return A.localeCompare(B);
    });

    return out;
  }, [students, search, sortBy, schoolFilter]);

  /* ------------------ UI ------------------ */
  return (
    <div className="two-col" style={{ gap: 24 }}>

      {/* LEFT — ADD / EDIT FORM */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 16 }}>{editingId ? "Edit Student" : "Add Student"}</h3>

        <div
          className="col"
          style={{
            gap: 14,
            background: "#fafafa",
            padding: 16,
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <div className="col" style={{ flex: 1 }}>
              <label className="label">First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>

            <div className="col" style={{ flex: 1 }}>
              <label className="label">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <label className="label">School</label>
          <input value={school} onChange={(e) => setSchool(e.target.value)} />

          <label className="label">Program (School Year)</label>
          <input value={program} onChange={(e) => setProgram(e.target.value)} />

          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <label className="label">Active</label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </div>

          <label className="label">No-Bus Days</label>
          <div className="row wrap" style={{ gap: 8 }}>
            {weekdayOptions.map((d) => (
              <label key={d} className="chip" style={{ padding: "6px 10px" }}>
                <input
                  type="checkbox"
                  checked={noBusDays.includes(d)}
                  onChange={() => toggleNoBus(d)}
                  style={{ marginRight: 6 }}
                />
                {d}
              </label>
            ))}
          </div>

          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn primary" onClick={saveStudent}>
              {editingId ? "Save Changes" : "Add Student"}
            </button>
            <button className="btn" onClick={resetForm}>Reset</button>
          </div>
        </div>
      </div>

      {/* RIGHT — FILTER BAR + TABLE */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 16 }}>All Students</h3>

        {/* Search, Sort, Filter */}
        <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
          <input
            placeholder="Search name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 160 }}
          />

          <label className="label">Sort</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="first">First Name</option>
            <option value="last">Last Name</option>
          </select>

          <label className="label">School</label>
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
          >
            {SCHOOL_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="muted">Loading…</div>
        ) : (
          <div className="report-table-scroll" style={{ maxHeight: 600 }}>
            <table className="report-table">

              <thead>
                <tr style={{ background: "#e6e6e6" }}>
                  <th style={{ textAlign: "left", width: "180px" }}>Name</th>
                  <th style={{ textAlign: "left" }}>School</th>
                  <th style={{ textAlign: "left" }}>Program</th>
                  <th style={{ textAlign: "left" }}>Active</th>
                  <th style={{ textAlign: "left" }}>No-Bus</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((st, i) => (
                  <tr
                    key={st.id}
                    style={{
                      background: i % 2 === 0 ? "#fff" : "#f7f7f7",
                    }}
                  >
                    <td style={{ whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {st.first_name} {st.last_name}
                    </td>
                    <td>{st.school}</td>
                    <td>{st.school_year}</td>
                    <td>{st.active ? "Yes" : "No"}</td>
                    <td>{(st.no_bus_days || []).join(", ")}</td>
                    <td>
                      <button className="btn" onClick={() => fillForm(st)}>Edit</button>
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

/* ============================================================
   TAB 2 — APPROVED PICKUPS
============================================================ */
function ApprovedPickupsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setBusy(true);
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, school, approved_pickups")
        .eq("active", true);

      const mapped = (data || []).map((s: any) => {
        let ap = s.approved_pickups;
        if (typeof ap === "string") {
          try {
            ap = JSON.parse(ap);
          } catch {
            ap = [];
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
      setBusy(false);
    })();
  }, []);

  async function savePickups(row: any, newList: string[]) {
    const clean = newList.map((x) => x.trim()).filter(Boolean);

    await supabase.rpc("rpc_update_student_approved_pickups", {
      p_student_id: row.student_id,
      p_pickups: clean,
    });

    setRows((prev) =>
      prev.map((r) =>
        r.student_id === row.student_id
          ? { ...r, approved_pickups: clean }
          : r
      )
    );
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ marginBottom: 16 }}>Approved Pickups</h3>

      {busy ? (
        <div className="muted">Loading…</div>
      ) : (
        <table className="report-table">
          <thead>
            <tr style={{ background: "#e6e6e6" }}>
              <th style={{ textAlign: "left", width: 180 }}>Student</th>
              <th style={{ textAlign: "left" }}>School</th>
              <th style={{ textAlign: "left" }}>Approved</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <ApprovedRow
                key={r.student_id}
                row={r}
                index={i}
                onSave={savePickups}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ApprovedRow({ row, index, onSave }: any) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState([...row.approved_pickups]);
  const [draft, setDraft] = useState("");

  return (
    <tr style={{ background: index % 2 === 0 ? "#fff" : "#f7f7f7" }}>
      <td style={{ width: 180, whiteSpace: "nowrap" }}>{row.student_name}</td>
      <td>{row.school}</td>

      {editing ? (
        <td colSpan={2}>
          <div className="col" style={{ gap: 8 }}>
            <div className="row wrap" style={{ gap: 8 }}>
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

            <div className="row" style={{ gap: 8 }}>
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

            <div className="row" style={{ gap: 8, marginTop: 8 }}>
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

  /* helper */
  function add() {
    const v = draft.trim();
    if (!v) return;
    setItems((prev) => [...prev, v]);
    setDraft("");
  }
}

/* ============================================================
   TAB 3 — STUDENT HISTORY
============================================================ */
function StudentHistoryTab() {
  const [studentId, setStudentId] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
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

    const { data } = await supabase
      .from("logs")
      .select("id, roster_date, action, at, meta, student_name")
      .eq("student_id", studentId)
      .gte("roster_date", start)
      .lte("roster_date", end)
      .order("roster_date", { ascending: true })
      .order("at", { ascending: true });

    setRows(data || []);
    setLoading(false);
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ marginBottom: 16 }}>Student History</h3>

      {/* Search Controls */}
      <div className="row wrap" style={{ gap: 12, marginBottom: 16 }}>
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

        <button className="btn" onClick={run}>
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {/* TABLE */}
      {rows.length === 0 ? (
        <div className="muted">No logs.</div>
      ) : (
        <div className="report-table-scroll" style={{ maxHeight: 520 }}>
          <table className="report-table">
            <thead>
              <tr style={{ background: "#e6e6e6" }}>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "left" }}>Action</th>
                <th style={{ textAlign: "left" }}>Time</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r, i) => {
                const timeLabel = new Intl.DateTimeFormat("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                }).format(new Date(r.at));

                return (
                  <tr
                    key={r.id}
                    style={{
                      background: i % 2 === 0 ? "#fff" : "#f7f7f7",
                    }}
                  >
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
