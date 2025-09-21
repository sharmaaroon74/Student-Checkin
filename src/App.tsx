import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import type { Status, StudentRow } from './types'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'

type Page = 'bus' | 'center' | 'skip'

/** YYYY-MM-DD in America/New_York */
function todayKeyEST(d = new Date()): string {
  const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const yyyy = est.getFullYear()
  const mm = String(est.getMonth() + 1).padStart(2, '0')
  const dd = String(est.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** ---------- Simple Email/Password Auth UI (no redirects) ---------- */
function AuthPanePassword() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const doSignIn = async () => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg(`Sign in failed: ${error.message}`)
  }

  const doSignUp = async () => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) setMsg(`Sign up failed: ${error.message}`)
    else setMsg('Account created. If confirmations are enabled, check your email.')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setMsg('Email and password are required'); return }
    if (mode === 'signin') await doSignIn()
    else await doSignUp()
  }

  return (
    <div className="container" style={{ maxWidth: 520, marginTop: 40 }}>
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Sunny Days — {mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
        <form onSubmit={submit} className="col gap">
          <input
            type="email"
            placeholder="you@school.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? (mode === 'signin' ? 'Signing in…' : 'Creating…') : (mode === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>
        {msg && <div style={{ marginTop: 10 }} className="muted">{msg}</div>}
        <div className="row gap" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Create an account' : 'Have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('bus')

  const [userId, setUserId] = useState<string | null>(null)         // auth guard
  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [rosterTimes, setRosterTimes] = useState<Record<string, string>>({})
  const [pickedEverToday, setPickedEverToday] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const rosterDate = todayKeyEST()

  /** ---------- Session bootstrap & listener ---------- */
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setUserId(data.session?.user?.id ?? null)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  /** ---------- Data fetchers (run only when logged in) ---------- */
  const fetchStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from('students')
      .select('id, first_name, last_name, approved_pickups, school, active, room_id, school_year')
      .eq('active', true)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (error) {
      console.warn('[students] load error', error)
      alert('Failed to load students (RLS/policy or no session). See console.')
      return
    }
    setStudents((data ?? []) as StudentRow[])
  }, [])

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

  const fetchPickedLogToday = useCallback(async () => {
    const { data, error } = await supabase
      .from('logs')
      .select('student_id,action,roster_date')
      .eq('roster_date', rosterDate)
      .eq('action', 'picked')
    if (error) {
      console.warn('[logs] load error (non-critical)', error)
      return
    }
    const ids = new Set<string>()
    ;(data ?? []).forEach((r: any) => ids.add(r.student_id))
    setPickedEverToday(ids)
  }, [rosterDate])

  const refetchAll = useCallback(async () => {
    if (!userId) return
    await Promise.all([fetchStudents(), fetchRoster(), fetchPickedLogToday()])
  }, [userId, fetchStudents, fetchRoster, fetchPickedLogToday])

  useEffect(() => { refetchAll() }, [refetchAll])

  /** ---------- Realtime subscription + polling fallback ---------- */
  useRealtimeRoster(
    rosterDate,
    setRoster,
    setRosterTimes,
    fetchRoster
  )

  /** ---------- Persist status (no optimistic write), then refresh ---------- */
  const setStatusPersist = useCallback(
    async (studentId: string, st: Status, meta?: any) => {
      if (!userId) { alert('Please sign in.'); return }
      setSaving(prev => ({ ...prev, [studentId]: true }))
      let wrote = false

      try {
        // Preferred: secure RPC
        const { error: rpcErr } = await supabase.rpc('api_set_status', {
          p_student_id: studentId,
          p_new_status: st,
          p_meta: meta ?? null,
        })

        if (rpcErr) {
          console.warn('[rpc api_set_status] error; trying direct upsert', rpcErr)
          // Fallback: direct upsert (requires RLS insert/update on roster_status)
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
            alert(`Failed to save.\n\n${upErr.message || upErr}`)
          } else {
            wrote = true
          }
        } else {
          wrote = true
        }
      } catch (e: any) {
        console.error('[api_set_status] exception', e)
        alert(`Failed to save due to an exception.\n\n${e?.message || e}`)
      } finally {
        setSaving(prev => {
          const next = { ...prev }
          delete next[studentId]
          return next
        })
      }

      if (wrote) {
        await Promise.all([fetchRoster(), fetchPickedLogToday()])
      } else {
        await fetchRoster()
      }
    },
    [userId, rosterDate, fetchRoster, fetchPickedLogToday]
  )

  /** ---------- Daily Reset ---------- */
  const onDailyReset = useCallback(async () => {
    if (!userId) { alert('Please sign in.'); return }
    try {
      const { error } = await supabase.rpc('api_daily_reset')
      if (error) console.warn('[rpc api_daily_reset] missing?', error)
    } catch (e) {
      console.warn('[rpc api_daily_reset] exception', e)
    }
    await refetchAll()
  }, [userId, refetchAll])

  /** ---------- Hard logout ---------- */
  const onLogout = useCallback(async () => {
    try { await supabase.auth.signOut() } catch {}
    try {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
    } catch {}
    setUserId(null)
    window.location.replace('/')
  }, [])

  /** ---------- Infer previous status for single Undo on Arrived ---------- */
  const inferPrevStatus = useCallback(
    (s: StudentRow): 'picked' | 'not_picked' => {
      return pickedEverToday.has(s.id) ? 'picked' : 'not_picked'
    },
    [pickedEverToday]
  )

  /** ---------- Global roll-up counts (active students only) ---------- */
  const globalCounts = useMemo(() => {
    const ids = students.filter(s => s.active).map(s => s.id)
    let not_picked = 0, picked = 0, arrived = 0, checked = 0, skipped = 0
    for (const id of ids) {
      const st = roster[id] ?? 'not_picked'
      if (st === 'picked') picked++
      else if (st === 'arrived') arrived++
      else if (st === 'checked') checked++
      else if (st === 'skipped') skipped++
      else not_picked++
    }
    return { not_picked, picked, arrived, checked, skipped }
  }, [students, roster])

  const estHeaderDate = useMemo(() => todayKeyEST(), [])

  /** ---------- If not logged in, show Auth ---------- */
  if (!userId) return <AuthPanePassword />

  /** ---------- App UI (logged in) ---------- */
  return (
    <div className="container">
      {/* Top Nav */}
      <div className="row gap wrap" style={{ marginBottom: 6 }}>
        <div className="seg">
          <button className={'seg-btn' + (page === 'bus' ? ' on' : '')} onClick={() => setPage('bus')}>Bus</button>
          <button className={'seg-btn' + (page === 'center' ? ' on' : '')} onClick={() => setPage('center')}>Center</button>
          <button className={'seg-btn' + (page === 'skip' ? ' on' : '')} onClick={() => setPage('skip')}>Skip</button>
        </div>
        <div className="grow" />
        <div className="row gap" style={{ alignItems:'center' }}>
          {/* compact chips next to date */}
          <span className="chip">To Pick <b>{globalCounts.not_picked}</b></span>
          <span className="chip">Picked <b>{globalCounts.picked}</b></span>
          <span className="chip">Arrived <b>{globalCounts.arrived}</b></span>
          <span className="chip">Checked Out <b>{globalCounts.checked}</b></span>
          <span className="chip">Skipped <b>{globalCounts.skipped}</b></span>

          <div className="muted" style={{ marginLeft: 8 }}>Sunny Days — {estHeaderDate}</div>
          <button className="btn" onClick={onDailyReset}>Daily Reset</button>
          <button className="btn" onClick={onLogout}>Logout</button>
          <div className="muted" style={{ marginLeft: 8 }}>build: v1.2-counts</div>
        </div>
      </div>

      {/* lightweight chip styling */}
      <style>{`
        .chip {
          display:inline-flex; align-items:center; gap:6px;
          padding:2px 8px; border:1px solid #e5e7eb; border-radius:999px;
          font-size:12px; background:#fff;
        }
        .chip b { font-weight:600 }
      `}</style>

      {/* Pages */}
      {page === 'bus' && (
        <BusPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={setStatusPersist}
        />
      )}
      {page === 'center' && (
        <CenterPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={setStatusPersist}
          inferPrevStatus={inferPrevStatus}
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
