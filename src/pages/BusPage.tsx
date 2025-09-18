import React, { useMemo, useState } from 'react'
import { StudentRow, Status, SchoolName } from '../types'

type StudentVM = {
  id: string
  name: string
  room: number | null
  school: 'Bain' | 'QG' | 'MHE' | 'MC'
  status: Status
}

function StudentRowBus({
  s,
  onPick,
  onSkip,
  onUndo,
}: {
  s: StudentVM
  onPick: (id: string) => void
  onSkip: (id: string) => void
  onUndo: (id: string) => void
}) {
  return (
    <div className="item">
      <div>
        <div className="heading">{s.name}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Room {s.room ?? '-'} • {s.school} • Status: <b>{s.status}</b>
        </div>
      </div>
      <div className="row">
        <button
          className="btn small"
          onClick={() => onPick(s.id)}
          disabled={s.status !== 'not_picked'}
        >
          Picked
        </button>
        <button className="btn small" onClick={() => onSkip(s.id)}>
          {s.status === 'skipped' ? 'Unskip' : 'Skip'}
        </button>
        <button className="btn small" onClick={() => onUndo(s.id)}>
          Undo
        </button>
      </div>
    </div>
  )
}

export default function BusPage({
  students,
  roster,
  onSet,
}: {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status) => void
}) {
  const [school, setSchool] = useState<SchoolName | 'All'>('All')

  const vm = useMemo<StudentVM[]>(
    () =>
      students.map((s) => ({
        id: s.id,
        name: s.first_name + ' ' + s.last_name,
        room: s.room_id,
        school: s.school,
        status: roster[s.id] ?? 'not_picked',
      })),
    [students, roster]
  )

  const filtered = vm.filter((s) => school === 'All' || s.school === school)

  const toPickup = filtered.filter((s) => s.status === 'not_picked')
  const picked = filtered.filter((s) => s.status === 'picked')
  const skipped = filtered.filter((s) => s.status === 'skipped')

  return (
    <div className="grid cols-2">
      <div className="card">
        <div className="row spread">
          <h3 className="heading">Bus Pickup</h3>
          <div className="row">
            {(['All', 'Bain', 'QG', 'MHE', 'MC'] as const).map((sc) => (
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
          <div className="muted" style={{ marginBottom: 6 }}>
            TO PICK UP
          </div>
          {toPickup.map((s) => (
            <StudentRowBus
              key={s.id}
              s={s}
              onPick={(id) => onSet(id, 'picked')}
              onSkip={(id) => onSet(id, s.status === 'skipped' ? 'not_picked' : 'skipped')}
              onUndo={(id) => onSet(id, 'not_picked')}
            />
          ))}
          {!toPickup.length && <div className="muted">No students to pick up</div>}
        </div>

        <div className="list" style={{ marginTop: 20 }}>
          <div className="muted" style={{ marginBottom: 6 }}>
            PICKED
          </div>
          {picked.map((s) => (
            <StudentRowBus
              key={s.id}
              s={s}
              onPick={() => {}}
              onSkip={(id) => onSet(id, s.status === 'skipped' ? 'not_picked' : 'skipped')}
              onUndo={(id) => onSet(id, 'not_picked')}
            />
          ))}
          {!picked.length && <div className="muted">None</div>}
        </div>
      </div>

      <div className="card">
        <h3 className="heading">Skipped Today</h3>
        <div className="list" style={{ marginTop: 12 }}>
          {skipped.map((s) => (
            <StudentRowBus
              key={s.id}
              s={s}
              onPick={(id) => onSet(id, 'picked')}
              onSkip={(id) => onSet(id, 'not_picked')}
              onUndo={(id) => onSet(id, 'not_picked')}
            />
          ))}
          {!skipped.length && <div className="muted">None</div>}
        </div>
      </div>
    </div>
  )
}
