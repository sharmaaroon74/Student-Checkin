// src/App.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'
import type { StudentRow, Status } from './types'
import { todayKeyEST } from './lib/date'

type Page = 'bus' | 'center' | 'skip'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) alert(error.message)
  }
  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
        <h2 className="heading">Sunny Days – Sign in</h2>
        <form onSubmit={signIn} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn primary" disabled={loading} type="submit">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('bus')
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [sessionReady, setSessionReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  // ---------------------------
  // Fetchers
  // ---------------------------
  const fetchStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id,first_name,last_name,approved_pickups,school,active,room_id,school_year')
      .order('last_name', { ascending: true })
    if (error) throw error
    setStudents((data ?? []) as StudentRow[])
  }, [])

  const fetchTodayRoster = useCallback(async () => {
    const today = todayKeyEST()

    // 1) Load today's roster (with count)
    let { data, error, count } = await supabase
      .from('roster_status')
      .select('student_id,current_status', { count: 'exact' })
      .eq('roster_date', today)

    if (error) throw error

    // 2) If empty, seed once, then refetch
    if ((count ?? (data?.length ?? 0)) === 0) {
      const { error: seedErr } = await supabase.rpc('api_seed_today_if_empty')
      if (!seedErr) {
        const retry = await supabase
          .from('roster_status')
          .select('student_id,current_status')
          .eq('roster_date', today)
        data = retry.data
      } else {
        console.error('Seed error:', seedErr.message)
      }
    }

    // 3) Apply auto-skip for students whose no_bus_days includes today
    const { error: applyErr } = await supabase.rpc('api_apply_auto_skip_today')
    if (applyErr) {
      console.error('Apply auto-skip error:', applyErr.message)
    } else {
      // 4) Refetch once to reflect any updates made by the RPC
      const retry = await supabase
        .from('roster_status')
        .select('student_id,current_status')
        .eq('roster_date', today)
      data = retry.data
    }

    const map: Record<string, Status> = {}
    ;(data || []).forEach((r: any) => (map[r.student_id] = r.current_status as Status))
    setRoster(map)
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([fetchStudents(), fetchTodayRoster()])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [fetchStudents, fetchTodayRoster])

  // ---------------------------
  // Auth gate
  // ---------------------------
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setHasSession(!!data.session)
      setSessionReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setHasSession(!!sess)
      if (sess) loadAll()
      else {
        setStudents([])
        setRoster({})
      }
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [loadAll])

  useEffect(() => {
    if (sessionReady && hasSession) loadAll()
    else if (sessionReady && !hasSession) setLoading(false)
  }, [sessionReady, hasSession, loadAll])

  // ---------------------------
  // Realtime (no server-side filter; client filters by EST)
  // ---------------------------
  useRealtimeRoster(setRoster, fetchTodayRoster)

  // ---------------------------
  // Single source of truth for status changes
  // ---------------------------
  const setStatusPersist = useCallback(
    async (
      id: string,
      newStatus: Status,
      meta?: { pickup_person?: string | null; [k: string]: any }
    ) => {
      const today = todayKeyEST()
      const prev = roster[id] ?? 'not_picked'
      const { error } = await supabase.rpc('api_set_status', {
        p_student_id: id,
        p_roster_date: today,
        p_new_status: newStatus,
        p_pickup_person: meta?.pickup_person ?? null,
        p_meta: { source: 'ui', prev_status: prev, ...meta }
      })
      if (error) {
        alert(error.message)
        return
      }
      // Optimistic update; Realtime will also confirm
      setRoster((prevMap) => ({ ...prevMap, [id]: newStatus }))
    },
    [roster]
  )

  // ---------------------------
  // Manual daily reset (EST)
  // ---------------------------
  async function resetToday() {
  if (!confirm('Reset today (EST) with no-bus auto-skip applied?')) return
  const { error } = await supabase.rpc('api_reset_today_apply_nobus')
  if (error) { alert(error.message); return }
  await fetchTodayRoster() // refresh UI
  alert('Reset complete for today (EST). No-bus auto-skip applied.')
}


  async function logout() {
    await supabase.auth.signOut()
  }


  const Nav = useMemo(() => (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row spread">
        <div className="row">
          <button className={'btn ' + (page==='bus'?'primary':'')} onClick={() => setPage('bus')}>Bus</button>
          <button className={'btn ' + (page==='center'?'primary':'')} onClick={() => setPage('center')}>Center</button>
          <button className={'btn ' + (page==='skip'?'primary':'')} onClick={() => setPage('skip')}>Skip</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="muted">Sunny Days — {todayKeyEST()}</div>
          {hasSession && (
            <>
              <button className="btn" onClick={resetToday}>Daily Reset</button>
              <button className="btn" onClick={logout}>Logout</button>
            </>
          )}
        </div>
      </div>
    </div>
  ), [page, hasSession])

  if (!sessionReady) {
    return (
      <div className="container">
        {Nav}
        <div className="card">Checking session…</div>
      </div>
    )
  }
  if (!hasSession) return <Login />
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
        <BusPage students={students} roster={roster} onSet={setStatusPersist} />
      )}
      {page === 'center' && (
        <CenterPage students={students} roster={roster} onSet={setStatusPersist} />
      )}
      {page === 'skip' && (
        <SkipPage students={students} roster={roster} onSet={setStatusPersist} />
      )}
    </div>
  )
}
