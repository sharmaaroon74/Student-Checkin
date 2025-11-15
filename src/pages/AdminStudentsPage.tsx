// ===============================================
// src/pages/AdminStudentsPage.tsx
// ===============================================
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";

/* ============================================================
   HELPERS (for Student History DST-safe time editing)
============================================================ */
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
    const p = dtf.formatToParts(new Date(utcMs));
    const y2 = Number(p.find((x) => x.type === "year")?.value);
    const m2 = Number(p.find((x) => x.type === "month")?.value);
    const d2 = Number(p.find((x) => x.type === "day")?.value);
    const h2 = Number(p.find((x) => x.type === "hour")?.value);
    const n2 = Number(p.find((x) => x.type === "minute")?.value);

    const rendered = Date.UTC(y2, m2 - 1, d2, h2, n2, 0, 0);
    const diff = desiredLocalMs - rendered;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs).toISOString();
}

/* ============================================================
   TYPES
============================================================ */
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
      {/* Seg Buttons */}
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

      {tab === "students" && <StudentsManager />}
      {tab === "approved" && <ApprovedPickupsTab />}
      {tab === "history" && <StudentHistoryTab />}
    </div>
  );
}

/* ============================================================
   TAB 1 — STUDENTS MANAGER  (UNCHANGED — LOCKED)
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
      await supabase.from("students").update(payload).eq("id", editingId);
    }

    resetForm();
    loadStudents();
  }

  function toggleNoBus(day: string) {
    setNoBusDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

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
      const A =
        sortBy === "first"
          ? `${a.first_name} ${a.last_name}`.toLowerCase()
          : a.last_name.toLowerCase();
      const B =
        sortBy === "first"
          ? `${b.first_name} ${b.last_name}`.toLowerCase()
          : b.last_name.toLowerCase();
      return A.localeCompare(B);
    });

    return out;
  }, [students, search, sortBy, schoolFilter]);

  return (
    <div className="two-col" style={{ gap: 28 }}>
      {/* LEFT — FORM (UNCHANGED) */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ marginBottom: 20 }}>
          {editingId ? "Edit Student" : "Add Student"}
        </h3>

        <div
          className="col"
          style={{
            gap: 18,
            background: "#fafafa",
            padding: 20,
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        >
          <div className="row" style={{ gap: 16 }}>
            <div className="col" style={{ flex: 1 }}>
              <label className="label" style={{ marginBottom: 4 }}>
                First Name
              </label>
              <input
                style={{ width: "100%" }}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="col" style={{ flex: 1 }}>
              <label className="label" style={{ marginBottom: 4 }}>
                Last Name
              </label>
              <input
                style={{ width: "100%" }}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <label className="label" style={{ marginBottom: 4 }}>
            School
          </label>
          <input
            style={{ width: "100%" }}
            value={school}
            onChange={(e) => setSchool(e.target.value)}
          />

          <label className="label" style={{ marginBottom: 4 }}>
            Program (School Year)
          </label>
          <input
            style={{ width: "100%" }}
            value={program}
            onChange={(e) => setProgram(e.target.value)}
          />

          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <label className="label">Active</label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </div>

          <label className="label" style={{ marginBottom: 4 }}>
            No-Bus Days
          </label>
          <div className="row wrap" style={{ gap: 10 }}>
            {weekdayOptions.map((d: string) => (
              <label
                key={d}
                className="chip"
                style={{ padding: "6px 10px", width: 48, textAlign: "center" }}
              >
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

          <div className="row" style={{ marginTop: 16, gap: 12 }}>
            <button className="btn primary" onClick={saveStudent}>
              {editingId ? "Save Changes" : "Add Student"}
            </button>
            <button className="btn" onClick={resetForm}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT — TABLE (UNCHANGED) */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ marginBottom: 16 }}>All Students</h3>

        <div className="row wrap" style={{ gap: 12, marginBottom: 16 }}>
          <input
            placeholder="Search name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 160 }}
          />

          <label className="label">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
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
                  <th style={{ width: 180, textAlign: "left" }}>Name</th>
                  <th>School</th>
                  <th>Program</th>
                  <th>Active</th>
                  <th>No-Bus</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((st, i) => (
                  <tr key={st.id} style={{ background: i % 2 ? "#f7f7f7" : "#fff" }}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {sortBy === "last"
                        ? `${st.last_name}, ${st.first_name}`
                        : `${st.first_name} ${st.last_name}`}
                    </td>
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

/* ============================================================
   TAB 2 — APPROVED PICKUPS (FIXED)
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
    const clean = newList.map((x: string) => x.trim()).filter(Boolean);

    // 1) Try RPC (exact old behavior)
    const { error } = await supabase.rpc("rpc_update_student_approved_pickups", {
      p_student_id: row.student_id,
      p_pickups: clean,
    });

    // 2) Fallback direct update
    if (error) {
      const { error: uErr } = await supabase
        .from("students")
        .update({ approved_pickups: clean })
        .eq("id", row.student_id);

      if (uErr) {
        console.error("Approved pickups update failed", uErr);
        alert("Save failed.");
        return;
      }
    }

    // 3) Update UI
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
              <th style={{ width: 180, textAlign: "left" }}>Student</th>
              <th>School</th>
              <th>Approved</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <ApprovedRow key={r.student_id} row={r} index={i} onSave={savePickups} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ApprovedRow({
  row,
  index,
  onSave,
}: {
  row: any;
  index: number;
  onSave: (row: any, list: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<string[]>([...row.approved_pickups]);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    setItems((prev) => [...prev, v]);
    setDraft("");
  }

  return (
    <tr style={{ background: index % 2 ? "#f7f7f7" : "#fff" }}>
      <td style={{ width: 180, whiteSpace: "nowrap" }}>{row.student_name}</td>
      <td>{row.school}</td>

      {editing ? (
        <td colSpan={2}>
          <div className="col" style={{ gap: 8 }}>
            <div
              className="row wrap"
              style={{
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {items.map((x: string, i: number) => (
                <span
                  key={i}
                  className="chip"
                  style={{
                    marginRight: 4,
                    display: "inline-block",
                  }}
                >
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
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Add name"
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
            <div
              className="row wrap"
              style={{ gap: 6, flexWrap: "wrap" }}
            >
              {row.approved_pickups.length === 0 ? (
                <span className="muted">None</span>
              ) : (
                row.approved_pickups.map((x: string, i: number) => (
                  <span
                    key={i}
                    className="chip"
                    style={{
                      marginRight: 6,
                      display: "inline-block",
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {x}
                  </span>
                ))
              )}
            </div>
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

/* ============================================================
   TAB 3 — STUDENT HISTORY (FULL EDITING RESTORED)
============================================================ */
function StudentHistoryTab() {
  const [studentId, setStudentId] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);

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
      .select("id, roster_date, action, at, meta")
      .eq("student_id", studentId)
      .gte("roster_date", start)
      .lte("roster_date", end)
      .order("roster_date")
      .order("at");

    const fixed = (data || []).map((r: any) => {
      const base =
        r.action === "checked" && r.meta?.pickupTime
          ? r.meta.pickupTime
          : r.at;

      return {
        ...r,
        baseTime: base,
      };
    });

    setRows(fixed);
    setLoading(false);
  }

  async function saveTime(row: any) {
    const newLocal = row.__new;
    if (!newLocal) return;

    try {
      if (row.action === "checked") {
        const { error } = await supabase.rpc("rpc_set_log_pickup_time", {
          p_log_id: row.id,
          p_pickup_time: newLocal,
        });

        if (error) {
          const merged = { ...(row.meta || {}), pickupTime: newLocal };
          const { error: uErr } = await supabase
            .from("logs")
            .update({ meta: merged })
            .eq("id", row.id);

          if (uErr) throw new Error("Direct update failed");
        }
      } else {
        const iso = estLocalToUtcIso(newLocal) || new Date().toISOString();

        const { error } = await supabase.rpc("rpc_set_log_at", {
          p_log_id: row.id,
          p_at_iso: iso,
        });

        if (error) {
          const { error: uErr } = await supabase
            .from("logs")
            .update({ at: iso })
            .eq("id", row.id);

          if (uErr) throw new Error("Direct update failed");
        }
      }

      await run();
    } catch (e: any) {
      console.error("Save time failed", e);
      alert("Save failed");
    }
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ marginBottom: 16 }}>Student History</h3>

      <div className="row wrap" style={{ gap: 12, marginBottom: 16 }}>
        <label className="label">Student</label>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">— Select —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <label className="label">From</label>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />

        <label className="label">To</label>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />

        <button className="btn" onClick={run}>
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="muted">No logs.</div>
      ) : (
        <div className="report-table-scroll" style={{ maxHeight: 520 }}>
          <table className="report-table">
            <thead>
              <tr style={{ background: "#e6e6e6" }}>
                <th>Date</th>
                <th>Action</th>
                <th>Time</th>
                <th>Edit</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r: any, i: number) => {
                const d = new Date(r.baseTime);
                const ymd = new Intl.DateTimeFormat("en-CA", {
                  timeZone: "America/New_York",
                }).format(d);
                const hm = new Intl.DateTimeFormat("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/New_York",
                }).format(d);
                const localInput = `${ymd}T${hm}`;

                return (
                  <tr key={r.id} style={{ background: i % 2 ? "#f7f7f7" : "#fff" }}>
                    <td>{r.roster_date}</td>
                    <td>{r.action}</td>
                    <td>
                      {new Intl.DateTimeFormat("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "America/New_York",
                      }).format(new Date(r.baseTime))}
                    </td>

                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <input
                          type="datetime-local"
                          defaultValue={localInput}
                          onChange={(e) => (r.__new = e.target.value)}
                        />
                        <button className="btn" onClick={() => saveTime(r)}>
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
