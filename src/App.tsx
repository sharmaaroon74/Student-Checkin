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

  // Fetchers
  const fetchStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id,first_name,last_name,approved_pickups,school,active,room_id,school_year')
      .order('last_name', { ascending: true })
    if (error) throw error
    setStudents((data ?? []) as StudentRow[])
  }, [])

  const fetchTodayRoster = useCallback(async () => {
    const { data, error } = await supabase
      .from('roster_status')
      .select('student_id,current_status')
      .eq('roster_date', todayKeyEST())
    if (error) throw error
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

  // Auth gate
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

  // Realtime (no server filter; client filters by EST)
  useRealtimeRoster(setRoster, fetchTodayRoster)

  // 🔴 SINGLE SOURCE OF TRUTH FOR STATUS CHANGES
  // Always call the RPC, then update local state.
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
      // optimistic update; realtime will also confirm
      setRoster((prevMap) => ({ ...prevMap, [id]: newStatus }))
    },
    [roster]
  )

  // Manual daily reset only (no auto reset on refresh/login)
  async function resetToday() {
    if (!confirm('Reset all statuses for today (EST) to "not_picked"?')) return
    const today = todayKeyEST()
    const { data, error } = await supabase
      .from('roster_status')
      .select('student_id,current_status')
      .eq('roster_date', today)
    if (error) { alert(error.message); return }
    for (const r of (data || [])) {
      await supabase.rpc('api_set_status', {
        p_student_id: r.student_id,
        p_roster_date: today,
        p_new_status: 'not_picked',
        p_pickup_person: null,
        p_meta: { source: 'ui', reset: true, prev_status: r.current_status }
      })
    }
    await fetchTodayRoster()
    alert('Reset complete for today (EST).')
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
