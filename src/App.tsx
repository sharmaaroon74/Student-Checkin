import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
// NOTE: your login component path + required prop:
import Login from './Login'

import type { Status, StudentRow } from './types'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'

type Page = 'bus' | 'center' | 'skip'

function todayKeyEST(): string {
  const est = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  return est.toISOString().slice(0, 10)
}
function nowISO(): string {
  return new Date().toISOString()
}

export default function App() {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('bus')

  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [rosterTimes, setRosterTimes] = useState<Record<string, string>>({})

  // Freeze the roster date at first render (EST)
  const rosterDateEST = useMemo(() => todayKeyEST(), [])

  // ---- Auth bootstrap (and react to auth changes)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const uid = data?.session?.user?.id ?? null
      if (mounted) setSessionUserId(uid)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSessionUserId(sess?.user?.id ?? null)
    })
    return () => {
      sub?.subscription?.unsubscribe?.()
      mounted = false
    }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setSessionUserId(null)
    // Clear in-memory UI state (DB is the source of truth)
    setStudents([])
    setRoster({})
    setRosterTimes({})
  }, [])

  // ---- Data loaders
  const fetchStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id, first_name, last_name, approved_pickups, school, active, room_id, school_year')
      .order('last_name', { ascending: true })

    if (error) {
      console.warn('[students] fetch error:', error)
      setStudents([])
      return
    }
    if (!data) {
      console.warn('[students] 0 rows returned. Possible RLS block or empty table.')
      setStudents([])
      return
    }
    setStudents(data as StudentRow[])
  }, [])

  const refetchTodayRoster = useCallback(async () => {
    const { data, error } = await supabase
      .from('roster_status')
      .select('student_id, current_status, last_update')
      .eq('roster_date', rosterDateEST)

    if (error) {
      console.warn('[roster] fetch error:', error)
      return
    }
    const next: Record<string, Status> = {}
    const times: Record<string, string> = {}
    for (const r of data ?? []) {
      next[r.student_id] = r.current_status as Status
      if (r.last_update) times[r.student_id] = r.last_update as string
    }
    setRoster(next)
    setRosterTimes(times)
  }, [rosterDateEST])

  // ---- Auto-skip (No Bus Days) once per EST day after login
  useEffect(() => {
    let cancelled = false
    async function ensureAutoSkipApplied() {
      if (!sessionUserId) return
      const key = `sd_autoskip_applied_${rosterDateEST}`
      if (localStorage.getItem(key)) return

      const { error } = await supabase.rpc('api_apply_auto_skip_today')
      if (error) {
        console.warn('[auto-skip] rpc error', error)
        return
      }
      localStorage.setItem(key, '1')
      if (!cancelled) await refetchTodayRoster()
    }
    ensureAutoSkipApplied()
    return () => { cancelled = true }
  }, [sessionUserId, rosterDateEST, refetchTodayRoster])

  // ---- Initial data load after login
  useEffect(() => {
    if (!sessionUserId) return
    ;(async () => {
      await fetchStudents()
      await refetchTodayRoster()
    })()
  }, [sessionUserId, fetchStudents, refetchTodayRoster])

  // ---- Realtime subscription + visible-tab polling (your hook requires 4 args)
  useRealtimeRoster(rosterDateEST, setRoster, setRosterTimes, refetchTodayRoster)

  // ---- Status setter (optimistic, then RPC with fallback)
  const onSet = useCallback(
    async (studentId: string, newStatus: Status, meta?: any) => {
      // optimistic local update
      setRoster(prev => ({ ...prev, [studentId]: newStatus }))
      setRosterTimes(prev => ({ ...prev, [studentId]: nowISO() }))

      // try RPC first (includes logging / server logic)
      const { error: rpcErr } = await supabase.rpc('api_set_status', {
        p_student_id: studentId,
        p_new_status: newStatus,
        p_meta: meta ?? null
      })
      if (!rpcErr) return

      console.warn('[rpc api_set_status] error; trying direct upsert', rpcErr)

      // fallback: direct upsert (requires permissive RLS)
      const { error: upErr } = await supabase
        .from('roster_status')
        .upsert({
          roster_date: rosterDateEST,
          student_id: studentId,
          current_status: newStatus,
          last_update: nowISO()
        })
      if (upErr) {
        console.error('[roster_status upsert] error', upErr)
        await refetchTodayRoster() // revert optimistic view
      }
    },
    [rosterDateEST, refetchTodayRoster]
  )

  // ---- Top nav helper
  function TopButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button className={`btn ${active ? 'primary' : ''}`} onClick={onClick} type="button">
        {children}
      </button>
    )
  }

  // ---- If NOT logged in, show your Login component (requires onDone prop)
  if (!sessionUserId) {
    return <Login onDone={async () => {
      const { data } = await supabase.auth.getSession()
      setSessionUserId(data?.session?.user?.id ?? null)
      // load data right after login
      await fetchStudents()
      await refetchTodayRoster()
    }} />
  }

  // ---- Main app shell
  return (
    <div className="app-shell">
      {/* Header */}
      <div className="row gap wrap" style={{ alignItems: 'center', marginBottom: 12 }}>
        <div className="row gap">
          <TopButton active={page === 'bus'} onClick={() => setPage('bus')}>Bus</TopButton>
          <TopButton active={page === 'center'} onClick={() => setPage('center')}>Sunny Days</TopButton>
          <TopButton active={page === 'skip'} onClick={() => setPage('skip')}>Skip</TopButton>
        </div>
        <div className="row gap" style={{ marginLeft: 'auto' }}>
          <button className="btn" onClick={logout}>Logout</button>
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
          // "Undo" from checkout returns to previous inferred queue
          inferPrevStatus={(s) => (roster[s.id] === 'arrived' ? 'picked' : 'not_picked')}
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

      {/* Build marker (optional) */}
      <div className="muted" style={{ marginTop: 8 }}>build: {rosterDateEST}-autoskip</div>
    </div>
  )
}
