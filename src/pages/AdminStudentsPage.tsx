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

  // Sort & Filter Controls
  const [sortBy, setSortBy] = useState<"first" | "last">("first");
  const [schoolFilter, setSchoolFilter] = useState("All");
  const [programFilter, setProgramFilter] = useState("All");

  const SCHOOL_LIST = ["All", "Bain", "QG", "MHE", "MC"];
  const PROGRAM_LIST = ["All", "K-2", "3-5", "6-8", "PK", "Other"];

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

    if (!editingId) {
      const { error } = await supabase.from("students").insert(payload);
      if (error) {
        console.error("[AdminStudents] save error", error);
        alert("Save failed.");
        return;
      }
    } else {
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

  function toggleNoBus(day: string) {
    setNoBusDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  }

  // Sorting & filtering logic
  const filteredSorted = students
    .filter((s) => (schoolFilter === "All" ? true : s.school === schoolFilter))
    .filter((s) =>
      programFilter === "All" ? true : (s.school_year || "") === programFilter
    )
    .sort((a, b) => {
      if (sortBy === "first") {
        return a.first_name.localeCompare(b.first_name);
      } else {
        return a.last_name.localeCompare(b.last_name);
      }
    });

  const formatName = (s: Student) =>
    sortBy === "last"
      ? `${s.last_name}, ${s.first_name}`
      : `${s.first_name} ${s.last_name}`;

  return (
    <div className="two-col" style={{ gap: 20 }}>
      {/* LEFT COLUMN — FORM */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 16, textAlign: "left" }}>
          {editingId ? "Edit Student" : "Add Student"}
        </h3>

        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="label" style={{ marginBottom: 4 }}>
              First Name
            </label>
            <input
              style={{ padding: "10px" }}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div>
            <label className="label" style={{ marginBottom: 4 }}>
              Last Name
            </label>
            <input
              style={{ padding: "10px" }}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          {/* School + Program on same row */}
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="label" style={{ marginBottom: 4 }}>
                School
              </label>
              <input
                style={{ padding: "10px" }}
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label className="label" style={{ marginBottom: 4 }}>
                Program (School Year)
              </label>
              <input
                style={{ padding: "10px" }}
                value={program}
                onChange={(e) => setProgram(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <label className="label">Active</label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </div>

          <label className="label" style={{ marginTop: 6 }}>
            No-Bus Days:
          </label>
          <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
            {weekdayOptions.map((d) => (
              <label
                key={d}
                className="chip"
                style={{
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  padding: "4px 10px",
                }}
              >
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

          <div className="row" style={{ gap: 10, marginTop: 14 }}>
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
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 12, textAlign: "left" }}>All Students</h3>

        {/* Filters */}
        <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
          <label className="label">Sort</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="first">First</option>
            <option value="last">Last</option>
          </select>

          <label className="label">School</label>
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
          >
            {SCHOOL_LIST.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>

          <label className="label">Program</label>
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
          >
            {PROGRAM_LIST.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="muted">Loading…</div>
        ) : (
          <div className="report-table-scroll" style={{ maxHeight: 600 }}>
            <table className="report-table">
              <thead className="report-thead">
                <tr>
                  <th style={{ textAlign: "left" }}>Name</th>
                  <th style={{ textAlign: "left" }}>School</th>
                  <th style={{ textAlign: "left" }}>Program</th>
                  <th style={{ textAlign: "left" }}>Active</th>
                  <th style={{ textAlign: "left" }}>No-Bus</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>

              <tbody>
                {filteredSorted.map((st, idx) => (
                  <tr key={st.id} className={idx % 2 ? "row-alt" : ""}>
                    <td>{formatName(st)}</td>
                    <td>{st.school}</td>
                    <td>{st.school_year}</td>
                    <td>{st.active ? "Yes" : "No"}</td>
                    <td>{(st.no_bus_days || []).join(", ")}</td>
                    <td>
                      <button className="btn" onClick={() => fillForm(st)}>
                        Edit
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
// TAB 2: Approved Pickups
// ============================================================
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
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ marginBottom: 12, textAlign: "left" }}>
        Approved Pickups
      </h3>

      {busy ? (
        <div className="muted">Loading…</div>
      ) : (
        <table className="report-table">
          <thead className="report-thead">
            <tr>
              <th style={{ textAlign: "left", width: 220 }}>Student</th>
              <th style={{ textAlign: "left" }}>School</th>
              <th style={{ textAlign: "left" }}>Approved</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => (
              <ApprovedRow
                key={r.student_id}
                row={r}
                onSave={savePickups}
                index={idx}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ApprovedRow({ row, onSave, index }: any) {
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
    <tr className={index % 2 ? "row-alt" : ""}>
      <td style={{ whiteSpace: "nowrap" }}>{row.student_name}</td>
      <td>{row.school}</td>

      {editing ? (
        <td colSpan={2}>
          <div className="col" style={{ gap: 8 }}>
            {/* Bubble list */}
            <div className="row wrap" style={{ gap: 6 }}>
              {items.map((x: string, i: number) => (
                <span
                  key={i}
                  className="chip"
                  style={{
                    marginRight: 6,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 320,
                  }}
                >
                  {x}
                  <button
                    className="btn"
                    onClick={() =>
                      setItems((prev) =>
                        prev.filter((_, idx) => idx !== i)
                      )
                    }
                    style={{ marginLeft: 6 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            {/* Add input */}
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

            {/* Save / Cancel */}
            <div className="row" style={{ gap: 6 }}>
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
          <td style={{ whiteSpace: "nowrap" }}>
            {items.length === 0 ? (
              <span className="muted">None</span>
            ) : (
              items.map((x: string, i: number) => (
                <span
                  key={i}
                  className="chip"
                  style={{
                    marginRight: 6,
                    whiteSpace: "nowrap",
                  }}
                >
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
// TAB 3: STUDENT HISTORY  (EXACT REPORTS PAGE — Option A)
// ============================================================
//
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

  // Convert local datetime to EST→UTC ISO
  function estLocalToUtcIso(local: string): string | null {
    const [date, time] = local.split("T");
    if (!date || !time) return null;
    const [y, mo, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const desiredLocalMs = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
    let utcMs = desiredLocalMs;
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    for (let i = 0; i < 3; i++) {
      const parts = dtf.formatToParts(new Date(utcMs));
      const y2 = Number(parts.find((p) => p.type === "year")?.value);
      const m2 = Number(parts.find((p) => p.type === "month")?.value);
      const d2 = Number(parts.find((p) => p.type === "day")?.value);
      const h2 = Number(parts.find((p) => p.type === "hour")?.value);
      const n2 = Number(parts.find((p) => p.type === "minute")?.value);
      const rendered = Date.UTC(y2, m2 - 1, d2, h2, n2, 0, 0);
      const diff = desiredLocalMs - rendered;
      if (diff === 0) break;
      utcMs += diff;
    }
    return new Date(utcMs).toISOString();
  }

  async function saveTime(logId: number, action: string, local: string, currentMeta: any) {
    try {
      if (action === "checked") {
        // Use RPC
        const { error } = await supabase.rpc("rpc_set_log_pickup_time", {
          p_log_id: logId,
          p_pickup_time: local,
        });
        if (error) {
          // fallback to direct update
          const merged = { ...(currentMeta || {}), pickupTime: local };
          const { error: uerr } = await supabase
            .from("logs")
            .update({ meta: merged })
            .eq("id", logId);
          if (uerr) throw new Error("Update failed");
        }
      } else {
        const iso = estLocalToUtcIso(local) ?? new Date().toISOString();
        const { error } = await supabase.rpc("rpc_set_log_at", {
          p_log_id: logId,
          p_at_iso: iso,
        });
        if (error) {
          const { error: uerr } = await supabase
            .from("logs")
            .update({ at: iso })
            .eq("id", logId);
          if (uerr) throw new Error("Update failed");
        }
      }
      await run();
    } catch (e: any) {
      console.error("saveTime failed:", e);
      alert("Save failed: " + e.message);
    }
  }

  const fmtLocal = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ marginBottom: 12, textAlign: "left" }}>
        Student History
      </h3>

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
            <thead className="report-thead">
              <tr>
                <th style={{ textAlign: "left" }}>Date</th>
                <th style={{ textAlign: "left" }}>Action</th>
                <th style={{ textAlign: "left" }}>Time</th>
                <th style={{ textAlign: "left" }}>Edit</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r: any, idx: number) => {
                const base =
                  r.action === "checked" && r.meta?.pickupTime
                    ? r.meta.pickupTime
                    : r.at;

                const d = new Date(base);
                const nyDate = new Intl.DateTimeFormat("en-CA", {
                  timeZone: "America/New_York",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(d);

                const nyHM = new Intl.DateTimeFormat("en-GB", {
                  timeZone: "America/New_York",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(d);

                const localInput = `${nyDate}T${nyHM}`;

                return (
                  <tr key={r.id} className={idx % 2 ? "row-alt" : ""}>
                    <td>{r.roster_date}</td>
                    <td>{r.action}</td>
                    <td>{fmtLocal(base)}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <input
                          type="datetime-local"
                          defaultValue={localInput}
                          onChange={(e) =>
                            (r.__new = e.target.value)
                          }
                          style={{ minWidth: 200 }}
                        />
                        <button
                          className="btn"
                          onClick={() =>
                            saveTime(
                              r.id,
                              r.action,
                              r.__new || localInput,
                              r.meta
                            )
                          }
                        >
                          Save
                        </button>
                      </div>
                    </td>
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
