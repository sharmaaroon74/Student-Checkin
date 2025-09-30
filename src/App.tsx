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
  const [date, time] = local.split('T')
  if (!date || !time) return null
  const [y, mo, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  // Build a Date using America/New_York as the intended wall time
  const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  estNow.setFullYear(y, mo - 1, d)
  estNow.setHours(hh, mm, 0, 0)
  // Convert to UTC ISO
  const utcMs = estNow.getTime() - (estNow.getTimezoneOffset() * 60000)
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

  // 2) build times using the EARLIEST log time per (student, current_status) for today
  const times: Record<string, string> = {}
  if (idsNeedingEarliest.length > 0) {
    // PostgREST: group by student_id, action and compute min(at)
    // We filter action to only the three timed statuses.
    const { data: logRows, error: logErr } = await supabase
      .from('logs')
      .select('student_id, action, at')
      .eq('roster_date', rosterDateEST)
      .in('action', ['picked','arrived','checked'])
      .in('student_id', idsNeedingEarliest)

    if (logErr) {
      console.warn('[logs earliest fetch] non-fatal:', logErr)
    } else if (logRows && logRows.length) {
      // reduce to earliest at per (student_id, action)
      const earliest: Record<string, Record<string, string>> = {}
      for (const row of logRows) {
        const sid = row.student_id as string
        const act = row.action as Status
        const at  = row.at as string
        earliest[sid] ??= {}
        const existing = earliest[sid][act]
        if (!existing || new Date(at).getTime() < new Date(existing).getTime()) {
          earliest[sid][act] = at
        }
      }
      // set time only for the student's current status
      for (const sid of idsNeedingEarliest) {
        const st = statusFor[sid]
        const t = earliest[sid]?.[st]
        if (t) times[sid] = t
        else if (lastUpdateFor[sid]) times[sid] = lastUpdateFor[sid] as string
      }
    }
  }

  // 3) commit state
  setRoster(next)
  setRosterTimes(times)
}









  async function handleSetStatus(studentId: string, st: Status, meta?: any) {
    // helper: status order to detect Undo (moving "backwards" in the flow)
    const ORDER: Record<Status, number> = {
      not_picked: 0, picked: 1, arrived: 2, checked: 3, skipped: 4,
    }

    const prevStatus = (roster[studentId] ?? 'not_picked') as Status
    const prevTime   = rosterTimes[studentId] || null
    // normalize: if admin override provided and no approved pickup selected,
    // store it uniformly as pickupPerson in meta so logs & reports see it.
    if (meta && !meta.pickupPerson && meta.override) {
      meta.pickupPerson = meta.override;
    }

    const isUndo     = ORDER[st] < ORDER[prevStatus]  // e.g., checked -> arrived, arrived -> picked
    const enrichedMeta = {
      ...(meta ?? {}),
      prev_status: prevStatus,
      prev_time: prevTime, // ISO if available
    }

    /* === ADDED START: compute atIsoOverride from modal time for 'checked' === */
    let atIsoOverride: string | null = null
    if (st === 'checked' && enrichedMeta?.pickupTime) {
      const iso = estLocalToUtcIso(String(enrichedMeta.pickupTime))
      if (iso) atIsoOverride = iso
    }
    /* === ADDED END === */

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
      // best-effort log (ok if RLS blocks). Include student_name + enrichedMeta so history is preserved.
      const stu = students.find(s => s.id === studentId)
      const student_name = stu ? `${stu.first_name} ${stu.last_name}` : null
      const { error: logErr } = await supabase.from('logs').insert({
        /* === CHANGED: prefer override time for the inserted log === */
        at: atIsoOverride ?? new Date().toISOString(),
        roster_date: rosterDateEST,
        student_id: studentId,
        student_name,            // satisfies NOT NULL if found; if RLS/NOT NULL fails, we only warn
        action: st,
        meta: enrichedMeta,
      })
      if (logErr) console.warn('[logs insert] ignored', logErr)
     }

    setRoster(prev => ({ ...prev, [studentId]: st }))

    // For Undo, restore the ORIGINAL timestamp (first time that status was set today)
    // from logs. Otherwise, keep "now" behavior (but prefer override for checked).
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
        // fallback: if for any reason the log isn't found, keep "now"
        restoredAtIso = new Date().toISOString()
      }
    }
    setRosterTimes(prev => ({
      ...prev,
      /* === CHANGED: prefer the override time for immediate UI unless it's an Undo === */
      [studentId]: restoredAtIso ?? (atIsoOverride ?? new Date().toISOString()),
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
          {/* Brand: logo + wordmark (word hidden on small screens via CSS) */}
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

      {page === 'reports' && (
        <ReportsPage />
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
