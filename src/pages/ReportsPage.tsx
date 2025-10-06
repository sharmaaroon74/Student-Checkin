// src/pages/ReportsPage.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Row = {
  student_id: string
  student_name: string
  school: string
  picked_time?: string | null
  arrived_time?: string | null
  checked_time?: string | null
  pickup_person?: string | null
  final_status?: string | null
  approved_pickups?: string[] | null
  __apRawType?: 'string' | 'json'
}

const SCHOOL_FILTERS: Array<'All' | 'Bain' | 'QG' | 'MHE' | 'MC'> = ['All','Bain','QG','MHE','MC']

function estDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d)
}

// Convert 'YYYY-MM-DDTHH:mm' (America/New_York wall time) → UTC ISO (DST-safe)
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
  for (let i=0;i<3;i++){
    const parts = dtf.formatToParts(new Date(utcMs))
    const y2 = Number(parts.find(p=>p.type==='year')?.value)
    const m2 = Number(parts.find(p=>p.type==='month')?.value)
    const d2 = Number(parts.find(p=>p.type==='day')?.value)
    const h2 = Number(parts.find(p=>p.type==='hour')?.value)
    const n2 = Number(parts.find(p=>p.type==='minute')?.value)
    const rendered = Date.UTC(y2, m2-1, d2, h2, n2, 0, 0)
    const diff = desiredLocalMs - rendered
    if (diff === 0) break
    utcMs += diff
  }
  return new Date(utcMs).toISOString()
}

