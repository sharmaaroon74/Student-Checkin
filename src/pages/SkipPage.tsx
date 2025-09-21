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

function nameOf(s: StudentRow) { return `${s.first_name} ${s.last_name}` }
function fmtEST(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
  } catch { return '' }
}
function subtitleFor(s: StudentRow, st: Status | undefined, t?: string) {
  const base = `School: ${s.school} | ${
    st==='checked'?'Checked Out': st==='arrived'?'Arrived': st==='picked'?'Picked': st==='skipped'?'Skipped':'Not Picked'
  }`
  if (st==='picked' || st==='arrived' || st==='checked') {
    const time = fmtEST(t); return time ? `${base} : ${time}` : base
  }
  return base
}
function StudentRowCard({ s, subtitle, actions }:{
  s: StudentRow; subtitle: React.ReactNode; actions?: React.ReactNode
}) {
  return (
    <div className="sd-card sd-card-row">
      <div className="sd-card-main">
        <div className="title">{nameOf(s)}</div>
        <div className="muted">{subtitle}</div>
      </div>
      <div className="sd-card-actions">{actions}</div>
    </div>
  )
}

export default function SkipPage({ students, roster, rosterTimes, onSet }: Props) {
  const [school, setSchool] = useState<string>('All')
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('first')

  const act = useCallback((id: string, st: Status, meta?: any) => {
    setQ('')
    onSet(id, st, meta)
  }, [onSet])

  const sorted = useMemo(() => {
    const arr = students.filter(s => s.active)
    arr.sort((a, b) => {
      const A = sortKey === 'first' ? a.first_name : a.last_name
      const B = sortKey === 'first' ? b.first_name : b.last_name
      return A.localeCompare(B, undefined, { sensitivity:'base' })
    })
    return arr
  }, [students, sortKey])

  const matches = useCallback((s: StudentRow) => {
    if (school!=='All' && s.school!==school) return false
    if (q) {
      const hay = `${s.first_name} ${s.last_name}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }, [school, q])

  const filtered = useMemo(() => sorted.filter(matches), [sorted, matches])

  const counts = useMemo(() => {
    let not_picked = 0, picked = 0, arrived = 0, checked = 0, skipped = 0
    for (const s of filtered) {
      const st = roster[s.id] ?? 'not_picked'
      if (st === 'picked') picked++
      else if (st === 'arrived') arrived++
      else if (st === 'checked') checked++
      else if (st === 'skipped') skipped++
      else not_picked++
    }
    return { not_picked, picked, arrived, checked, skipped }
  }, [filtered, roster])

  const canSkip = useMemo(
    () => filtered.filter(s => {
      const st = roster[s.id]
      return (!st || st==='not_picked')
    }),
    [filtered, roster]
  )

  const skipped = useMemo(
    () => filtered.filter(s => roster[s.id]==='skipped'),
    [filtered, roster]
  )

  return (
    <div className="panel">
      {/* Filters */}
      <div className="row gap wrap" style={{ marginBottom: 8 }}>
        <div className="seg seg-scroll">
          <button className={'seg-btn' + (school==='All'?' on':'')} onClick={()=>setSchool('All')}>All</button>
          {SCHOOLS.map(sch=>(
            <button key={sch} className={'seg-btn' + (school===sch?' on':'')} onClick={()=>setSchool(sch)}>{sch}</button>
          ))}
        </div>
        <div className="stack-sm">
          <input className="w-full" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student…"/>
          <div className="row gap sort-row">
            <span className="muted">Sort</span>
            <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}>
              <option value="first">First Name</option>
              <option value="last">Last Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Counts */}
      <div className="row gap wrap counts-row">
        <span className="chip">To Pick <b>{counts.not_picked}</b></span>
        <span className="chip">Picked <b>{counts.picked}</b></span>
        <span className="chip">Arrived <b>{counts.arrived}</b></span>
        <span className="chip">Checked Out <b>{counts.checked}</b></span>
        <span className="chip">Skipped <b>{counts.skipped}</b></span>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Mark Skip Today</h3>
          {canSkip.length===0 ? <div className="muted">No students eligible to skip.</div> : (
            canSkip.map(s=>(
              <StudentRowCard
                key={s.id}
                s={s}
                subtitle={subtitleFor(s, roster[s.id], rosterTimes[s.id])}
                actions={<button className="btn btn-mobile" onClick={()=>act(s.id,'skipped')}>Skip Today</button>}
              />
            ))
          )}
        </div>

        <div className="card">
          <h3>Skipped Today</h3>
          {skipped.length===0 ? <div className="muted">No students skipped.</div> : (
            skipped.map(s=>(
              <StudentRowCard
                key={s.id}
                s={s}
                subtitle={subtitleFor(s, roster[s.id], rosterTimes[s.id])}
                actions={<button className="btn btn-mobile" onClick={()=>act(s.id,'not_picked')}>Unskip Today</button>}
              />
            ))
          )}
        </div>
      </div>

      {/* Mobile CSS helpers */}
      <style>{`
        .two-col { display:grid; grid-template-columns: 1fr; gap:16px; }
        @media (min-width: 768px) { .two-col { grid-template-columns: 1fr 1fr; } }

        .seg-scroll { overflow-x:auto; white-space:nowrap; padding-bottom:4px; }

        .stack-sm { display:flex; flex-direction:column; gap:8px; flex:1; min-width:220px; }
        .sort-row { align-items:center; }

        .counts-row { margin: 10px 0 14px; }

        .sd-card.sd-card-row { display:flex; gap:12px; align-items:center; }
        .sd-card-main { min-width:0; flex:1; }
        .sd-card-actions { display:flex; gap:8px; margin-left:auto; }
        @media (max-width: 767px) {
          .sd-card.sd-card-row { flex-direction:column; align-items:stretch; }
          .sd-card-actions { margin-left:0; }
          .btn-mobile { width:100%; min-height:40px; }
        }

        .chip {
          display:inline-flex; align-items:center; gap:6px;
          padding:2px 8px; border:1px solid #e5e7eb; border-radius:999px;
          font-size:12px; background:#fff;
        }
        .chip b { font-weight:600 }
      `}</style>
    </div>
  )
}
