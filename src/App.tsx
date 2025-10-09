import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Status, StudentRow } from './types'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import ReportsPage from './pages/ReportsPage'
import Login from './Login'
import { useRealtimeRoster } from './hooks/useRealtimeRoster'
import logo from './assets/sunnydays-logo.png'  


type Page = 'bus' | 'center' | 'skip' | 'reports'
type Role = 'admin' | 'staff' | 'driver'
const ENFORCE_ROLES: boolean = import.meta.env.VITE_ENFORCE_ROLES === 'true'

const PERMS: Record<Page, Role[]> = {
  bus: ['driver','admin'],
  center: ['staff','admin'],
  skip: ['admin'],
  reports: ['admin'],
}

function todayKeyEST(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now)
}

/* === ADDED START: helper to convert 'YYYY-MM-DDTHH:mm' (EST wall time) to UTC ISO === */

 function estLocalToUtcIso(local: string): string | null {
   // Interpret 'YYYY-MM-DDTHH:mm' as America/New_York wall time (handles DST correctly)
   const [date, time] = local.split('T')
   if (!date || !time) return null
   const [y, mo, d] = date.split('-').map(Number)
   const [hh, mm] = time.split(':').map(Number)
   // desired local civil time as a millisecond value (in UTC scale)
   const desiredLocalMs = Date.UTC(y, mo - 1, d, hh, mm, 0, 0)
   let utcMs = desiredLocalMs // initial guess
   const dtf = new Intl.DateTimeFormat('en-US', {
     timeZone: 'America/New_York',
     hour12: false,
     year: 'numeric', month: '2-digit', day: '2-digit',
     hour: '2-digit', minute: '2-digit'
   })
   // Iterate to solve utcMs such that NY time equals desiredLocalMs fields
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

/* === ADDED END === */

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

  // Track "picked today" independently of current status.
  // Seed from logs for today, then keep it in sync via handleSetStatus.
  const [pickedTodayMap, setPickedTodayMap] = useState<Record<string, true>>({})
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('logs').select('student_id').eq('roster_date', rosterDateEST).eq('action', 'picked')
      if (!cancelled && !error && data) setPickedTodayMap(Object.fromEntries(data.map((r:any)=>[r.student_id, true])))
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

  // Auth (email/password)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setIsAuthed(!!data.session)
      setSessionReady(true)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange(async (evt, sess) => {
      setIsAuthed(!!sess)
      setSessionReady(true)
      if (evt !== 'SIGNED_IN' || !sess?.user) return

      // Compute today's key at the moment of sign-in (EST)
      const todayEST = todayKeyEST()
      const lsKey = `sd_autoskip_${todayEST}`

      // If we’ve already run today on this device, short-circuit fast.
      if (localStorage.getItem(lsKey)) return

      try {
        // Strong guard: if any roster_status for today exists, assume prepare+autoskip already ran.
        const { data: rs, error: rsErr } = await supabase
          .from('roster_status')
          .select('student_id', { count: 'exact', head: true })
          .eq('roster_date', todayEST)

        if (rsErr) {
          console.warn('[autoskip guard] roster_status count error (continuing defensively):', rsErr)
        }

        const alreadyPrepared = (rs && typeof (rs as any).length === 'number' ? (rs as any).length > 0 : false)

        if (!alreadyPrepared) {
          const { error } = await supabase.rpc('api_prepare_today_and_apply_auto_skip')
          if (error) {
            console.warn('[prepare_today] RPC error (non-fatal):', error)
          } else {
            // only stamp success when RPC succeeded
            localStorage.setItem(lsKey, '1')
          }
        } else {
          // roster exists already — treat as prepared for today
          localStorage.setItem(lsKey, '1')
        }
      } catch (e) {
        console.warn('[autoskip guard] unexpected error (non-fatal):', e)
      }
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
      setStudents([]); return
    }
    if (!data || data.length === 0) {
      console.warn('[students] 0 rows returned. Possible RLS block or empty table.')
      setStudents([]); return
    }
    setStudents(data as StudentRow[])
  }

  /* === CHANGED START: refetchTodayRoster now prefers meta.pickupTime for 'checked' logs === */
  async function refetchTodayRoster() {
    // 1) fetch current roster rows for today
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
      // only these statuses show a time in the UI
      if (st === 'picked' || st === 'arrived' || st === 'checked') {
        idsNeedingEarliest.push(id)
      }
    }

    // 2) build times using the EARLIEST effective time per (student, current_status) for today
    const times: Record<string, string> = {}
    if (idsNeedingEarliest.length > 0) {
    const { data: logRows, error: logErr } = await supabase
      .from('logs')
      .select('student_id, action, at, meta')
        .eq('roster_date', rosterDateEST)
        .in('action', ['picked','arrived','checked'])
        .in('student_id', idsNeedingEarliest)

      if (logErr) {
        console.warn('[logs earliest fetch] non-fatal:', logErr)
      } else if (logRows && logRows.length) {
        const earliest: Record<string, Record<string, string>> = {}
        for (const row of logRows) {
          const sid = row.student_id as string
          const act = row.action as Status

          const rawAt = row.at as string
          const meta = (row as any).meta || {}
           // Prefer modal time; convert EST local → UTC ISO so Center renders EST correctly.
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
        // set time only for the student's current status
        for (const sid of idsNeedingEarliest) {
          const st = statusFor[sid]
          let t = earliest[sid]?.[st]
          // If currently 'checked' and there was no meta override/log captured,
          // fall back to roster_status.last_update so UI shows the latest checkout time for the day.
          if (!t && st === 'checked' && lastUpdateFor[sid]) {
            t = lastUpdateFor[sid] as string
          }
          if (t) times[sid] = t
        }
      }
    }

    // 3) commit state
    setRoster(next)
    setRosterTimes(times)
  }
  /* === CHANGED END === */

  async function handleSetStatus(studentId: string, st: Status, meta?: any) {
    // helper: status order to detect Undo (moving "backwards" in the flow)
    const ORDER: Record<Status, number> = {
      not_picked: 0, picked: 1, arrived: 2, checked: 3, skipped: 4,
    }

    const prevStatus = (roster[studentId] ?? 'not_picked') as Status
    const prevTime   = rosterTimes[studentId] || null

    // normalize override person (unchanged)
    if (meta && !meta.pickupPerson && meta.override) {
      meta.pickupPerson = meta.override;
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
      // best-effort log
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

  // Keep the "picked today" tally consistent with user actions:
  // - increment ONLY when explicitly marking picked
  // - remove ONLY when explicitly moving to ToPicked (not_picked)
  setPickedTodayMap(prev => {
    const m = { ...prev }
    if (st === 'picked') {
      m[studentId] = true
    } else if (st === 'not_picked') {
      delete m[studentId]
    }
    return m
  })

    // Undo → restore original earliest time for that status; else prefer override/now
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
      if (!tsErr && tsRow?.at) {
        restoredAtIso = tsRow.at as string
      } else {
        restoredAtIso = new Date().toISOString()
      }
    }
    setRosterTimes(prev => ({
      ...prev,
      // If undo: use restoredAtIso (earliest real log).
      // Else: prefer the modal's local (EST) time string for immediate UI; fallback to now.
      [studentId]: restoredAtIso ?? (atOverrideLocal ?? new Date().toISOString()),
    }))
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

        <div className="row gap" style={{ marginLeft: 'auto', alignItems: 'center' }}>
          <span className="chip">{todayESTLabel()}</span>
          <button className="btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* Render pages */}
      {page === 'bus' && (
        <BusPage students={students} roster={roster} onSet={handleSetStatus} pickedTodayIds={Object.keys(pickedTodayMap)} />
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
        <SkipPage students={students} roster={roster} onSet={handleSetStatus} pickedTodayIds={Object.keys(pickedTodayMap)} />
      )}

      {page === 'reports' && <ReportsPage />}

      {page === 'skip' && (
        <SkipPage students={students} roster={roster} onSet={handleSetStatus} />
      )}
    </div>
  )
}
