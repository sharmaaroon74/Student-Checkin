// src/pages/ReportsPage.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Status } from '../types'

type Row = {
  first_name: string
  last_name: string
  school: string
  picked_time: string | null
  arrived_time: string | null
  checked_time: string | null
  pickup_person: string | null
  current_status: Status
}

type StudentOption = { id: string; first_name: string; last_name: string }
type TabMode = 'daily' | 'byStudent'

function fmt12(iso?: string | null) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'America/New_York'
    }).format(d)
  } catch { return '' }
}

export default function ReportsPage() {
  const [dateStr, setDateStr] = useState<string>(() => {
    const now = new Date()
    const y = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric' }).format(now)
    const m = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', month: '2-digit' }).format(now)
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', day: '2-digit' }).format(now)
    return `${y}-${m}-${d}`
  })
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [hideEmpty, setHideEmpty] = useState(true)
  const [sortKey, setSortKey] = useState<'first'|'last'>('last')

  const [tab, setTab] = useState<TabMode>('daily')
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([])
  const [studentId, setStudentId] = useState<string>('')
  const [fromDate, setFromDate] = useState<string>('') // optional
  const [toDate, setToDate] = useState<string>('')     // optional

  useEffect(() => {
    if (tab === 'daily') {
      fetchDaily().catch(()=>{})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, hideEmpty, sortKey, tab])

  useEffect(() => {
    if (tab === 'byStudent') {
      (async () => {
        const { data, error } = await supabase
          .from('students')
          .select('id, first_name, last_name')
          .order('last_name', { ascending: true })
        if (!error && data) setStudentOptions(data as StudentOption[])
      })()
    }
  }, [tab])

  async function fetchDaily() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('report_daily_status', { p_date: dateStr })
      if (error) {
        console.error('[report_daily_status]', error)
        setRows([])
      } else {
        const mapped = (data ?? []).map((r: any) => ({
          first_name: r.first_name,
          last_name: r.last_name,
          school: r.school,
          picked_time: r.picked_time,
          arrived_time: r.arrived_time,
          checked_time: r.checked_time,
          pickup_person: r.pickup_person,
          current_status: r.current_status as Status,
        })) as Row[]
        setRows(mapped)
      }
    } finally { setLoading(false) }
  }

  async function fetchByStudent() {
    if (!studentId) { setRows([]); return }
    setLoading(true)
    try {
      const qb = supabase
        .from('logs')
        .select('roster_date, action, at, meta')
        .eq('student_id', studentId)
        .order('roster_date', { ascending: true })
        .order('at', { ascending: true })
      if (fromDate) qb.gte('roster_date', fromDate)
      if (toDate) qb.lte('roster_date', toDate)

      const { data: logs, error: logErr } = await qb
      if (logErr) {
        console.error('[byStudent] logs error', logErr)
        setRows([]); return
      }

      let school = ''
      {
        const { data: srow, error: sErr } = await supabase
          .from('students')
          .select('school, first_name, last_name')
          .eq('id', studentId)
          .maybeSingle()
        if (!sErr && srow) {
          school = srow.school ?? ''
        }
      }

      type DayAgg = {
        picked_time: string | null
        arrived_time: string | null
        checked_time: string | null
        pickup_person: string | null
        current_status: Status
      }
      const byDate = new Map<string, DayAgg>()
      for (const row of (logs ?? [])) {
        const d = row.roster_date as string
        const action = row.action as Status
        const at = row.at as string
        const meta = row.meta as any
        const agg = byDate.get(d) ?? {
          picked_time: null, arrived_time: null, checked_time: null,
          pickup_person: null, current_status: 'not_picked' as Status
        }
        if (action === 'picked') {
          if (!agg.picked_time || new Date(at) < new Date(agg.picked_time)) agg.picked_time = at
        } else if (action === 'arrived') {
          if (!agg.arrived_time || new Date(at) < new Date(agg.arrived_time)) agg.arrived_time = at
        } else if (action === 'checked') {
          if (!agg.checked_time || new Date(at) < new Date(agg.checked_time)) {
            agg.checked_time = at
            if (meta && (meta.pickupPerson || meta.override)) {
              agg.pickup_person = meta.pickupPerson ?? meta.override ?? null
            }
          }
        }
        agg.current_status = action
        byDate.set(d, agg)
      }

      const out: Row[] = Array.from(byDate.entries()).map(([d, agg]) => ({
        first_name: '',
        last_name: d, // date string key (we’ll display this as the Date column)
        school,
        picked_time: agg.picked_time,
        arrived_time: agg.arrived_time,
        checked_time: agg.checked_time,
        pickup_person: agg.pickup_person,
        current_status: agg.current_status,
      }))
      setRows(out)
    } finally { setLoading(false) }
  }

  const displayRows = useMemo(() => {
    if (tab === 'daily') {
      const base = hideEmpty ? rows.filter(r => r.picked_time || r.arrived_time || r.checked_time || r.pickup_person) : rows
      const sorted = [...base].sort((a,b)=>{
        if (sortKey === 'last') return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)
        return a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      })
      return sorted
    } else {
      const sorted = [...rows].sort((a,b) => a.last_name.localeCompare(b.last_name)) // by date asc
      return sorted
    }
  }, [rows, hideEmpty, sortKey, tab])

  return (
    <div className="container">
      <div className="card">
        <div className="row wrap" style={{justifyContent:'space-between', alignItems:'center'}}>
          <div className="row gap">
            <div className="seg">
              <button className={`seg-btn ${tab==='daily'?'on':''}`} onClick={()=>setTab('daily')}>Daily</button>
              <button className={`seg-btn ${tab==='byStudent'?'on':''}`} onClick={()=>setTab('byStudent')}>By Student</button>
            </div>
          </div>
          {tab === 'daily' && (
            <div className="row gap">
              <div className="label">Date</div>
              <input type="date" value={dateStr} onChange={e=>setDateStr(e.target.value)} />
              <label className="row gap" style={{marginLeft:8}}>
                <input type="checkbox" checked={hideEmpty} onChange={e=>setHideEmpty(e.target.checked)} />
                <span className="label">Hide rows with no times</span>
              </label>
              <div className="label" style={{marginLeft:8}}>Sort</div>
              <select value={sortKey} onChange={e=>setSortKey(e.target.value as any)}>
                <option value="last">Last Name</option>
                <option value="first">First Name</option>
              </select>
            </div>
          )}
          {tab === 'byStudent' && (
            <div className="row gap">
              <div className="label">Student</div>
              <select value={studentId} onChange={e=>setStudentId(e.target.value)}>
                <option value="">— Select —</option>
                {studentOptions.map(s=>(
                  <option key={s.id} value={s.id}>
                    {s.last_name}, {s.first_name}
                  </option>
                ))}
              </select>
              <div className="label" style={{marginLeft:8}}>From</div>
              <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} />
              <div className="label">To</div>
              <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} />
              <button className="btn primary" disabled={!studentId || loading} onClick={fetchByStudent}>
                {loading ? 'Loading…' : 'Run'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{marginTop:10}}>
        <div className="section-title">{tab==='daily' ? 'Daily Report' : 'By Student'}</div>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : displayRows.length === 0 ? (
          <div className="muted">No rows.</div>
        ) : (
          <div className="list">
            <div className="row" style={{fontWeight:700}}>
              {tab==='daily' ? (
                <>
                  <div className="grow">Student</div>
                  <div className="grow">School</div>
                  <div className="grow">School Pickup Time</div>
                  <div className="grow">Sunny Days Arrival Time</div>
                  <div className="grow">Checkout Time</div>
                  <div className="grow">Picked Up By</div>
                  <div className="grow">Current Status</div>
                </>
              ) : (
                <>
                  <div className="grow">Date</div>
                  <div className="grow">School Pickup Time</div>
                  <div className="grow">Sunny Days Arrival Time</div>
                  <div className="grow">Checkout Time</div>
                  <div className="grow">Picked Up By</div>
                  <div className="grow">Status</div>
                </>
              )}
            </div>
            {displayRows.map((r,i)=> {
              if (tab==='daily') {
                return (
                  <div key={i} className="card-row row wrap">
                    <div className="grow">{r.last_name}, {r.first_name}</div>
                    <div className="grow">{r.school}</div>
                    <div className="grow">{fmt12(r.picked_time)}</div>
                    <div className="grow">{fmt12(r.arrived_time)}</div>
                    <div className="grow">{fmt12(r.checked_time)}</div>
                    <div className="grow">{r.pickup_person ?? ''}</div>
                    <div className="grow">{r.current_status === 'checked' ? 'checked-out' : r.current_status}</div>
                  </div>
                )
              } else {
                return (
                  <div key={i} className="card-row row wrap">
                    <div className="grow">{r.last_name}</div>
                    <div className="grow">{fmt12(r.picked_time)}</div>
                    <div className="grow">{fmt12(r.arrived_time)}</div>
                    <div className="grow">{fmt12(r.checked_time)}</div>
                    <div className="grow">{r.pickup_person ?? ''}</div>
                    <div className="grow">{r.current_status === 'checked' ? 'checked-out' : r.current_status}</div>
                  </div>
                )
              }
            })}
          </div>
        )}
      </div>
    </div>
  )
}
