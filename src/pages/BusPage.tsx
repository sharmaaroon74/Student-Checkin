import React, { useMemo, useState, useCallback } from 'react'
import type { Status, StudentRow } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  rosterTimes: Record<string, string>
  onSet: (id: string, st: Status, meta?: any) => void
}

type SortKey = 'first' | 'last'
const SCHOOLS = ['Bain', 'QG', 'MHE', 'MC'] as const

function nameOf(s: StudentRow) {
  return `${s.first_name} ${s.last_name}`
}

function fmtEST(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function subtitleFor(s: StudentRow, st: Status | undefined, t?: string) {
  const base =
    `School: ${s.school} | ` +
    (st === 'picked' ? 'Picked' :
     st === 'arrived' ? 'Arrived' :
     st === 'checked' ? 'Checked Out' :
     st === 'skipped' ? 'Skipped' :
     'Not Picked')
  if (st === 'picked' || st === 'arrived' || st === 'checked') {
    const time = fmtEST(t)
    return time ? `${base} : ${time}` : base
  }
  return base
}

function StudentRowCard({
  s, subtitle, actions,
}: { s: StudentRow; subtitle: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="card row between" style={{ alignItems:'center' }}>
      <div>
        <div className="title">{nameOf(s)}</div>
        <div className="muted">{subtitle}</div>
      </div>
      <div className="row gap">{actions}</div>
    </div>
  )
}

export default function BusPage({ students, roster, rosterTimes, onSet }: Props) {
  const [school, setSchool] = useState<string>('All') // single select like Skip/Center
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('first')

  // Search clears on any action for speed
  const act = useCallback((id: string, st: Status, meta?: any) => {
    setQ('')
    onSet(id, st, meta)
  }, [onSet])

  const sorted = useMemo(() => {
    const arr = students.filter(s => s.active)
    arr.sort((a, b) => {
      const A = sortKey === 'first' ? a.first_name : a.last_name
      const B = sortKey === 'first' ? b.first_name : b.last_name
      return A.localeCompare(B, undefined, { sensitivity: 'base' })
    })
    return arr
  }, [students, sortKey])

  const matches = useCallback((s: StudentRow) => {
    if (school !== 'All' && s.school !== school) return false
    if (q) {
      const hay = `${s.first_name} ${s.last_name}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }, [school, q])

  // Panels (respect filters)
  const toPick = useMemo(
    () => sorted.filter(s => {
      const st = roster[s.id]
      return (!st || st === 'not_picked') && matches(s)
    }),
    [sorted, roster, matches]
  )

  const skipped = useMemo(
    () => sorted.filter(s => roster[s.id] === 'skipped' && matches(s)),
    [sorted, roster, matches]
  )

  // Count for picked (meta only)
  const pickedCount = useMemo(
    () => sorted.filter(s => roster[s.id] === 'picked' && matches(s)).length,
    [sorted, roster, matches]
  )

  const twoCol: React.CSSProperties = {
    display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start'
  }

  return (
    <div className="panel">
      {/* Page filters */}
      <div className="row gap wrap" style={{ marginBottom: 10 }}>
        <div className="seg">
          <button className={'seg-btn' + (school==='All'?' on':'')} onClick={()=>setSchool('All')}>All</button>
          {SCHOOLS.map(sch=>(
            <button key={sch} className={'seg-btn' + (school===sch?' on':'')} onClick={()=>setSchool(sch)}>{sch}</button>
          ))}
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student…" style={{ flex:1, minWidth:220 }}/>
        <div className="row gap" style={{ alignItems:'center' }}>
          <span className="muted">Sort</span>
          <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}>
            <option value="first">First Name</option>
            <option value="last">Last Name</option>
          </select>
        </div>
      </div>

      {/* Page tiles */}
      <div className="row gap" style={{ marginBottom: 8 }}>
        <div className="tile">To Pick <strong>{toPick.length}</strong></div>
        <div className="tile">Skipped Today <strong>{skipped.length}</strong></div>
        <div className="tile">Picked <strong>{pickedCount}</strong></div>
      </div>

      <div style={twoCol}>
        {/* Bus Pickup */}
        <div className="card">
          <h3>Bus Pickup <span className="badge">{toPick.length}</span></h3>
          {toPick.length===0 ? <div className="muted">No students to pick up.</div> : (
            toPick.map(s=>(
              <StudentRowCard
                key={s.id}
                s={s}
                subtitle={subtitleFor(s, roster[s.id], rosterTimes[s.id])}
                actions={
                  <>
                    <button className="btn primary" onClick={()=>act(s.id,'picked')}>Mark Picked</button>
                    {/* No Skip button here per your rule */}
                  </>
                }
              />
            ))
          )}
        </div>

        {/* Skipped Today */}
        <div className="card">
          <h3>Skipped Today <span className="badge">{skipped.length}</span></h3>
          {skipped.length===0 ? <div className="muted">No students skipped today.</div> : (
            skipped.map(s=>(
              <StudentRowCard
                key={s.id}
                s={s}
                subtitle={subtitleFor(s, roster[s.id], rosterTimes[s.id])}
                actions={
                  // Only Unskip Today (no Pick button here)
                  <button className="btn" onClick={()=>act(s.id,'not_picked')}>Unskip Today</button>
                }
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
