// src/pages/CenterPage.tsx
import React, { useMemo, useState } from 'react'
import { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  // sorted & filtered by parent already, just in case we still expose sorting/filtering here:
  selectedSchool: string // "All" | "Bain" | "QG" | "MHE" | "MC"
  search: string
  onSet: (id: string, st: Status) => void
}

function fullName(s: StudentRow) {
  return `${s.first_name} ${s.last_name}`
}

function byName(a: StudentRow, b: StudentRow) {
  return fullName(a).localeCompare(fullName(b))
}

export default function CenterPage({ students, roster, selectedSchool, search, onSet }: Props) {
  const [tab, setTab] = useState<'in' | 'out'>('in')

  // filter helpers used by both panels
  const matchesSchool = (s: StudentRow) =>
    selectedSchool === 'All' ? true : (s.school || '') === selectedSchool

  const matchesSearch = (s: StudentRow) =>
    search.trim().length === 0
      ? true
      : fullName(s).toLowerCase().includes(search.toLowerCase())

  // ---- Center Check-in (from Bus) ----
  // show students with roster status = picked
  const centerFromBus = useMemo(() => {
    return students
      .filter(matchesSchool)
      .filter(matchesSearch)
      .filter((s) => roster[s.id] === 'picked')
      .sort(byName)
  }, [students, roster, selectedSchool, search])

  // ---- Direct Check-in (No Bus) ----
  // show students who are *not* picked and *not* skipped (so they can be directly marked arrived)
  const directCheckin = useMemo(() => {
    return students
      .filter(matchesSchool)
      .filter(matchesSearch)
      .filter((s) => {
        const st = roster[s.id]
        return st !== 'picked' && st !== 'skipped' && st !== 'arrived' && st !== 'checked'
      })
      .sort(byName)
  }, [students, roster, selectedSchool, search])

  // ---- Checkout lists ----
  const toCheckout = useMemo(() => {
    return students
      .filter(matchesSchool)
      .filter(matchesSearch)
      .filter((s) => roster[s.id] === 'arrived')
      .sort(byName)
  }, [students, roster, selectedSchool, search])

  const checkedOut = useMemo(() => {
    return students
      .filter(matchesSchool)
      .filter(matchesSearch)
      .filter((s) => roster[s.id] === 'checked')
      .sort(byName)
  }, [students, roster, selectedSchool, search])

  return (
    <div className="two-col">
      {/* LEFT COLUMN */}
      <div className="card">
        <div className="seg" style={{ marginBottom: 10 }}>
          <button
            className={`seg-btn ${tab === 'in' ? 'on' : ''}`}
            onClick={() => setTab('in')}
          >
            Check-in
          </button>
          <button
            className={`seg-btn ${tab === 'out' ? 'on' : ''}`}
            onClick={() => setTab('out')}
          >
            Checkout
          </button>
        </div>

        {tab === 'in' ? (
          <>
            <h3 className="section-title">Center Check-in (from Bus)</h3>
            <div className="list">
              {centerFromBus.length === 0 && (
                <div className="muted">No students to check in from bus.</div>
              )}
              {centerFromBus.map((s) => (
                <div className="card-row sd-row" key={s.id}>
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">School: {s.school || '—'} | Picked</div>
                  </div>

                  {/* RIGHT-ALIGNED ACTIONS */}
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>
                      Mark Arrived
                    </button>
                    <button className="btn" onClick={() => onSet(s.id, 'not_picked')}>
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="section-title" style={{ marginTop: 16 }}>
              Direct Check-in (No Bus)
            </h3>
            <div className="list">
              {directCheckin.length === 0 && (
                <div className="muted">No students to check in directly.</div>
              )}
              {directCheckin.map((s) => (
                <div className="card-row sd-row" key={s.id}>
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">
                      School: {s.school || '—'} | {roster[s.id] === 'not_picked' ? 'Not Picked' : (roster[s.id] || 'Not Picked')}
                    </div>
                  </div>

                  {/* RIGHT-ALIGNED ACTIONS */}
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>
                      Mark Arrived
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h3 className="section-title">Checkout</h3>
            <div className="list">
              {toCheckout.length === 0 && (
                <div className="muted">No students to check out.</div>
              )}
              {toCheckout.map((s) => (
                <div className="card-row sd-row" key={s.id}>
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">School: {s.school || '—'} | Arrived</div>
                  </div>

                  {/* RIGHT-ALIGNED ACTIONS */}
                  <div className="sd-card-actions">
                    <button className="btn primary" onClick={() => onSet(s.id, 'checked')}>
                      Checkout
                    </button>
                    <button className="btn" onClick={() => onSet(s.id, 'picked')}>
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="section-title" style={{ marginTop: 16 }}>
              Checked Out
            </h3>
            <div className="list">
              {checkedOut.length === 0 && (
                <div className="muted">No students checked out.</div>
              )}
              {checkedOut.map((s) => (
                <div className="card-row sd-row" key={s.id}>
                  <div>
                    <div className="heading">{fullName(s)}</div>
                    <div className="sub">School: {s.school || '—'} | Checked-out</div>
                  </div>

                  {/* RIGHT-ALIGNED ACTIONS */}
                  <div className="sd-card-actions">
                    <button className="btn" onClick={() => onSet(s.id, 'arrived')}>
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* RIGHT COLUMN – stays empty here on Check-in tab because left column already splits both lists;
         if you had content, keep it here. We leave as an empty card to preserve the 2-column layout. */}
      <div className="card" style={{ visibility: 'hidden' }} />
    </div>
  )
}
