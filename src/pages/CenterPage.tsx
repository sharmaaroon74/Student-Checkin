import React, { useState } from 'react'
import { StudentRow, Status } from '../types'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status) => void
}

export default function CenterPage({ students, roster, onSet }: Props) {
  const [tab, setTab] = useState<'in' | 'out'>('in')

  const fromBus   = students.filter(s => roster[s.id] === 'picked')
  const directIn  = students.filter(s => (roster[s.id] ?? 'not_picked') === 'not_picked')
  const toCheckout = students.filter(s => roster[s.id] === 'arrived')
  const checkedOut = students.filter(s => roster[s.id] === 'checked')

  return (
    <div className="page-body">
      {/* local tab strip (kept exactly as before) */}
      <div className="toolbar-bg" style={{marginBottom: 12}}>
        <div className="row wrap">
          <button
            className={`chip ${tab === 'in' ? 'chip-on' : ''}`}
            onClick={() => setTab('in')}
          >
            Check-in
          </button>
          <button
            className={`chip ${tab === 'out' ? 'chip-on' : ''}`}
            onClick={() => setTab('out')}
          >
            Checkout
          </button>
        </div>
      </div>

      {tab === 'in' ? (
        <div className="two-col">
          {/* Center Check-in (from Bus) */}
          <div className="card">
            <div className="section-title">Center Check-in (from Bus)</div>
            <div className="list">
              {fromBus.length === 0 && (
                <div className="muted">No students to check in from bus.</div>
              )}
              {fromBus.map(s => {
                const name = `${s.first_name} ${s.last_name}`
                return (
                  <div key={s.id} className="card-row">
                    <div className="meta">
                      <div className="heading">{name}</div>
                      <div className="muted">School: {s.school} | Picked</div>
                    </div>
                    <div className="actions">
                      <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>
                        Mark Arrived
                      </button>
                      <button className="btn" onClick={() => onSet(s.id, 'not_picked')}>
                        Undo
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Direct Check-in (No Bus) */}
          <div className="card">
            <div className="section-title">Direct Check-in (No Bus)</div>
            <div className="list">
              {directIn.length === 0 && (
                <div className="muted">No students to check in directly.</div>
              )}
              {directIn.map(s => {
                const name = `${s.first_name} ${s.last_name}`
                return (
                  <div key={s.id} className="card-row">
                    <div className="meta">
                      <div className="heading">{name}</div>
                      <div className="muted">School: {s.school} | Not Picked</div>
                    </div>
                    <div className="actions">
                      <button className="btn primary" onClick={() => onSet(s.id, 'arrived')}>
                        Mark Arrived
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="two-col">
          {/* Checkout */}
          <div className="card">
            <div className="section-title">Checkout</div>
            <div className="list">
              {toCheckout.length === 0 && (
                <div className="muted">No students to check out.</div>
              )}
              {toCheckout.map(s => {
                const name = `${s.first_name} ${s.last_name}`
                return (
                  <div key={s.id} className="card-row">
                    <div className="meta">
                      <div className="heading">{name}</div>
                      <div className="muted">School: {s.school} | Arrived</div>
                    </div>
                    <div className="actions">
                      <button className="btn primary" onClick={() => onSet(s.id, 'checked')}>
                        Checkout
                      </button>
                      <button className="btn" onClick={() => onSet(s.id, 'picked')}>
                        Undo
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Checked Out */}
          <div className="card">
            <div className="section-title">Checked Out</div>
            <div className="list">
              {checkedOut.length === 0 && (
                <div className="muted">No one checked out yet.</div>
              )}
              {checkedOut.map(s => {
                const name = `${s.first_name} ${s.last_name}`
                return (
                  <div key={s.id} className="card-row">
                    <div className="meta">
                      <div className="heading">{name}</div>
                      <div className="muted">School: {s.school} | Checked-out</div>
                    </div>
                    <div className="actions">
                      <button className="btn" onClick={() => onSet(s.id, 'arrived')}>
                        Undo
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
