import React, { useEffect, useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'
import { supabase } from '../lib/supabase'

type StudentVM = {
  id: string
  name: string
  school: string // allow any text school
  status: Status
  active: boolean
  school_year?: string | null
}

const todayKey = () => new Date().toISOString().slice(0, 10)
const fmtEST = (iso?: string) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' EST'
  } catch {
    return ''
  }
}

const ALLOWED_SCHOOLS: string[] = ['Bain', 'QG', 'MHE', 'MC']
const BUS_ALLOWED_PROGRAMS: string[] = [
  'FT - A', 'FT - B/A',
  'PT3 - A - TWR', 'PT3 - A - MWF',
  'PT2 - A - WR', 'PT3 - A - TWF'
]

function RowBus({
  s, onPick, onSkip, onUndo, lastUpdateIso
}: {
  s: StudentVM
  onPick: (id: string) => void
  onSkip: (id: string) => void
  onUndo: (id: string) => void
  lastUpdateIso?: string
}) {
  const showTime = s.status !== 'picked' && s.status !== 'skipped'
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
        <button className="btn small" onClick={() => onSkip(s.id)}>{s.status === 'skipped' ? 'Unskip' : 'Skip'}</button>
        <button className="btn small" onClick={() => onUndo(s.id)}>Undo</button>
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
  const [school, setSchool] = useState<SchoolName | 'All'>('All')
  const [lastUpdateMap, setLastUpdateMap] = useState<Record<string, string>>({})

  // Load today's last_update timestamps for roster_status (to show EST time next to status)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('roster_status')
        .select('student_id,last_update,current_status')
        .eq('roster_date', todayKey())
      if (!error && data) {
        const m: Record<string, string> = {}
        data.forEach((r: any) => { m[r.student_id] = r.last_update })
        setLastUpdateMap(m)
      }
    })()
  }, [roster]) // re-read when roster changes

  const vm = useMemo<StudentVM[]>(
    () =>
      students.map((s) => ({
        id: s.id,
        name: s.first_name + ' ' + s.last_name,
        school: (s.school as any) ?? '',
        status: roster[s.id] ?? 'not_picked',
        active: s.active,
        school_year: (s as any).school_year ?? null
      })),
    [students, roster]
  )

  const filteredBySchool = vm.filter(s => school === 'All' || s.school === school)

  // — To Pick Up: extra constraints (active + allowed school + allowed program) + not_picked
  const toPickup = filteredBySchool.filter(s =>
    s.status === 'not_picked'
    && s.active === true
    && ALLOWED_SCHOOLS.includes(s.school)
    && (s.school_year ? BUS_ALLOWED_PROGRAMS.includes(s.school_year) : false)
  )

  const picked = filteredBySchool.filter(s => s.status === 'picked')
  const skipped = filteredBySchool.filter(s => s.status === 'skipped')

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="row spread">
          <h3 className="heading">Bus Pickup</h3>
          <div className="row">
            {(['All', 'Bain', 'QG', 'MHE', 'MC'] as const).map(sc => (
              <button
                key={sc}
                className={'chip ' + (school === sc ? 'active' : '')}
                onClick={() => setSchool(sc as any)}
              >
                {sc}
              </button>
            ))}
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
              onUndo={(id) => onSet(id, 'not_picked')}
              lastUpdateIso={lastUpdateMap[s.id]}
            />
          ))}
          {!toPickup.length && <div className="muted">No students meet today’s pickup filters</div>}
        </div>

        <div className="list" style={{ marginTop: 20 }}>
          <div className="muted" style={{ marginBottom: 6 }}>PICKED</div>
          {picked.map(s => (
            <RowBus
              key={s.id}
              s={s}
              onPick={() => {}}
              onSkip={(id) => onSet(id, s.status === 'skipped' ? 'not_picked' : 'skipped')}
              onUndo={(id) => onSet(id, 'not_picked')}
              lastUpdateIso={lastUpdateMap[s.id]}
            />
          ))}
          {!picked.length && <div className="muted">None</div>}
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
              onUndo={(id) => onSet(id, 'not_picked')}
              lastUpdateIso={lastUpdateMap[s.id]}
            />
          ))}
          {!skipped.length && <div className="muted">None</div>}
        </div>
      </div>
    </div>
  )
}
