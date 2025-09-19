// src/App.tsx
import React, { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'
import type { StudentRow, Status } from './types'

const todayKey = () => new Date().toISOString().slice(0, 10)

export default function App() {
  const [page, setPage] = useState<'bus' | 'center' | 'skip'>('bus')
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})

  // ✅ subscribe to realtime updates
  useRealtimeRoster(setRoster)

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)

      // students
      const { data: sData, error: sErr } = await supabase
        .from('students')
        .select('id,first_name,last_name,approved_pickups,school,active,room_id,school_year')
        .order('last_name', { ascending: true })

      if (sErr) {
        console.error(sErr)
      } else if (!cancelled) {
        setStudents((sData ?? []) as StudentRow[])
      }

      // roster for today
      const { data: rData, error: rErr } = await supabase
        .from('roster_status')
        .select('student_id,current_status')
        .eq('roster_date', todayKey())

      if (rErr) {
        console.error(rErr)
      } else if (!cancelled) {
        const map: Record<string, Status> = {}
        ;(rData || []).forEach((r: any) => {
          map[r.student_id] = r.current_status as Status
        })
        setRoster(map)
      }

      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Optimistic local setter (pages perform RPCs)
  const onSet = (id: string, st: Status) => {
    setRoster(prev => ({ ...prev, [id]: st }))
  }

  const Nav = (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row spread">
        <div className="row">
          <button className={'btn ' + (page==='bus'?'primary':'')} onClick={() => setPage('bus')}>Bus</button>
          <button className={'btn ' + (page==='center'?'primary':'')} onClick={() => setPage('center')}>Center</button>
          <button className={'btn ' + (page==='skip'?'primary':'')} onClick={() => setPage('skip')}>Skip</button>
        </div>
        <div className="muted">Sunny Days – {todayKey()}</div>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="container">
        {Nav}
        <div className="card">Loading…</div>
      </div>
    )
  }

  return (
    <div className="container">
      {Nav}
      {page === 'bus' && (
        <BusPage students={students} roster={roster} onSet={onSet} />
      )}
      {page === 'center' && (
        <CenterPage students={students} roster={roster} onSet={onSet} />
      )}
      {page === 'skip' && (
        <SkipPage students={students} roster={roster} onSet={onSet} />
      )}
    </div>
  )
}
