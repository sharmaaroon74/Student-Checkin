import React, { useMemo, useState } from 'react'
import type { Status, StudentRow } from '../types'
import TopToolbar from '../components/TopToolbar'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes: Record<string, string>
  onSet: (id: string, st: Status, meta?: any) => void
}

function fmtEST(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

export default function CenterPage({
  students,
  roster,
  rosterTimes,
  onSet,
}: Props) {
  const [schoolSel, setSchoolSel] =
    useState<'All' | 'Bain' | 'QG' | 'MHE' | 'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')
  const [tab, setTab] = useState<'in' | 'out'>('in')

  // ---------- BASE FILTER (used for GLOBAL COUNTS on every page) ----------
  const base = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = students.filter((s) => {
      if (schoolSel !== 'All' && s.school !== schoolSel) return false
      if (term) {
        const name = `${s.first_name} ${s.last_name}`.toLowerCase()
        if (!name.includes(term)) return false
      }
      return true
    })
    list.sort((a, b) =>
      sortBy === 'first'
        ? a.first_name.localeCompare(b.first_name)
        : a.last_name.localeCompare(b.last_name)
    )
    return list
  }, [students, schoolSel, q, sortBy])

  // ---------- GLOBAL COUNTS (same logic on all pages) ----------
  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      not_picked: 0,
      picked: 0,
      arrived: 0,
      checked: 0,
      skipped: 0,
    }
    for (const s of base) c[(roster[s.id] ?? 'not_picked') as Status]++
    return c
  }, [base, roster])

  // ---------- PAGE SECTIONS (unchanged behavior) ----------
  const fromBus = useMemo(
    () => base.filter((s) => (roster[s.id] as Status) === 'picked'),
    [base, roster]
  )

  const directNoBus = useMemo(
    () =>
      base.filter((s) => {
        const st = (roster[s.id] ?? 'not_picked') as Status
        return st === 'not_picked'
      }),
    [base, roster]
  )

  const toCheckout = useMemo(
    () => base.filter((s) => roster[s.id] === 'arrived'),
    [base, roster]
  )
  const checkedOut = useMemo(
    () => base.filter((s) => roster[s.id] === 'checked'),
    [base, roster]
  )

  const clearSearch = () => setQ('')

  return (
    <div className="page container">
      <TopToolbar
        schoolSel={schoolSel}
        onSchoolSel={setSchoolSel}
        search={q}
        onSearch={setQ}
        sortBy={sortBy}
        onSortBy={setSortBy}
        counts={counts}
      />

      {/* tab toggle */}
      <div className="toolbar-bg row gap" style={{ marginBottom: 10 }}>
        <button
          className={`btn ${tab === 'in' ? 'primary' : ''}`}
          onClick={() => setTab('in')}
        >
          Check-in
        </button>
        <button
          className={`btn ${tab === 'out' ? 'primary' : ''}`}
          onClick={() => setTab('out')}
        >
          Checkout
        </button>
      </div>

      {tab === 'in' ? (
        <div className="two-col">
          <div className="card">
            <h3 className="section-title">Center Check-in (from Bus)</h3>
            <div className="list">
              {fromBus.length === 0 && (
                <div className="muted">No students to check in from bus.</div>
              )}
              {fromBus.map((s) => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="sub">
                      School: {s.school} | Picked{' '}
                      {fmtEST(rosterTimes[s.id]) && `• ${fmtEST(rosterTimes[s.id])}`}
                    </div>
                  </div>
                  <div className="sd-card-actions">
                    <button
                      className="btn primary"
                      onClick={() => {
                        onSet(s.id, 'arrived')
                        clearSearch()
                      }}
                    >
                      Mark Arrived
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        onSet(s.id, 'not_picked')
                        clearSearch()
                      }}
                    >
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Direct Check-in (No Bus)</h3>
            <div className="list">
              {directNoBus.length === 0 && (
                <div className="muted">No students to check in directly.</div>
              )}
              {directNoBus.map((s) => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="sub">School: {s.school} | Not Picked</div>
                  </div>
                  <div className="sd-card-actions">
                    <button
                      className="btn primary"
                      onClick={() => {
                        onSet(s.id, 'arrived')
                        clearSearch()
                      }}
                    >
                      Mark Arrived
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="two-col">
          <div className="card">
            <h3 className="section-title">Checkout</h3>
            <div className="list">
              {toCheckout.length === 0 && (
                <div className="muted">No students ready to checkout.</div>
              )}
              {toCheckout.map((s) => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="sub">
                      School: {s.school} | Arrived{' '}
                      {fmtEST(rosterTimes[s.id]) && `• ${fmtEST(rosterTimes[s.id])}`}
                    </div>
                  </div>
                  <div className="sd-card-actions">
                    <button
                      className="btn primary"
                      onClick={() => {
                        onSet(s.id, 'checked')
                        clearSearch()
                      }}
                    >
                      Checkout
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        onSet(s.id, 'picked')
                        clearSearch()
                      }}
                    >
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Checked Out</h3>
            <div className="list">
              {checkedOut.length === 0 && (
                <div className="muted">No students checked out.</div>
              )}
              {checkedOut.map((s) => (
                <div key={s.id} className="card-row sd-row">
                  <div>
                    <div className="heading">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="sub">School: {s.school} | Checked-out</div>
                  </div>
                  <div className="sd-card-actions">
                    <button
                      className="btn"
                      onClick={() => {
                        onSet(s.id, 'arrived')
                        clearSearch()
                      }}
                    >
                      Undo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
