import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Status, StudentRow } from './types'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import Login from './Login'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'

type Page = 'bus' | 'center' | 'skip' // <-- ensure 'skip' included

function todayKeyEST(): string {
  const now = new Date()
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

export default function App() {
  const [page, setPage] = useState<Page>('bus')
  const [sessionReady, setSessionReady] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)

  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [rosterTimes, setRosterTimes] = useState<Record<string, string>>({})

  const rosterDateEST = todayKeyEST()

  // Realtime + light polling fallback
  useRealtimeRoster(rosterDateEST, setRoster, setRosterTimes, refetchTodayRoster)

  // Auth (email/password)
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

  // RPC-first; fallback upsert; optimistic UI
  async function handleSetStatus(studentId: string, st: Status, meta?: any) {
    const { error: rpcErr } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_status: st,
      p_meta: meta ?? null,
    })

    if (rpcErr) {
      console.warn('[rpc api_set_status] error; trying direct upsert', rpcErr)
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
      // best-effort log (ok if RLS blocks)
      const { error: logErr } = await supabase.from('logs').insert({
        roster_date: rosterDateEST,
        student_id: studentId,
        action: st,
        meta: meta ?? null,
        at: new Date().toISOString(),
      })
      if (logErr) console.warn('[logs insert] ignored', logErr)
    }

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

        // Prepare rows & auto-skip on server (EST-aware), then fetch fresh roster
  try {
  const { error } = await supabase.rpc('api_prepare_today_and_apply_auto_skip')
  if (error) {
    // Safe to proceed; it likely means it was already prepared or RLS blocked logs insert
    console.warn('[prepare_today] RPC error (non-fatal):', error)
  }
} catch (e) {
  console.warn('[prepare_today] unexpected error (non-fatal):', e)
}

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
          <button
            type="button"
            className={`btn ${page==='bus'?'primary':''}`}
            aria-current={page==='bus' ? 'page' : undefined}
            onClick={() => setPage('bus')}
          >
            Bus
          </button>

          <button
            type="button"
            className={`btn ${page==='center'?'primary':''}`}
            aria-current={page==='center' ? 'page' : undefined}
            onClick={() => setPage('center')}
          >
            Sunny Days
          </button>

          <button
            type="button"
            className={`btn ${page==='skip'?'primary':''}`}
            aria-current={page==='skip' ? 'page' : undefined}
            onClick={() => setPage('skip')} // <-- ensure exactly 'skip'
          >
            Skip
          </button>

          <div className="muted" style={{ marginLeft: 8 }}>{buildLabel}</div>
        </div>

        <div className="row gap" style={{ marginLeft: 'auto', alignItems: 'center' }}>
          <span className="chip">{todayESTLabel()}</span>
          <button className="btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Render pages */}
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
          rosterTimes={rosterTimes}
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
