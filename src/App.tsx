import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import type { Status, StudentRow } from './types'

type Page = 'bus' | 'center' | 'skip'

/** YYYY-MM-DD in America/New_York */
function todayKeyEST(d = new Date()): string {
  const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const yyyy = est.getFullYear()
  const mm = String(est.getMonth() + 1).padStart(2, '0')
  const dd = String(est.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function App() {
  const [page, setPage] = useState<Page>('bus')

  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [rosterTimes, setRosterTimes] = useState<Record<string, string>>({})
  const [pickedEverToday, setPickedEverToday] = useState<Set<string>>(new Set())

  const rosterDate = todayKeyEST()

  // -------- Load students (active only)
  const fetchStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id, first_name, last_name, approved_pickups, school, active, room_id, school_year')
      .eq('active', true)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (error) {
      console.warn('[students] load error', error)
      return
    }
    setStudents((data ?? []) as StudentRow[])
  }, [])

  // -------- Load today’s roster_status
  const fetchRoster = useCallback(async () => {
    const { data, error } = await supabase
      .from('roster_status')
      .select('student_id,current_status,last_update')
      .eq('roster_date', rosterDate)

    if (error) {
      console.warn('[roster_status] load error', error)
      return
    }
    const map: Record<string, Status> = {}
    const times: Record<string, string> = {}
    ;(data ?? []).forEach((r: any) => {
      map[r.student_id] = r.current_status as Status
      if (r.last_update) times[r.student_id] = r.last_update
    })
    setRoster(map)
    setRosterTimes(times)
  }, [rosterDate])

  // -------- Load logs to infer previous queue for “Undo” (arrived -> picked/not_picked)
  const fetchPickedLogToday = useCallback(async () => {
    const { data, error } = await supabase
      .from('logs')
      .select('student_id,action,roster_date')
      .eq('roster_date', rosterDate)
      .eq('action', 'picked')
    if (error) {
      console.warn('[logs] load error', error)
      return
    }
    const ids = new Set<string>()
    ;(data ?? []).forEach((r: any) => ids.add(r.student_id))
    setPickedEverToday(ids)
  }, [rosterDate])

  // -------- One-shot refresh
  const refetchAll = useCallback(async () => {
    await Promise.all([fetchStudents(), fetchRoster(), fetchPickedLogToday()])
  }, [fetchStudents, fetchRoster, fetchPickedLogToday])

  useEffect(() => {
    refetchAll()
  }, [refetchAll])

  // -------- Persist a status change, then refresh maps
  const setStatusPersist = useCallback(
    async (studentId: string, st: Status, meta?: any) => {
      // Optimistic update
      setRoster(prev => ({ ...prev, [studentId]: st }))

      try {
        // Preferred RPC if available
        const { error } = await supabase.rpc('api_set_status', {
          p_student_id: studentId,
          p_new_status: st,
          p_meta: meta ?? null,
        })
        if (error) {
          console.warn('[rpc api_set_status] error; falling back to direct upsert', error)
          // Fallback: upsert roster_status (requires RLS allowing this)
          const { error: upErr } = await supabase
            .from('roster_status')
            .upsert({
              roster_date: rosterDate,
              student_id: studentId,
              current_status: st,
              last_update: new Date().toISOString(),
            })
          if (upErr) console.error('[roster_status upsert] error', upErr)
        }
      } catch (e) {
        console.error('[api_set_status] exception', e)
      }

      await Promise.all([fetchRoster(), fetchPickedLogToday()])
    },
    [rosterDate, fetchRoster, fetchPickedLogToday]
  )

  // -------- Daily Reset (optional RPC)
  const onDailyReset = useCallback(async () => {
    try {
      const { error } = await supabase.rpc('api_daily_reset')
      if (error) console.warn('[rpc api_daily_reset] missing?', error)
    } catch (e) {
      console.warn('[rpc api_daily_reset] exception', e)
    }
    await refetchAll()
  }, [refetchAll])

  const onLogout = useCallback(async () => {
    await supabase.auth.signOut()
    location.reload()
  }, [])

  // -------- Single Undo inference for Checkout panel
  const inferPrevStatus = useCallback(
    (s: StudentRow): 'picked' | 'not_picked' => {
      // If the student was picked at any point today, send them back to "picked" (bus queue).
      // Otherwise, send back to "not_picked" (direct check-in).
      return pickedEverToday.has(s.id) ? 'picked' : 'not_picked'
    },
    [pickedEverToday]
  )

  // -------- Header date (EST)
  const estHeaderDate = useMemo(() => todayKeyEST(), [])

  return (
    <div className="container">
      {/* Top Nav */}
      <div className="row gap wrap" style={{ marginBottom: 8 }}>
        <div className="seg">
          <button className={'seg-btn' + (page === 'bus' ? ' on' : '')} onClick={() => setPage('bus')}>Bus</button>
          <button className={'seg-btn' + (page === 'center' ? ' on' : '')} onClick={() => setPage('center')}>Center</button>
          <button className={'seg-btn' + (page === 'skip' ? ' on' : '')} onClick={() => setPage('skip')}>Skip</button>
        </div>
        <div className="grow" />
        <div className="row gap">
          <div className="muted">Sunny Days — {estHeaderDate}</div>
          <button className="btn" onClick={onDailyReset}>Daily Reset</button>
          <button className="btn" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Pages */}
      {page === 'bus' && (
        <BusPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}          // <-- timestamps wired (shows EST time on pages)
          onSet={setStatusPersist}
        />
      )}
      {page === 'center' && (
        <CenterPage 
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}          // <-- timestamps wired (shows EST time)
          onSet={setStatusPersist}
          inferPrevStatus={inferPrevStatus}  // <-- single Undo on Checkout
        />
      )}
      {page === 'skip' && (
        <SkipPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={setStatusPersist}
        />
      )}
    </div>
  )
}
