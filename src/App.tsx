// src/App.tsx
import React, { useEffect, useMemo, useState, useRef } from 'react'
import { supabase } from './lib/supabase'
import type { Status, StudentRow } from './types'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import ReportsPage from './pages/ReportsPage'
import Login from './Login'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'
import logo from './assets/sunnydays-logo.png'
import AdminStudentsPage from './pages/AdminStudentsPage'

// NEW: stability/auth hardening helpers
import { verifySession } from './lib/sessionGuard'
import { enforceStorageVersion } from './lib/storageVersion'
import { startAuthMonitor } from './lib/authEvents'
import { startBootstrapWatchdog } from './lib/watchdog'
import { forceLogout } from './lib/forceLogout'

type Page = 'bus' | 'center' | 'skip' | 'reports' | 'adminStudents'
type Role = 'admin' | 'staff' | 'driver'
const ENFORCE_ROLES: boolean = import.meta.env.VITE_ENFORCE_ROLES === 'true'

const PERMS: Record<Page, Role[]> = {
  bus: ['driver','admin'],
  center: ['staff','admin'],
  skip: ['admin'],
  reports: ['admin'],
  adminStudents: ['admin'],
}

function todayKeyEST(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now)
}

/* === helper: convert 'YYYY-MM-DDTHH:mm' (EST wall time) → UTC ISO (DST-safe) === */
function estLocalToUtcIso(local: string): string | null {
  const [date, time] = local.split('T')
  if (!date || !time) return null
  const [y, mo, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const desiredLocalMs = Date.UTC(y, mo - 1, d, hh, mm, 0, 0)
  let utcMs = desiredLocalMs
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
  for (let i = 0; i < 3; i++) {
    const parts = dtf.formatToParts(new Date(utcMs))
    const nyY   = Number(parts.find(p => p.type === 'year')?.value)
    const nyMo  = Number(parts.find(p => p.type === 'month')?.value)
    const nyD   = Number(parts.find(p => p.type === 'day')?.value)
    const nyH   = Number(parts.find(p => p.type === 'hour')?.value)
    const nyMin = Number(parts.find(p => p.type === 'minute')?.value)
    const renderedLocalMs = Date.UTC(nyY, nyMo - 1, nyD, nyH, nyMin, 0, 0)
    const diff = desiredLocalMs - renderedLocalMs
    if (diff === 0) break
    utcMs += diff
  }
  return new Date(utcMs).toISOString()
}

/* === label helper === */
function todayESTLabel(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: '2-digit', year: 'numeric'
  }).format(now)
}

/* === Safe localStorage helpers (never throw) === */
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch { /* ignore */ }
}

