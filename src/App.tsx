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

  // track per-student in-flight writes (to show tiny "saving..." indicator)
  const [saving, setSaving] = useState<Record<string, boolean>>({})

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
      alert('Failed to load students. Check console for details.')
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
      alert('Failed to load roster. Check console for details.')
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
      // Non-critical; don't alert here
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
      setSaving(prev => ({ ...prev, [studentId]: true }))
      let wrote = false

      try {
        // Preferred RPC that logs + upserts (if you created it)
        const { error: rpcErr } = await supabase.rpc('api_set_status', {
          p_student_id: studentId,
          p_new_status: st,
          p_meta: meta ?? null,
        })

        if (rpcErr) {
          console.warn('[rpc api_set_status] error; trying direct upsert', rpcErr)

          // Fallback: direct upsert (requires RLS policies for insert/update on roster_status)
          const { error: upErr } = await supabase
            .from('roster_status')
            .upsert({
              roster_date: rosterDate,
              student_id: studentId,
              current_status: st,
              last_update: new Date().toISOString(),
            })

          if (upErr) {
            console.error('[roster_status upsert] error', upErr)
            alert(`Failed to save. Likely a policy / RPC issue.\n\nDetails:\n${upErr.message || upErr}`)
          } else {
            wrote = true
          }
        } else {
          wrote = true
        }
      } catch (e: any) {
        console.error('[api_set_status] exception', e)
        alert(`Failed to save due to an exception.\n\nDetails:\n${e?.message || e}`)
      } finally {
        setSaving(prev => {
          const next = { ...prev }
          delete next[studentId]
          return next
        })
      }

      // Reconcile with server as the source of truth
      if (wrote) {
        await Promise.all([fetchRoster(), fetchPickedLogToday()])
      } else {
        // Even on failure, refresh to ensure UI matches DB
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
      return pickedEverToday.has(s.id) ? 'picked' : 'not_picked'
    },
    [pickedEverToday]
  )

  // ---------- Header date (EST)
  const estHeaderDate = useMemo(() => todayKeyEST(), [])

  // ---------- Action wrapper to pass saving state to pages (optional visual)
  const onSet = useCallback(
    (id: string, st: Status, meta?: any) => {
      // Prevent double-click storms
      if (saving[id]) return
      setStatusPersist(id, st, meta)
    },
    [saving, setStatusPersist]
  )

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
          <div className="muted" style={{marginLeft:8}}>build: no-optimistic+alerts</div>
        </div>
      </div>

      {/* Pages */}
      {page === 'bus' && (
        <BusPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={onSet}
        />
      )}
      {page === 'center' && (
        <CenterPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={onSet}
          inferPrevStatus={inferPrevStatus}
        />
      )}
      {page === 'skip' && (
        <SkipPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={onSet}
        />
      )}
    </div>
  )
}
