// src/pages/AdminStudentsPage.tsx
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

type Student = {
  id: string | null;
  first_name: string;
  last_name: string;
  school: string;
  school_year: string;
  active: boolean;
  no_bus_M: boolean;
  no_bus_T: boolean;
  no_bus_W: boolean;
  no_bus_R: boolean;
  no_bus_F: boolean;
};

export default function AdminStudentsPage() {
  const emptyForm: Student = {
    id: null,
    first_name: "",
    last_name: "",
    school: "",
    school_year: "",
    active: true,
    no_bus_M: false,
    no_bus_T: false,
    no_bus_W: false,
    no_bus_R: false,
    no_bus_F: false,
  };

  const [form, setForm] = useState<Student>(emptyForm);
  const [students, setStudents] = useState<Student[]>([]);

  async function load() {
    const { data, error } = await supabase
      .from("students")
      .select(
        "id, first_name, last_name, school, school_year, active, no_bus_M, no_bus_T, no_bus_W, no_bus_R, no_bus_F"
      )
      .order("first_name", { ascending: true });

    if (!error && data) {
      setStudents(data as Student[]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      school: form.school.trim(),
      school_year: form.school_year.trim(),
      active: form.active,
      no_bus_M: form.no_bus_M,
      no_bus_T: form.no_bus_T,
      no_bus_W: form.no_bus_W,
      no_bus_R: form.no_bus_R,
      no_bus_F: form.no_bus_F,
    };

    let error;

    if (!form.id) {
      // INSERT
      const { error: err } = await supabase.from("students").insert(payload);
      error = err;
    } else {
      // UPDATE
      const { error: err } = await supabase
        .from("students")
        .update(payload)
        .eq("id", form.id);
      error = err;
    }

    if (error) {
      console.error("[AdminStudents] save error:", error);
      alert("Save failed.");
      return;
    }

    setForm(emptyForm);
    load();
  }

  function edit(stu: Student) {
    setForm({
      id: stu.id,
      first_name: stu.first_name,
      last_name: stu.last_name,
      school: stu.school ?? "",
      school_year: stu.school_year ?? "",
      active: stu.active,
      no_bus_M: stu.no_bus_M,
      no_bus_T: stu.no_bus_T,
      no_bus_W: stu.no_bus_W,
      no_bus_R: stu.no_bus_R,
      no_bus_F: stu.no_bus_F,
    });
  }

  const noBusBubble = (key: keyof Student, label: string) => (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginRight: 12,
      }}
    >
      <div
        style={{
          background: "#e6f3ff",
          borderRadius: 40,
          padding: "10px 14px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <input
          type="checkbox"
          checked={form[key] as boolean}
          onChange={(e) =>
            setForm((p) => ({ ...p, [key]: e.target.checked }))
          }
        />
      </div>
      <span style={{ fontSize: 13, marginTop: 2 }}>{label}</span>
    </label>
  );

  return (
    <div className="page">
      {/* ---------- Add Student Card ---------- */}
      <div className="card" style={{ padding: 20 }}>
        <h2 className="section-title" style={{ marginBottom: 15, textAlign: "left" }}>
          {form.id ? "Edit Student" : "Add Student"}
        </h2>

        <div className="col" style={{ maxWidth: 480, gap: 14 }}>
          {/* Name Row */}
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="label">First Name</label>
              <input
                value={form.first_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, first_name: e.target.value }))
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Last Name</label>
              <input
                value={form.last_name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, last_name: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label className="label">School</label>
            <input
              value={form.school}
              onChange={(e) =>
                setForm((p) => ({ ...p, school: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="label">Program (School Year)</label>
            <input
              value={form.school_year}
              onChange={(e) =>
                setForm((p) => ({ ...p, school_year: e.target.value }))
              }
            />
          </div>

          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <label className="label">Active</label>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((p) => ({ ...p, active: e.target.checked }))
              }
            />
          </div>

          {/* No-Bus Day Bubbles */}
          <div className="row" style={{ alignItems: "center", marginTop: 10 }}>
            <span className="label" style={{ marginRight: 8 }}>
              No-Bus Days:
            </span>
            {noBusBubble("no_bus_M", "M")}
            {noBusBubble("no_bus_T", "T")}
            {noBusBubble("no_bus_W", "W")}
            {noBusBubble("no_bus_R", "R")}
            {noBusBubble("no_bus_F", "F")}
          </div>

          {/* Buttons */}
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button className="btn primary" onClick={save}>
              {form.id ? "Save Changes" : "Add Student"}
            </button>
            <button className="btn" onClick={() => setForm(emptyForm)}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Students Table ---------- */}
      <div className="card" style={{ marginTop: 30 }}>
        <h3 className="section-title" style={{ textAlign: "left" }}>
          All Students
        </h3>

        <table className="sd-table" style={{ width: "100%", marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>First</th>
              <th style={{ textAlign: "left" }}>Last</th>
              <th style={{ textAlign: "left" }}>School</th>
              <th style={{ textAlign: "left" }}>Program</th>
              <th style={{ textAlign: "left" }}>Active</th>
              <th style={{ textAlign: "left" }}>No-Bus</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {students.map((s) => (
              <tr key={s.id || ""}>
                <td>{s.first_name}</td>
                <td>{s.last_name}</td>
                <td>{s.school}</td>
                <td>{s.school_year}</td>
                <td>{s.active ? "Yes" : "No"}</td>
                <td>
                  {["M", "T", "W", "R", "F"]
                    .filter((d) => s[`no_bus_${d}` as keyof Student])
                    .join(", ")}
                </td>
                <td>
                  <button className="btn" onClick={() => edit(s)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