export default function App() {
  const [page, setPage] = useState<Page>('bus')
  const [sessionReady, setSessionReady] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)

  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [rosterTimes, setRosterTimes] = useState<Record<string, string>>({})

  const rosterDateEST = todayKeyEST()

  // Hoisted: run-once-per-day auto-skip guard (DB count + localStorage)
  const autoSkipRanRef = useRef(false)
  const runAutoSkipGuard = useMemo(() => {
    return async () => {
      if (autoSkipRanRef.current) return
      const todayEST = todayKeyEST()
      const lsKey = `sd_autoskip_${todayEST}`
      if (lsGet(lsKey)) { autoSkipRanRef.current = true; return }
      try {
        // Count-only guard (data=null with head:true)
        const { count, error: rsErr } = await supabase
          .from('roster_status')
          .select('*', { count: 'exact', head: true })
          .eq('roster_date', todayEST)
        if (rsErr) console.warn('[autoskip guard] roster_status count error:', rsErr)
        const alreadyPrepared = (count ?? 0) > 0
        if (!alreadyPrepared) {
          const { error } = await supabase.rpc('api_prepare_today_and_apply_auto_skip')
          if (error) {
            console.warn('[prepare_today] RPC error (non-fatal):', error)
            return
          }
        }
        // mark done (once/day per device) and refresh UI data
        lsSet(lsKey, '1')
        autoSkipRanRef.current = true
        await fetchStudents()
        await refetchTodayRoster()
      } catch (e) {
        console.warn('[autoskip guard] unexpected error (non-fatal):', e)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track "picked today" independently of current status.
  // Seed from logs for today, then keep it in sync via handleSetStatus.
  const [pickedTodayMap, setPickedTodayMap] = useState<Record<string, true>>({})
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('logs')
        .select('student_id')
        .eq('roster_date', rosterDateEST)
        .eq('action', 'picked')
      if (!cancelled && !error && data) {
        setPickedTodayMap(Object.fromEntries(data.map((r:any)=>[r.student_id, true])))
      }
    })()
    return () => { cancelled = true }
  }, [rosterDateEST])

  const [role, setRole] = useState<Role | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    if (!isAuthed) { setRole(null); setRoleLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) { setRole(null); setRoleLoading(false) } ; return }
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()
      if (cancelled) return
      if (error) { setRole(null); setRoleLoading(false); return }
      setRole((data?.role ?? null) as Role | null)
      setRoleLoading(false)
    })()
    return () => { cancelled = true }
  }, [isAuthed])

  function isAllowed(p: Page): boolean {
    if (!ENFORCE_ROLES) return true
    if (!role) return false
    return PERMS[p].includes(role)
  }

  useEffect(() => {
    if (!ENFORCE_ROLES || roleLoading) return
    if (!isAllowed(page)) {
      const next: Page = role === 'staff' ? 'center' : 'bus'
      setPage(next)
    }
  }, [role, roleLoading, page])

  // Realtime + light polling fallback
  useRealtimeRoster(rosterDateEST, setRoster, setRosterTimes, refetchTodayRoster)

  /* =========================
     Auth/session BOOTSTRAP (hardened)
     ========================= */
  useEffect(() => {
    let mounted = true
    ;(async () => {
      // 0) Clear only our app’s stale storage on version change
      enforceStorageVersion()

      // 1) Verify session truly valid (not just “some token exists”)
      const verdict = await verifySession()
      if (!mounted) return
      if (verdict !== 'ok') {
        // No redirect here — just render <Login/> at "/"
        setIsAuthed(false)
        setSessionReady(true)
        return
      }

      // 2) We’re actually signed in
      setIsAuthed(true)
      setSessionReady(true)

      // 3) Start Supabase auth monitor (catches refresh/signout issues)
      const monitor = startAuthMonitor()

      // 4) Run once-per-day guard now for persisted sessions
      await runAutoSkipGuard()

      // 5) Start watchdog to detect missing header/logout, self-heal
      startBootstrapWatchdog()

      // cleanup
      return () => monitor.stop()
    })()
    return () => { mounted = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fallback: if auth callback timing doesn’t trigger (rare), run the guard
  // once when the app knows we are authed and session is ready.
  useEffect(() => {
    if (!sessionReady || !isAuthed) return
    runAutoSkipGuard().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, isAuthed, rosterDateEST])

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
      setStudents([]); return
    }
    if (!data || data.length === 0) {
      console.warn('[students] 0 rows returned. Possible RLS block or empty table.')
      setStudents([]); return
    }
    setStudents(data as StudentRow[])
  }

  /* === refetchTodayRoster prefers meta.pickupTime for 'checked' logs (if present) === */
  async function refetchTodayRoster() {
    // 1) fetch current roster for today
    const { data, error } = await supabase
      .from('roster_status')
      .select('student_id, current_status, last_update')
      .eq('roster_date', rosterDateEST)

    if (error) {
      console.error('[roster] fetch error', error)
      return
    }

    const next: Record<string, Status> = {}
    const idsNeedingEarliest: string[] = []
    const statusFor: Record<string, Status> = {}
    const lastUpdateFor: Record<string, string | null> = {}

    for (const r of data ?? []) {
      const st = r.current_status as Status
      const id = r.student_id as string
      next[id] = st
      statusFor[id] = st
      lastUpdateFor[id] = (r.last_update as string) ?? null
      if (st === 'picked' || st === 'arrived' || st === 'checked') {
        idsNeedingEarliest.push(id)
      }
    }

    // 2) earliest effective time per (student, current_status) for today
    const times: Record<string, string> = {}
    const ids = idsNeedingEarliest
    if (ids.length > 0) {
      const { data: logRows, error: logErr } = await supabase
        .from('logs')
        .select('student_id, action, at, meta')
        .eq('roster_date', rosterDateEST)
        .in('action', ['picked','arrived','checked'])
        .in('student_id', ids)

      if (logErr) {
        console.warn('[logs earliest fetch] non-fatal:', logErr)
      } else if (logRows && logRows.length) {
        const earliest: Record<string, Record<string, string>> = {}
        for (const row of logRows) {
          const sid = row.student_id as string
          const act = row.action as Status
          const rawAt = row.at as string
          const meta = (row as any).meta || {}
          const effectiveAt =
            (act === 'checked' && meta && meta.pickupTime)
              ? (estLocalToUtcIso(String(meta.pickupTime)) ?? String(meta.pickupTime))
              : rawAt

          earliest[sid] ??= {}
          const existing = earliest[sid][act]
          if (!existing || new Date(effectiveAt).getTime() < new Date(existing).getTime()) {
            earliest[sid][act] = effectiveAt
          }
        }
        for (const sid of ids) {
          const st = statusFor[sid]
          let t = earliest[sid]?.[st]
          if (!t && st === 'checked' && lastUpdateFor[sid]) t = lastUpdateFor[sid] as string
          if (t) times[sid] = t
        }
      }
    }

    setRoster(next)
    setRosterTimes(times)
  }

  async function handleSetStatus(studentId: string, st: Status, meta?: any) {
    const ORDER: Record<Status, number> = {
      not_picked: 0, picked: 1, arrived: 2, checked: 3, skipped: 4,
    }

    const prevStatus = (roster[studentId] ?? 'not_picked') as Status
    const prevTime   = rosterTimes[studentId] || null

    if (meta && !meta.pickupPerson && meta.override) {
      meta.pickupPerson = meta.override
    }

    // === UPDATED POLICY: allow admin override; only require a non-empty pickup name ===
    // To keep the modal open on error, throw (reject) instead of alerting.
    if (st === 'checked') {
      const person = String(meta?.pickupPerson ?? '').trim()
      if (!person) {
        const err: any = new Error('Please select or enter a pickup person.')
        err.code = 'PICKUP_REQUIRED'
        throw err
      }
    }

    const isUndo     = ORDER[st] < ORDER[prevStatus]
    const enrichedMeta = {
      ...(meta ?? {}),
      prev_status: prevStatus,
      prev_time: prevTime,
    }

    // Convert modal datetime-local (EST) to UTC ISO for consistent UI rendering.
    const atOverrideLocal: string | null =
      (st === 'checked' && enrichedMeta?.pickupTime)
        ? (estLocalToUtcIso(String(enrichedMeta.pickupTime)) ?? String(enrichedMeta.pickupTime))
        : null

    const { error: rpcErr } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_new_status: st,
      p_meta: enrichedMeta,
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
      const stu = students.find(s => s.id === studentId)
      const student_name = stu ? `${stu.first_name} ${stu.last_name}` : null
      const { error: logErr } = await supabase.from('logs').insert({
        at: new Date().toISOString(),
        roster_date: rosterDateEST,
        student_id: studentId,
        student_name,
        action: st,
        meta: enrichedMeta,
      })
      if (logErr) console.warn('[logs insert] ignored', logErr)
    }

    setRoster(prev => ({ ...prev, [studentId]: st }))

    // picked-tally: increment ONLY on picked; remove ONLY on not_picked (Undo to ToPicked)
    setPickedTodayMap(prev => {
      const m = { ...prev }
      if (st === 'picked') m[studentId] = true
      else if (st === 'not_picked') delete m[studentId]
      return m
    })

    // UI times: if Undo, restore earliest for that status; else prefer override/now
    let restoredAtIso: string | null = null
    if (isUndo) {
      const { data: tsRow, error: tsErr } = await supabase
        .from('logs')
        .select('at')
        .eq('roster_date', rosterDateEST)
        .eq('student_id', studentId)
        .eq('action', st)
        .order('at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!tsErr && tsRow?.at) restoredAtIso = tsRow.at as string
      else restoredAtIso = new Date().toISOString()
    }
    setRosterTimes(prev => ({
      ...prev,
      [studentId]: restoredAtIso ?? (atOverrideLocal ?? new Date().toISOString()),
    }))
  }

  async function handleLogout() {
    await forceLogout()
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
      <div
        className="row wrap"
        data-app-header
        style={{ marginBottom: 10, alignItems: 'center' }}
      >
        <div className="row gap">
          {/* Brand */}
          <div className="brand">
            <img src={logo} alt="Sunny Days after school" />
            <span className="title">Sunny Days</span>
          </div>

          {(!ENFORCE_ROLES || (role === 'driver' || role === 'admin')) && (
            <button className={page==='bus'?'btn primary':'btn'} onClick={()=>setPage('bus')}>🚌 Bus</button>
          )}
          {(!ENFORCE_ROLES || (role === 'staff' || role === 'admin')) && (
            <button className={page==='center'?'btn primary':'btn'} onClick={()=>setPage('center')}>☀️ Sunny Days</button>
          )}
          {(!ENFORCE_ROLES || (role === 'admin')) && (
            <button className={page==='skip'?'btn primary':'btn'} onClick={()=>setPage('skip')}>⏭️ Skip</button>
          )}
          {(!ENFORCE_ROLES || (role === 'admin')) && (
            <button className={page==='reports'?'btn primary':'btn'} onClick={()=>setPage('reports')}>📋 Reports</button>
          )}
        </div>

          {(!ENFORCE_ROLES || (role === 'admin')) && (
            <button className={page==='adminStudents'?'btn primary':'btn'} onClick={()=>setPage('adminStudents')}>👤 Students</button>
          )}

        <div className="row gap" style={{ marginLeft: 'auto', alignItems: 'center' }}>
          <span className="chip">{todayESTLabel()}</span>
          <button
            className="btn"
            data-logout-btn
            onMouseDown={(e)=>e.preventDefault()}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Render pages */}
      {page === 'bus' && (
        <BusPage
          students={students}
          roster={roster}
          onSet={handleSetStatus}
          pickedTodayIds={Object.keys(pickedTodayMap)}
        />
      )}

      {page === 'center' && (
        <CenterPage
          students={students}
          roster={roster}
          rosterTimes={rosterTimes}
          onSet={handleSetStatus}
          pickedTodayIds={Object.keys(pickedTodayMap)}
        />
      )}

      {page === 'skip' && (
        <SkipPage
          students={students}
          roster={roster}
          onSet={handleSetStatus}
          pickedTodayIds={Object.keys(pickedTodayMap)}
        />
      )}

      {page === 'reports' && <ReportsPage />}

      {page === 'adminStudents' && (
        <AdminStudentsPage />
      )}

    </div>
  )
}
