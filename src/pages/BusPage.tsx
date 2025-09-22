import React from 'react'
import { StudentRow, Status } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status) => void
  // the toolbar (filters/search/sort/counts) is rendered by App,
  // we only render the two panels here
}

export default function BusPage({ students, roster, onSet }: Props) {
  const toPick = students.filter(s => roster[s.id] !== 'skipped') // filtering is already done in App; this is a safety net

  const skipped = students.filter(s => roster[s.id] === 'skipped')

  return (
    <div className="page-body">
      <div className="two-col">
        {/* Left column: Bus Pickup */}
        <div className="card">
          <div className="section-title">Bus Pickup</div>
          <div className="list">
            {toPick.length === 0 && (
              <div className="muted">No students to pick up.</div>
            )}

            {toPick.map(s => {
              const name = `${s.first_name} ${s.last_name}`
              return (
                <div key={s.id} className="card-row">
                  <div className="meta">
                    <div className="heading">{name}</div>
                    <div className="muted">
                      School: {s.school} | {labelOf(roster[s.id] || 'not_picked')}
                    </div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn primary"
                      onClick={() => onSet(s.id, 'picked')}
                    >
                      Mark Picked
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column: Skipped Today */}
        <div className="card">
          <div className="section-title">Skipped Today</div>
          <div className="list">
            {skipped.length === 0 && (
              <div className="muted">No skipped students.</div>
            )}

            {skipped.map(s => {
              const name = `${s.first_name} ${s.last_name}`
              return (
                <div key={s.id} className="card-row">
                  <div className="meta">
                    <div className="heading">{name}</div>
                    <div className="muted">School: {s.school} | Skipped</div>
                  </div>
                  <div className="actions">
                    <button
                      className="btn"
                      onClick={() => onSet(s.id, 'not_picked')}
                    >
                      Unskip Today
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function labelOf(st: Status) {
  switch (st) {
    case 'not_picked': return 'Not Picked'
    case 'picked':     return 'Picked'
    case 'arrived':    return 'Arrived'
    case 'checked':    return 'Checked Out'
    case 'skipped':    return 'Skipped'
    default:           return String(st)
  }
}
