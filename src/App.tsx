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

  // ---------- Load students (active-only)
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

  // ---------- Load today’s roster_status
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

  // ---------- Load logs to infer previous queue for Checkout "Undo"
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

  // ---------- One-shot refresh
  const refetchAll = useCallback(async () => {
    await Promise.all([fetchStudents(), fetchRoster(), fetchPickedLogToday()])
  }, [fetchStudents, fetchRoster, fetchPickedLogToday])

  useEffect(() => {
    refetchAll()
  }, [refetchAll])

  // ---------- Persist a status change (NO optimistic write), then refresh from server
  const setStatusPersist = useCallback(
    async (studentId: string, st: Status, meta?: any) => {
      let ok = true
      try {
        // Preferred RPC that logs + upserts
        const { error } = await supabase.rpc('api_set_status', {
          p_student_id: studentId,
          p_new_status: st,
          p_meta: meta ?? null,
        })
        if (error) {
          ok = false
          console.warn('[rpc api_set_status] error; falling back to direct upsert', error)
          // Fallback: direct upsert (requires proper RLS)
          const { error: upErr } = await supabase
            .from('roster_status')
            .upsert({
              roster_date: rosterDate,
              student_id: studentId,
              current_status: st,
              last_update: new Date().toISOString(),
            })
          if (upErr) {
            ok = false
            console.error('[roster_status upsert] error', upErr)
          } else {
            ok = true
          }
        }
      } catch (e) {
        ok = false
        console.error('[api_set_status] exception', e)
      }

      // Always reconcile with server as source of truth
      if (ok) {
        await Promise.all([fetchRoster(), fetchPickedLogToday()])
      } else {
        await fetchRoster()
      }
    },
    [rosterDate, fetchRoster, fetchPickedLogToday]
  )

  // ---------- Daily Reset (optional RPC if you created one)
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

  // ---------- Single Undo inference for Checkout panel
  const inferPrevStatus = useCallback(
    (s: StudentRow): 'picked' | 'not_picked' => {
      // If student was ever picked today, send back to "picked" (Bus queue),
      // else "not_picked" (Direct check-in).
      return pickedEverToday.has(s.id) ? 'picked' : 'not_picked'
    },
    [pickedEverToday]
  )

  // ---------- Header date (EST)
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
          rosterTimes={rosterTimes}          // timestamps → shows EST time on the row subtitle
          onSet={setStatusPersist}
        />
      )}
      {page === 'center' && (
        <CenterPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={setStatusPersist}
          inferPrevStatus={inferPrevStatus}  // single Undo (arrived → picked/not_picked)
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