export default function ReportsPage() {
  // tabs
  const [view, setView] = useState<'daily'|'approved'|'history'>('daily')

  // DAILY tab state
  const [dateStr, setDateStr] = useState(estDateString(new Date()))
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  const [school, setSchool] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [hideNoActivity, setHideNoActivity] = useState(true)
  const [hideSkipped, setHideSkipped] = useState(true)
  const [onlyLongStays, setOnlyLongStays] = useState(false)

  // shared
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  // Ensure rows exist for Approved tab too (so you don't have to open Daily first)
  useEffect(() => {
    if (view !== 'approved') return
    let alive = true
    ;(async () => {
      setBusy(true)
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, first_name, last_name, school, approved_pickups')
          .eq('active', true)
        if (error) throw error
        const list: Row[] = (data||[]).map((st:any)=> {
          const apRaw = st.approved_pickups
          const isString = typeof apRaw === 'string'
          let apList: string[] | null = null
          if (Array.isArray(apRaw)) apList = apRaw as string[]
          else if (isString) { try { apList = JSON.parse(apRaw) } catch { apList = null } }
          return {
            student_id: st.id,
            student_name: `${st.first_name} ${st.last_name}`,
            school: st.school ?? '',
            approved_pickups: apList,
            __apRawType: isString ? 'string' : 'json',
          }
        })
        if (!alive) return
        setRows(list)
      } catch (e) {
        if (!alive) return
        console.error('[approved] fetch failed', e)
        setRows([])
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => { alive = false }
  }, [view])

  // DAILY fetch (original behavior)
  useEffect(() => {
    if (view !== 'daily') return
    let alive = true
    ;(async () => {
      setBusy(true)
      try {
        const { data: students, error: sErr } = await supabase
          .from('students')
          .select('id, first_name, last_name, school, approved_pickups')
          .eq('active', true)
        if (sErr) throw sErr

        const { data: roster, error: rErr } = await supabase
          .from('roster_status')
          .select('student_id, current_status, last_update')
          .eq('roster_date', dateStr)
        if (rErr) throw rErr

        const { data: logs, error: lErr } = await supabase
          .from('logs')
          .select('student_id, action, at, meta')
          .eq('roster_date', dateStr)
        if (lErr) throw lErr

        const pickedEarliest = new Map<string,string>()
        const arrivedEarliest = new Map<string,string>()
        const checkedEarliest = new Map<string,string>()
        const pickupBy = new Map<string,string>()

        for (const lg of logs ?? []) {
          const sid = lg.student_id as string
          const act = lg.action as string
          const at  = lg.at as string
          const meta = (lg as any).meta || {}
          if (meta && meta.pickupPerson && !pickupBy.has(sid)) {
            pickupBy.set(sid, String(meta.pickupPerson))
          }
          const effectiveAt =
            (act === 'checked' && meta && meta.pickupTime)
              ? (estLocalToUtcIso(String(meta.pickupTime)) ?? String(meta.pickupTime))
              : at
          const upd = (map: Map<string,string>, when: string) => {
            const prev = map.get(sid)
            if (!prev || new Date(when) < new Date(prev)) map.set(sid, when)
          }
          if (act === 'picked')  upd(pickedEarliest, at)
          if (act === 'arrived') upd(arrivedEarliest, at)
          if (act === 'checked') upd(checkedEarliest, effectiveAt)
        }

        const finalStatus = new Map<string,string>()
        const lastUpdate  = new Map<string,string>()
        for (const r of roster ?? []) {
          finalStatus.set(r.student_id as string, r.current_status as string)
          if (r.last_update) lastUpdate.set(r.student_id as string, r.last_update as string)
        }

        const toDisplay: Row[] = (students ?? []).map(st => {
          const sid = st.id as string
          const apRaw = (st as any).approved_pickups
          const isString = typeof apRaw === 'string'
          let apList: string[] | null = null
          if (Array.isArray(apRaw)) apList = apRaw as string[]
          else if (isString) { try { apList = JSON.parse(apRaw) } catch { apList = null } }

          const checked =
            checkedEarliest.get(sid) ||
            (String(finalStatus.get(sid) || '').toLowerCase()==='checked'
              ? (lastUpdate.get(sid) || null)
              : null)

          return {
            student_id: sid,
            student_name: `${st.first_name} ${st.last_name}`,
            school: (st.school as string) ?? '',
            picked_time: pickedEarliest.get(sid) || null,
            arrived_time: arrivedEarliest.get(sid) || null,
            checked_time: checked,
            pickup_person: pickupBy.get(sid) || null,
            final_status: finalStatus.get(sid) || null,
            approved_pickups: apList,
            __apRawType: isString ? 'string' : 'json',
          }
        })

        if (!alive) return
        setRows(toDisplay)
      } catch (e) {
        if (!alive) return
        console.error('[reports] fetch failed', e)
        setRows([])
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => { alive = false }
  }, [dateStr, view])

  // DAILY derived
  const filteredSorted = useMemo(() => {
    if (view !== 'daily') return []
    let data = [...rows]
    if (school !== 'All') data = data.filter(r => r.school === school)
    if (hideNoActivity) data = data.filter(r => (r.picked_time || r.arrived_time || r.checked_time))
    if (hideSkipped) data = data.filter(r => (r.final_status ?? '').toLowerCase() !== 'skipped')

    const fourHoursMs = 4 * 60 * 60 * 1000
    data = data.map(r => {
      let refStart: string | null = r.picked_time || r.arrived_time || null
      const end = r.checked_time || null
      let totalMs: number | null = null
      if (refStart && end) {
        const t0 = new Date(refStart).getTime()
        const t1 = new Date(end).getTime()
        if (!Number.isNaN(t0) && !Number.isNaN(t1) && t1 > t0) totalMs = t1 - t0
      }
      const totalStr = (() => {
        if (totalMs === null || totalMs < fourHoursMs) return ''
        const mins = Math.round(totalMs / 60000)
        const h = Math.floor(mins / 60)
        const m = mins % 60
        return `${h}h ${m}m`
      })()
      ;(r as any).__total_ms = totalMs
      ;(r as any).__total_str = totalStr
      return r
    })
    if (onlyLongStays) data = data.filter(r => ((r as any).__total_ms ?? 0) >= fourHoursMs)

    const norm = (s: string) => s.toLowerCase().trim()
    const last = (full: string) => {
      const noParen = full.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
      const parts = noParen.split(' ')
      return parts.length ? parts[parts.length - 1] : ''
    }
    return data
      .map((r, i) => ({ r, i }))
      .sort((A, B) => {
        const a = A.r, b = B.r
        if (sortBy === 'first') {
          const cmp = norm(a.student_name).localeCompare(norm(b.student_name), undefined, { sensitivity: 'base' })
          return cmp !== 0 ? cmp : A.i - B.i
        } else {
          const cmp = last(a.student_name).localeCompare(last(b.student_name), undefined, { sensitivity: 'base' })
          return cmp !== 0 ? cmp : A.i - B.i
        }
      })
      .map(x => x.r)
  }, [rows, sortBy, hideNoActivity, hideSkipped, school, onlyLongStays, view])

  // CSV (Daily only)
  function exportCSV() {
    if (view !== 'daily') return
    const header = [
      'Student Name','School','School Pickup Time','Sunny Days Arrival Time',
      'Checkout Time','Picked Up By','Time @ Sunny Days','Current Status',
    ]
    const fmt = (iso?: string | null) =>
      iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : ''
    const lines = [header.join(',')]
    for (const r of filteredSorted) {
      lines.push([
        `"${r.student_name.replace(/"/g,'""')}"`,
        `"${(r.school ?? '').replace(/"/g,'""')}"`,
        `"${fmt(r.picked_time)}"`,
        `"${fmt(r.arrived_time)}"`,
        `"${fmt(r.checked_time)}"`,
        `"${(r.pickup_person ?? '').replace(/"/g,'""')}"`,
        `"${(((r as any).__total_str ?? '') as string).replace(/"/g,'""')}"`,
        `"${(((r.final_status ?? '') as string).toLowerCase()==='checked' ? 'checked-out' : (r.final_status ?? '')).replace(/"/g,'""')}"`,
      ].join(','))
    }
    const blob = new Blob(["\uFEFF" + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report_${dateStr}.csv`
    document.body.appendChild(a); a.click()
    a.remove(); URL.revokeObjectURL(url)
  }

  const fmtCell = (iso?: string|null) =>
    iso ? new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour:'numeric', minute:'2-digit' }).format(new Date(iso)) : ''

  return (
    <div className="container report-wrap">
      {/* toolbar */}
      <div className="card report-toolbar">
        {/* Row 1: Tabs only */}
        <div className="row wrap gap" style={{alignItems:'center'}}>
          <div className="seg">
            <button className={`seg-btn ${view==='daily'?'on':''}`} onClick={()=>setView('daily')}>Daily</button>
            <button className={`seg-btn ${view==='approved'?'on':''}`} onClick={()=>setView('approved')}>Approved Pickups</button>
            <button className={`seg-btn ${view==='history'?'on':''}`} onClick={()=>setView('history')}>Student History</button>
          </div>
        </div>

        {/* Row 2: Daily-only controls (all on one line with school filters, plus Download) */}
        {view==='daily' && (
          <div className="row wrap gap" style={{alignItems:'center', marginTop:8}}>
            <label className="label">Date</label>
            <input type="date" value={dateStr} onChange={e=>setDateStr(e.target.value)} />
            <label className="label">Sort</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}>
              <option value="first">First Name</option>
              <option value="last">Last Name</option>
            </select>
            <label className="label">School</label>
            <div className="seg seg-scroll">
              {SCHOOL_FILTERS.map(opt => (
                <button
                  key={opt}
                  className={`seg-btn ${school===opt?'on':''}`}
                  onClick={()=>setSchool(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* moved right next to school filters */}
            <label className="row" style={{gap:6}}>
              <input type="checkbox" checked={hideNoActivity} onChange={e=>setHideNoActivity(e.target.checked)} />
              <span className="label">Hide no activity</span>
            </label>
            <label className="row" style={{gap:6}}>
              <input type="checkbox" checked={hideSkipped} onChange={e=>setHideSkipped(e.target.checked)} />
              <span className="label">Hide skipped</span>
            </label>
            <label className="row" style={{gap:6}}>
              <input type="checkbox" checked={onlyLongStays} onChange={e=>setOnlyLongStays(e.target.checked)} />
              <span className="label">Only show ≥ 4 hours</span>
            </label>
            <button
              className="btn"
              style={{padding:'6px 10px'}}
              title="Download CSV"
              aria-label="Download CSV"
              onClick={exportCSV}
            >
              ⬇️ CSV
            </button>          </div>
        )}
      </div>{/* /toolbar */}

      {/* DAILY VIEW */}
      {view === 'daily' && (
        <div className="card report-table-card">
          {busy ? (
            <div className="muted">Loading…</div>
          ) : filteredSorted.length === 0 ? (
            <div className="muted" style={{padding:'8px 2px'}}>No rows for this date.</div>
          ) : (
            <div className="report-table-scroll">
              <table className="report-table">
                <thead className="report-thead">
                  <tr>
                    <th className="col-name">Student Name</th>
                    <th className="col-school">School</th>
                    <th className="col-time">School Pickup Time</th>
                    <th className="col-time">Sunny Days Arrival Time</th>
                    <th className="col-time">Checkout Time</th>
                    <th className="col-person">Picked Up By</th>
                    <th className="col-time">Time @ Sunny Days</th>
                    <th className="col-status">Current Status</th>
                  </tr>
                </thead>
                <tbody className="report-tbody">
                  {filteredSorted.map((r) => (
                    <tr key={r.student_id}>
                      <td className="cell-name">{r.student_name}</td>
                      <td className="cell-school">{r.school}</td>
                      <td className="cell-time">{fmtCell(r.picked_time)}</td>
                      <td className="cell-time">{fmtCell(r.arrived_time)}</td>
                      <td className="cell-time">{fmtCell(r.checked_time)}</td>
                      <td className="cell-person">{r.pickup_person || ''}</td>
                      <td className="cell-time">{(r as any).__total_str || ''}</td>
                      <td className="cell-status">
                        <span className={`pill ${String(r.final_status||'').toLowerCase()}`}>
                          {String(r.final_status||'').toLowerCase()==='checked' ? 'checked-out' : (r.final_status || '')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* APPROVED PICKUPS */}
      {view === 'approved' && (
        <div className="card report-table-card">
          {busy ? (
            <div className="muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="muted" style={{padding:'8px 2px'}}>No students.</div>
          ) : (
            <div className="report-table-scroll">
              <table className="report-table">
                <thead className="report-thead">
                  <tr>
                    <th className="col-name">Student Name</th>
                    <th className="col-school">School</th>
                    <th className="col-person">Approved Pickups</th>
                    <th className="col-person">Actions</th>
                  </tr>
                </thead>
                <tbody className="report-tbody">
                  {rows
                    .slice()
                    .sort((a,b)=>a.student_name.localeCompare(b.student_name))
                    .map((r)=>(
                    <ApprovedRow key={r.student_id} row={r} onSaved={async ()=>{
                      const { data: fresh, error } = await supabase
                        .from('students')
                        .select('id, approved_pickups')
                        .eq('id', r.student_id)
                        .maybeSingle()
                      if (!error && fresh) {
                        const apRaw = (fresh as any).approved_pickups
                        const isString = typeof apRaw === 'string'
                        let apList: string[] | null = null
                        if (Array.isArray(apRaw)) apList = apRaw as string[]
                        else if (isString) { try { apList = JSON.parse(apRaw) } catch { apList = null } }
                        setRows(prev => prev.map(p => p.student_id===r.student_id
                          ? {...p, approved_pickups: apList, __apRawType: isString ? 'string' : 'json'}
                          : p))
                      }
                    }} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* STUDENT HISTORY */}
      {view === 'history' && (
        <StudentHistoryBlock />
      )}
    </div>
  )
}

function ApprovedRow({ row, onSaved }:{ row: Row, onSaved: ()=>Promise<void> }) {
  const [editing, setEditing] = React.useState(false)
  const [items, setItems] = React.useState<string[]>(
    Array.isArray(row.approved_pickups) ? [...row.approved_pickups] : []
  )
  const [draft, setDraft] = React.useState('')

  async function save() {
    const clean = items.map(s => String(s).trim()).filter(s => s.length > 0)
    const payload =
      row.__apRawType === 'string'
        ? { approved_pickups: JSON.stringify(clean) }
        : { approved_pickups: clean }

    // Persist via RPC (SECURITY DEFINER) when present.
    // Falls back to a direct UPDATE if RPC is missing (older DB) or blocked.
    const { data, error } = await supabase.rpc(
      'rpc_update_student_approved_pickups',
      { p_student_id: row.student_id, p_pickups: clean }
    )
    if (error || !data) {
      console.warn('[approved_pickups save] RPC failed, falling back to direct update', error)
      // Use the already-normalized payload (stringified if legacy string-column, array otherwise)
      const { data: upd, error: uerr } = await supabase
        .from('students')
        .update(payload)
        .eq('id', row.student_id)
        .select('id')
        .maybeSingle()
      if (uerr || !upd) {
        console.error('[approved_pickups save] fallback update failed', uerr)
        alert('Save failed (no row updated). Database may be missing RPCs or blocked by RLS.')
        return
      }
    }
    setEditing(false)
    await onSaved()
  }

  return (
    <tr>
      <td className="cell-name">{row.student_name}</td>
      <td className="cell-school">{row.school}</td>
      <td className="cell-person">
        {items.length===0 ? <span className="muted">None</span> :
          items.map((p,i)=>(
            <span key={i} className="chip" style={{marginRight:6}}>
              {p}
            </span>
          ))
        }
      </td>
      <td className="cell-person">
        {!editing ? (
          <button className="btn" onClick={()=>setEditing(true)}>Edit</button>
        ) : (
          <div className="col" style={{gap:8}}>
            <div className="row" style={{gap:6, flexWrap:'wrap'}}>
              <input
                placeholder="Add name"
                value={draft}
                onChange={e=>setDraft(e.target.value)}
                onKeyDown={e=>{
                  if (e.key==='Enter') {
                    const v = draft.trim()
                    if (v) setItems(prev => [...prev, v])
                    setDraft('')
                  }
                }}
              />
              <button className="btn" onClick={()=>{
                const v = draft.trim()
                if (v) setItems(prev => [...prev, v])
                setDraft('')
              }}>Add</button>
            </div>
            <div className="row" style={{gap:6, flexWrap:'wrap'}}>
              {items.map((p,i)=>(
                <span key={i} className="chip">
                  {p}
                  <button className="btn" style={{marginLeft:6}} onClick={()=>{
                    setItems(prev => prev.filter((_,idx)=>idx!==i))
                  }}>×</button>
                </span>
              ))}
            </div>
            <div className="row" style={{gap:6}}>
              <button className="btn primary" onClick={save}>Save</button>
              <button className="btn" onClick={()=>{
                setEditing(false)
                setItems(Array.isArray(row.approved_pickups)?[...row.approved_pickups]:[])
                setDraft('')
              }}>Cancel</button>
            </div>
          </div>
        )}
      </td>
    </tr>
  )
}

function StudentHistoryBlock() {
  const [studentId, setStudentId] = React.useState<string>('')
  const [start, setStart] = React.useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate()-7)
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)
  })
  const [end, setEnd] = React.useState<string>(() => {
    const d = new Date()
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)
  })
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<Array<{id:number, roster_date:string, action:string, at:string, meta:any, student_name:string}>>([])
  const [students, setStudents] = React.useState<Array<{id:string, name:string}>>([])

  React.useEffect(()=>{(async()=>{
    const { data, error } = await supabase.from('students').select('id, first_name, last_name, active').eq('active', true)
    if (!error && data) {
      setStudents(data.map(s=>({id:s.id as string, name:`${s.first_name} ${s.last_name}`})).sort((a,b)=>a.name.localeCompare(b.name)))
    }
  })()},[])

  async function run() {
    if (!studentId) { setRows([]); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('logs')
        .select('id, roster_date, action, at, meta, student_name')
        .eq('student_id', studentId)
        .gte('roster_date', start)
        .lte('roster_date', end)
        .order('roster_date', { ascending: true })
        .order('at', { ascending: true })
      if (error) throw error
      setRows((data||[]) as any)
    } catch(e) {
      console.error('[history] fetch', e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function saveTime(logId: number, action: string, local: string, currentMeta: any) {
    try {
      if (action === 'checked') {
        // Merge pickupTime into meta via RPC (server-side), else fallback to direct UPDATE
        const { data, error } = await supabase.rpc('rpc_set_log_pickup_time', {
          p_log_id: logId,
          p_pickup_time: local, // 'YYYY-MM-DDTHH:mm' (EST wall clock string)
        })
        if (error || !data) {
          console.warn('[history] rpc_set_log_pickup_time failed, falling back to direct update', error)
          const merged = { ...(currentMeta || {}), pickupTime: local }
          const { data: upd, error: uerr } = await supabase
            .from('logs')
            .update({ meta: merged })
            .eq('id', logId)
            .select('id')
            .maybeSingle()
          if (uerr || !upd) throw new Error('No row updated (RPC missing/RLS?)')
        }
      } else {
        // picked/arrived: set the at timestamp via RPC, else fallback to direct UPDATE
        const iso = estLocalToUtcIso(local) ?? new Date().toISOString()
        const { data, error } = await supabase.rpc('rpc_set_log_at', {
          p_log_id: logId,
          p_at_iso: iso,
        })
        if (error || !data) {
          console.warn('[history] rpc_set_log_at failed, falling back to direct update', error)
          const { data: upd, error: uerr } = await supabase
            .from('logs')
            .update({ at: iso })
            .eq('id', logId)
            .select('id')
            .maybeSingle()
          if (uerr || !upd) throw new Error('No row updated (RPC missing/RLS?)')
        }
      }
      await run()
    } catch (e: any) {
      console.error('[history] saveTime', e)
      alert(`Save failed: ${String(e?.message || e)}`)
    }
  }

  const fmtLocal = (iso: string) =>
    new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(iso))

  return (
    <div className="card report-table-card">
      <div className="row wrap" style={{gap:8, alignItems:'center', marginBottom:8}}>
        <label className="label">Student</label>
        <select value={studentId} onChange={e=>setStudentId(e.target.value)}>
          <option value="">— Select —</option>
          {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="label">From</label>
        <input type="date" value={start} onChange={e=>setStart(e.target.value)} />
        <label className="label">To</label>
        <input type="date" value={end} onChange={e=>setEnd(e.target.value)} />
        <button className="btn" onClick={run} disabled={!studentId || loading}>{loading?'Loading…':'Run'}</button>
      </div>
      {rows.length===0 ? <div className="muted">No logs.</div> : (
        <div className="report-table-scroll">
          <table className="report-table">
            <thead className="report-thead">
              <tr>
                <th className="col-school">Date</th>
                <th className="col-person">Action</th>
                <th className="col-time">Time</th>
                <th className="col-person">Edit</th>
              </tr>
            </thead>
            <tbody className="report-tbody">
              {rows.map(r=>{
                const base = r.action==='checked' && r.meta?.pickupTime ? r.meta.pickupTime : r.at
                const d = new Date(base)
                const nyDate = new Intl.DateTimeFormat('en-CA', {
                  timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
                }).format(d)
                const nyHM = new Intl.DateTimeFormat('en-GB', {
                  timeZone:'America/New_York', hour:'2-digit', minute:'2-digit', hour12:false
                }).format(d)
                const localInput = `${nyDate}T${nyHM}`

                return (
                  <tr key={r.id}>
                    <td className="cell-school">{r.roster_date}</td>
                    <td className="cell-person">{r.action}</td>
                    <td className="cell-time">{fmtLocal(base)}</td>
                    <td className="cell-person">
                      <div className="row" style={{gap:6}}>
                        <input
                          type="datetime-local"
                          defaultValue={localInput}
                          onChange={e=>(r as any).__new = e.target.value}
                        />
                        <button
                          className="btn"
                          onClick={()=>saveTime(r.id, r.action, (r as any).__new || localInput, r.meta)}
                        >
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
