// src/pages/BusPage.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { StudentRow, Status } from '../types'
import { todayKeyEST } from '../lib/date'

type AllowedSchool = 'Bain' | 'QG' | 'MHE' | 'MC'

type StudentVM = {
  id: string
  first: string
  last: string
  name: string
  school: string
  status: Status
  active: boolean
  school_year?: string | null
}

const fmtEST = (iso?: string) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' EST'
  } catch { return '' }
}

const ALLOWED_SCHOOLS: AllowedSchool[] = ['Bain', 'QG', 'MHE', 'MC']
const BUS_ALLOWED_PROGRAMS: string[] = [
  'FT - A', 'FT - B/A', 'PT3 - A - TWR', 'PT3 - A - MWF', 'PT2 - A - WR', 'PT3 - A - TWF'
]

function RowBus({
  s, onPick, onSkip, lastUpdateIso, forceHideTime
}: {
  s: StudentVM
  onPick: (id: string) => void
  onSkip: (id: string) => void
  lastUpdateIso?: string
  forceHideTime?: boolean
}) {
  // Bus page: hide time for picked/skipped/not_picked
  const defaultHide = s.status === 'picked' || s.status === 'skipped' || s.status === 'not_picked'
  const showTime = !forceHideTime && !defaultHide
  const time = showTime ? fmtEST(lastUpdateIso) : ''
  return (
    <div className="item">
      <div>
        <div className="heading">{s.name}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {s.school} • Status: <b>{s.status}</b>{time ? ` — ${time}` : ''}
        </div>
      </div>
      <div className="row">
        <button className="btn small" onClick={() => onPick(s.id)} disabled={s.status !== 'not_picked'}>Picked</button>
        {/* In 'To Pick Up', this is Skip / in 'Skipped Today', this acts as Unskip */}
        <button className="btn small" onClick={() => onSkip(s.id)}>{s.status === 'skipped' ? 'Unskip' : 'Skip'}</button>
        {/* ❌ Undo button removed per request */}
      </div>
    </div>
  )
}

export default function BusPage({
  students, roster, onSet
}: {
  students: StudentRow[],
  roster: Record<string, Status>,
  onSet: (id: string, st: Status) => void
}) {
  const [school, setSchool] = useState<AllowedSchool | 'All'>('All')
  const [lastUpdateMap, setLastUpdateMap] = useState<Record<string, string>>({})
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  const [q, setQ] = useState('')

  // Load timestamps for time badges
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('roster_status')
        .select('student_id,last_update')
        .eq('roster_date', todayKeyEST())
      const m: Record<string, string> = {}
      ;(data || []).forEach((r: any) => { m[r.student_id] = r.last_update })
      setLastUpdateMap(m)
    })()
  }, [roster])

  const vm = useMemo<StudentVM[]>(
    () =>
      students.map((s) => ({
        id: s.id,
        first: s.first_name,
        last:  s.last_name,
        name:  s.first_name + ' ' + s.last_name,
        school: (s.school as any) ?? '',
        status: roster[s.id] ?? 'not_picked',
        active: s.active,
        school_year: (s as any).school_year ?? null
      })),
    [students, roster]
  )

  const sortFn = (a: StudentVM, b: StudentVM) =>
    sortBy === 'first'
      ? a.first.localeCompare(b.first) || a.last.localeCompare(b.last)
      : a.last.localeCompare(b.last) || a.first.localeCompare(b.first)

  const qlc = q.trim().toLowerCase()
  const matchesSearch = (s: StudentVM) => !qlc || s.first.toLowerCase().includes(qlc) || s.last.toLowerCase().includes(qlc)

  const bySchool = vm.filter(s => (school === 'All' || s.school === school) && matchesSearch(s))

  // To Pick Up (only not_picked + allowed schools/programs + active)
  const toPickup = bySchool.filter(s =>
    s.status === 'not_picked'
    && s.active === true
    && ALLOWED_SCHOOLS.includes(s.school as AllowedSchool)
    && (s.school_year ? BUS_ALLOWED_PROGRAMS.includes(s.school_year) : false)
  ).sort(sortFn)

  const skipped = bySchool.filter(s => s.status === 'skipped').sort(sortFn)

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="row spread">
          <h3 className="heading">Bus Pickup</h3>
          <div className="row">
            {(['All', 'Bain', 'QG', 'MHE', 'MC'] as const).map(sc => (
              <button key={sc} className={'chip ' + (school === sc ? 'active' : '')} onClick={() => setSchool(sc as any)}>{sc}</button>
            ))}
            <div className="row" style={{ marginLeft: 8 }}>
              <span className="muted" style={{ marginRight: 6 }}>Sort</span>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}>
                <option value="first">First name</option>
                <option value="last">Last name</option>
              </select>
            </div>
            <input
              placeholder="Search name…"
              value={q}
              onChange={e=>setQ(e.target.value)}
              style={{ marginLeft: 8, minWidth: 180 }}
            />
          </div>
        </div>

        <div className="list" style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>TO PICK UP</div>
          {toPickup.map(s => (
            <RowBus
              key={s.id}
              s={s}
              onPick={(id) => onSet(id, 'picked')}
              onSkip={(id) => onSet(id, s.status === 'skipped' ? 'not_picked' : 'skipped')}
              lastUpdateIso={lastUpdateMap[s.id]}
              forceHideTime={true}
            />
          ))}
          {!toPickup.length && <div className="muted">No students meet today’s pickup filters</div>}
        </div>
      </div>

      <div className="card">
        <h3 className="heading">Skipped Today</h3>
        <div className="list" style={{ marginTop: 12 }}>
          {skipped.map(s => (
            <RowBus
              key={s.id}
              s={s}
              onPick={(id) => onSet(id, 'picked')}
              onSkip={(id) => onSet(id, 'not_picked')}
              lastUpdateIso={lastUpdateMap[s.id]}
            />
          ))}
          {!skipped.length && <div className="muted">None</div>}
        </div>
      </div>
    </div>
  )
}
