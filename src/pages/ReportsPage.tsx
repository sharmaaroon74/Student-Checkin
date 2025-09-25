import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Status } from '../types'

// Utilities
const toEST12 = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }
  return new Intl.DateTimeFormat(undefined, opts).format(d)
}
const isoDayEST = (d: Date) => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' })
  const [y,m,dd] = fmt.format(d).split('-')
  return `${y}-${m}-${dd}`
}

type Row = {
  student_id: string
  student_name: string
  school: string
  picked_time: string // ISO string
  arrived_time: string
  checked_time: string
  pickup_person: string | null
  final_status: Status
}

export default function ReportsPage() {
  const [day, setDay] = useState(() => isoDayEST(new Date()))
  const [hideNoLogs, setHideNoLogs] = useState(true)
  const [hideSkipped, setHideSkipped] = useState(false)
  const [sortKey, setSortKey] = useState<'first'|'last'>('first')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setErr(null)
      try {
        // 1) base rows for selected day
        const { data: base, error: e1 } = await supabase
          .from('roster_status')
          .select(`
            roster_date,
            student_id,
            current_status,
            last_update,
            students (
              first_name,
              last_name,
              school,
              approved_pickups
            )
          `)
          .eq('roster_date', day)
          .order('student_id', { ascending: true })
        if (e1) throw e1

        // 2) logs for the day
        const { data: logs, error: e2 } = await supabase
          .from('logs')
          .select('roster_date, student_id, action, at, meta')
          .eq('roster_date', day)
          .in('action', ['picked','arrived','checked'])
        if (e2) throw e2

        // index logs by student
        const byStudent: Record<string, { picked: any[]; arrived: any[]; checked: any[] }> = {}
        for (const l of (logs ?? [])) {
          const bucket = byStudent[l.student_id] ?? { picked: [], arrived: [], checked: [] }
          if (l.action === 'picked') bucket.picked.push(l)
          else if (l.action === 'arrived') bucket.arrived.push(l)
          else if (l.action === 'checked') bucket.checked.push(l)
          byStudent[l.student_id] = bucket
        }

        const out: Row[] = []
        for (const r of (base ?? [])) {
          // 🔒 Handle `students` being either object OR array
          //   Supabase can nest it as array if the FK is not marked as one-to-one.
          const studentsRel: any = (r as any).students
          const s = Array.isArray(studentsRel) ? (studentsRel[0] ?? {}) : (studentsRel ?? {})
          const approved = Array.isArray(s.approved_pickups) ? s.approved_pickups : []

          const fullName = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()
          const school = s.school ?? ''

          const L = byStudent[r.student_id] ?? { picked: [], arrived: [], checked: [] }
          const latest = (arr:any[]) => (arr && arr.length) ? arr.slice().sort((a,b)=>a.at<b.at?1:-1)[0] : null

          const lp = latest(L.picked)
          const la = latest(L.arrived)
          const lc = latest(L.checked)

          // pickup person (prefer current camelCase key)
          let pickupPerson =
            lc?.meta?.pickupPerson
            ?? lc?.meta?.override_name
            ?? lc?.meta?.pickup_person
            ?? lc?.meta?.approved_person
            ?? lc?.meta?.approved_name
            ?? lc?.meta?.approved_pickup?.name
            ?? lc?.meta?.approved?.name
            ?? lc?.meta?.checkout?.pickup_person
            ?? lc?.meta?.checkout?.approved_name
            ?? null

          // checked time: prefer teacher-entered pickupTime; else event at; else final-state last_update
          const checkedISO =
            (lc?.meta?.pickupTime ? new Date(lc.meta.pickupTime).toISOString() : null)
            ?? lc?.at
            ?? ((r.current_status === 'checked') ? r.last_update : null)

          const pickedISO  = lp?.at ?? ((r.current_status === 'picked')  ? r.last_update : null)
          const arrivedISO = la?.at ?? ((r.current_status === 'arrived') ? r.last_update : null)

          out.push({
            student_id: r.student_id,
            student_name: fullName,
            school,
            picked_time: pickedISO ?? '',
            arrived_time: arrivedISO ?? '',
            checked_time: checkedISO ?? '',
            pickup_person: pickupPerson,
            final_status: r.current_status as Status
          })
        }

        if (!cancelled) setRows(out)
      } catch (e:any) {
        if (!cancelled) setErr(e.message ?? String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [day])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (hideNoLogs) {
        const hasAny = !!(r.picked_time || r.arrived_time || r.checked_time)
        if (!hasAny) return false
      }
      if (hideSkipped && r.final_status === 'skipped') return false
      return true
    })
  }, [rows, hideNoLogs, hideSkipped])

  const sorted = useMemo(() => {
    const getFirst = (name:string)=> name.split(' ')[0] ?? name
    const getLast = (name:string)=> name.split(' ').slice(1).join(' ') || name
    const arr = filtered.slice()
    arr.sort((a,b)=>{
      if (sortKey==='first') return getFirst(a.student_name).localeCompare(getFirst(b.student_name))
      return getLast(a.student_name).localeCompare(getLast(b.student_name))
    })
    return arr
  }, [filtered, sortKey])

  return (
    <div className="container">
      <div className="card">
        <div className="row wrap gap">
          <div className="grow">
            <div className="heading">Reports</div>
            <div className="muted">Daily student flow (single date).</div>
          </div>
          <input
            type="date"
            value={day}
            onChange={e=>setDay(e.target.value)}
            aria-label="Report date"
          />
          <select value={sortKey} onChange={e=>setSortKey(e.target.value as any)}>
            <option value="first">Sort: First Name</option>
            <option value="last">Sort: Last Name</option>
          </select>
          <label className="row" style={{gap:6}}>
            <input type="checkbox" checked={hideNoLogs} onChange={e=>setHideNoLogs(e.target.checked)} />
            <span className="muted">Hide students with no logs</span>
          </label>
          <label className="row" style={{gap:6}}>
            <input type="checkbox" checked={hideSkipped} onChange={e=>setHideSkipped(e.target.checked)} />
            <span className="muted">Hide skipped</span>
          </label>
        </div>
      </div>

      <div className="card" style={{marginTop:12}}>
        {loading && <div className="muted">Loading…</div>}
        {err && <div style={{color:'crimson'}}>{err}</div>}

        {!loading && !err && (
          <div className="list">
            <div className="row" style={{fontWeight:700, borderBottom:'1px solid var(--b)', paddingBottom:8}}>
              <div style={{flex:2}}>Student Name</div>
              <div style={{flex:1}}>School</div>
              <div style={{flex:1}}>School Pickup Time</div>
              <div style={{flex:1}}>Sunny Days Arrival Time</div>
              <div style={{flex:1}}>Checkout Time</div>
              <div style={{flex:1}}>Picked Up By</div>
            </div>

            {sorted.map((r)=>(
              <div key={r.student_id} className="row" style={{borderBottom:'1px solid var(--b)', padding:'8px 0'}}>
                <div style={{flex:2}}>{r.student_name}</div>
                <div style={{flex:1}}>{r.school}</div>
                <div style={{flex:1}}>{toEST12(r.picked_time)}</div>
                <div style={{flex:1}}>{toEST12(r.arrived_time)}</div>
                <div style={{flex:1}}>{toEST12(r.checked_time)}</div>
                <div style={{flex:1}}>{r.pickup_person ?? ''}</div>
              </div>
            ))}

            {!sorted.length && <div className="muted">No rows for this date.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
