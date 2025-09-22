import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Status, StudentRow } from './types'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import Login from './Login'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'

// --- Helpers ---
type Page = 'bus' | 'center' | 'skip'

function todayKeyEST(): string {
  const now = new Date()
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now)
}

function todayESTLabel(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric'
  }).format(now)
}

// --- App ---
export default function App() {
  const [page, setPage] = useState<Page>('bus')
  const [sessionReady, setSessionReady] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)

  // Students shared across pages
  const [students, setStudents] = useState<StudentRow[]>([])

  // Roster map (student_id -> status) and last-change time (student_id -> ISO string)
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [rosterTimes, setRosterTimes] = useState<Record<string, string>>({})

  const rosterDateEST = todayKeyEST()

  // Realtime roster + light polling
  useRealtimeRoster(rosterDateEST, setRoster, setRosterTimes, refetchTodayRoster)

  // Auth wiring (email/password)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setIsAuthed(!!data.session)
      setSessionReady(true)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setIsAuthed(!!sess)
      setSessionReady(true)
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  // Fetch students after auth
  useEffect(() => {
    if (!isAuthed) return
    fetchStudents().catch(() => {})
  }, [isAuthed])

  async function fetchStudents() {
    const { data, error } = await supabase
      .from('students')
      .select('id, first_name, last_name, approved_pickups, school, active, room_id, school_year')
      .order('first_name', { ascending: true })

    if (error) {
      console.error('[students] fetch error', error)
      setStudents([])
      return
    }
    if (!data || data.length === 0) {
      console.warn('[students] 0 rows returned. Possible RLS block or empty table.')
      setStudents([])
      return
    }
    setStudents(data as StudentRow[])
  }

  async function refetchTodayRoster() {
    const { data, error } = await supabase
      .from('roster_status')
      .select('student_id, current_status, last_update')
      .eq('roster_date', rosterDateEST)

    if (error) {
      console.error('[roster] fetch error', error)
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
  }

  // RPC-first; fallback to direct upsert; then optimistic UI
  async function handleSetStatus(studentId: string, st: Status, meta?: any) {
    // 1) Try RPC
    const { error: rpcErr } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_status: st,
      p_meta: meta ?? null,
    })

    if (rpcErr) {
      console.warn('[rpc api_set_status] error; trying direct upsert', rpcErr)

      // 2) Fallback: upsert roster_status (requires RLS upsert policy)
      const { error: upsertErr } = await supabase
        .from('roster_status')
        .upsert(
          {
            roster_date: rosterDateEST,
            student_id: studentId,
            current_status: st,
            last_update: new Date().toISOString(),
          },
          { onConflict: 'roster_date,student_id' }
        )

      if (upsertErr) {
        console.error('[roster_status upsert] error', upsertErr)
        return
      }

      // Optional: best-effort logs insert (no `.catch` here)
      const { error: logErr } = await supabase.from('logs').insert({
        roster_date: rosterDateEST,
        student_id: studentId,
        action: st,
        meta: meta ?? null,
        at: new Date().toISOString(),
      })
      if (logErr) {
        // Non-fatal — UI still updates via optimistic state + realtime
        console.warn('[logs insert] ignored', logErr)
      }
    }

    // Optimistic UI
    setRoster(prev => ({ ...prev, [studentId]: st }))
    setRosterTimes(prev => ({ ...prev, [studentId]: new Date().toISOString() }))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setIsAuthed(false)
  }

  const buildLabel = useMemo(() => 'build: v1.7+toolbar', [])

  if (!sessionReady) {
    return (
      <div className="container">
        <div className="card"><div className="muted">Loading…</div></div>
      </div>
    )
  }

  if (!isAuthed) {
    return (
      <Login onDone={async () => {
        setIsAuthed(true)
        await fetchStudents()
        await refetchTodayRoster()
      }} />
    )
  }

  return (
    <div className="container">
      {/* Top nav + date + logout */}
      <div className="row wrap" style={{ marginBottom: 10, alignItems: 'center' }}>
        <div className="row gap">
          <button className={`btn ${page==='bus'?'primary':''}`} onClick={()=>setPage('bus')}>Bus</button>
          <button className={`btn ${page==='center'?'primary':''}`} onClick={()=>setPage('center')}>Sunny Days</button>
          <button className={`btn ${page==='skip'?'primary':''}`} onClick={()=>setPage('skip')}>Skip</button>
          <div className="muted" style={{ marginLeft: 8 }}>{buildLabel}</div>
        </div>
        <div className="row gap" style={{ marginLeft: 'auto', alignItems: 'center' }}>
          <span className="chip">{todayESTLabel()}</span>
          <button className="btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Pages */}
      {page === 'bus' && (
        <BusPage
          students={students}
          roster={roster}
          onSet={handleSetStatus}
        />
      )}

      {page === 'center' && (
        <CenterPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}  // <-- ensure CenterPage props include this
          onSet={handleSetStatus}
        />
      )}

      {page === 'skip' && (
        <SkipPage
          students={students}
          roster={roster}
          onSet={handleSetStatus}
        />
      )}
    </div>
  )
}
