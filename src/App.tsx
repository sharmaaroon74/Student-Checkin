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

/** ---------- Simple Auth UI (email magic link) ---------- */
function AuthPane() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const sendLink = async () => {
    if (!email) return
    setSending(true)
    setMsg(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin, // make sure this URL is in Supabase Auth > Redirect URLs
      },
    })
    setSending(false)
    if (error) setMsg(`Error: ${error.message}`)
    else setMsg('Magic link sent! Check your email and click the link to finish sign-in.')
  }

  return (
    <div className="container" style={{ maxWidth: 520, marginTop: 40 }}>
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Sunny Days – Sign in</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Enter your email and we’ll send you a one-time magic link.
        </p>
        <div className="row gap">
          <input
            placeholder="you@school.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn primary" onClick={sendLink} disabled={sending}>
            {sending ? 'Sending…' : 'Send Link'}
          </button>
        </div>
        {msg && <div style={{ marginTop: 10 }} className="muted">{msg}</div>}
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('bus')

  const [userId, setUserId] = useState<string | null>(null)         // <— session guard
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
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })

    if (error) {
      console.warn('[students] load error', error)
      alert('Failed to load students (RLS/policy or no session). See console.')
      return
    }
    if (!data || data.length === 0) {
      console.warn('[students] 0 rows returned. Possible RLS block, no data, or not logged in.')
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

  useEffect(() => {
    refetchAll()
  }, [refetchAll])

  /** ---------- Persist status (no optimistic write), then refresh ---------- */
  const setStatusPersist = useCallback(
    async (studentId: string, st: Status, meta?: any) => {
      if (!userId) { alert('Please sign in.'); return }
      setSaving(prev => ({ ...prev, [studentId]: true }))
      let wrote = false

      try {
        const { error: rpcErr } = await supabase.rpc('api_set_status', {
          p_student_id: studentId,
          p_new_status: st,
          p_meta: meta ?? null,
        })

        if (rpcErr) {
          console.warn('[rpc api_set_status] error; trying direct upsert', rpcErr)
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

  /** ---------- Daily Reset (optional RPC) ---------- */
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
    setUserId(null)         // show AuthPane immediately
    window.location.replace('/') // ensure a clean reload
  }, [])

  const inferPrevStatus = useCallback(
    (s: StudentRow): 'picked' | 'not_picked' => {
      return pickedEverToday.has(s.id) ? 'picked' : 'not_picked'
    },
    [pickedEverToday]
  )

  const estHeaderDate = useMemo(() => todayKeyEST(), [])

  /** ---------- If not logged in, show Auth ---------- */
  if (!userId) {
    return <AuthPane />
  }

  /** ---------- App UI (logged in) ---------- */
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
