import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Row = {
  student_id: string
  student_name: string
  school: string
  program?: string | null
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

// Printer-friendly Daily HTML (with Program)
export function buildDailyPrintHtml(
  dateStrForHeader: string,
  rowsForPrint: Row[],
  nameFormatter: (full: string) => string
): string {
  const fmt = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          minute: '2-digit'
        }).format(new Date(iso))
      : '';

  const header =
    '<tr>' +
    '<th>Student Name</th>' +
    '<th>School</th>' +
    '<th>Program</th>' +
    '<th>Check-in Time</th>' +
    '<th>Check-out Time</th>' +
    '<th>Picked Up By</th>' +
    '<th>Time @ Sunny Days</th>' +
    '<th>Current Status</th>' +
    '</tr>';

  const body =
    rowsForPrint.length === 0
      ? '<tr><td colspan="8" style="text-align:center;padding:8px;">No rows for this date.</td></tr>'
      : rowsForPrint
          .map((r: any) => {
            const total = r.__total_str ?? '';
            const status = String(r.final_status || '').toLowerCase() === 'checked'
              ? 'checked-out'
              : (r.final_status || '');
            return (
              '<tr>' +
              `<td>${nameFormatter(r.student_name)}</td>` +
              `<td>${r.school ?? ''}</td>` +
              `<td>${r.program ?? ''}</td>` +
              `<td>${fmt(r.arrived_time)}</td>` +
              `<td>${fmt(r.checked_time)}</td>` +
              `<td>${r.pickup_person ?? ''}</td>` +
              `<td>${total}</td>` +
              `<td>${status}</td>` +
             '</tr>'
            );
          })
          .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Daily Report – ${dateStrForHeader}</title>
    <style>
      body { margin: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
      th { text-align: left; }
    </style>
  </head>
  <body>
    <div class="hdr">Sunny Days – Daily Report</div>
    <div class="meta">Date: ${dateStrForHeader}</div>
    <table>
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`;
}

export default function ReportsPage() {
  // tabs
  const [view, setView] = useState<'daily'|'hours'|'approved'|'history'>('daily')

  // DAILY tab state
  const [dateStr, setDateStr] = useState(estDateString(new Date()))
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')

  // 4+ HOURS (range) tab state
  const [rangeStart, setRangeStart] = useState<string>(estDateString(new Date()))
  const [rangeEnd, setRangeEnd] = useState<string>(estDateString(new Date()))
  const [hoursCols, setHoursCols] = useState<string[]>([])
  const [hoursRows, setHoursRows] = useState<Array<{
    student_id: string
    student_name: string
    school: string
    program?: string | null
    totals: Record<string, string>
  }>>([])
  const [hoursLoading, setHoursLoading] = useState(false)

  const [school, setSchool] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [hideNoActivity, setHideNoActivity] = useState(true)
  const [hideSkipped, setHideSkipped] = useState(true)
  const [onlyLongStays, setOnlyLongStays] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  function fmtStudentName(full: string): string {
    if (sortBy === 'first') return full
    const noParen = full.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
    const parts = noParen.split(' ')
    if (parts.length < 2) return full
    const last = parts[parts.length - 1]
    const first = parts.slice(0, -1).join(' ')
    return `${last}, ${first}`
  }

  // ===== Daily Fetch =====
  useEffect(() => {
    if (view !== 'daily') return
    let alive = true
    ;(async () => {
      setBusy(true)
      try {
        const { data: students, error: sErr } = await supabase
          .from('students')
          .select('id, first_name, last_name, school, school_year, approved_pickups')
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
            school: st.school ?? '',
            program: st.school_year ?? null,
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
        console.error('[reports] fetch failed', e)
        setRows([])
      } finally {
        if (alive) setBusy(false)
      }
    })()
    return () => { alive = false }
  }, [dateStr, view])

  // ===== Daily derived & sorting =====
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
    const norm = (s: string) => s.toLowerCase().trim()
    const last = (full: string) => {
      const noParen = full.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
      const parts = noParen.split(' ')
      return parts.length ? parts[parts.length - 1] : ''
    }
    return data.sort((a,b)=>{
      if (sortBy==='first') return norm(a.student_name).localeCompare(norm(b.student_name))
      return last(a.student_name).localeCompare(last(b.student_name))
    })
  }, [rows, sortBy, hideNoActivity, hideSkipped, school, onlyLongStays, view])

  // ===== CSV Export =====
  function exportCSV() {
    if (view !== 'daily') return
    const header = ['Student Name','School','Program','Check-in Time','Check-out Time','Picked Up By','Time @ Sunny Days','Current Status']
    const fmt = (iso?: string | null) => iso ? new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(iso)) : ''
    const lines = [header.join(',')]
    for (const r of filteredSorted) {
      lines.push([
        `"${r.student_name.replace(/"/g,'""')}"`,
        `"${(r.school ?? '').replace(/"/g,'""')}"`,
        `"${(r.program ?? '').replace(/"/g,'""')}"`,
        `"${fmt(r.arrived_time)}"`,
        `"${fmt(r.checked_time)}"`,
        `"${(r.pickup_person ?? '').replace(/"/g,'""')}"`,
        `"${(((r as any).__total_str ?? '') as string).replace(/"/g,'""')}"`,
        `"${(((r.final_status ?? '') as string).toLowerCase()==='checked' ? 'checked-out' : (r.final_status ?? '')).replace(/"/g,'""')}"`,
      ].join(','))
    }
    const blob = new Blob(["\uFEFF" + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report_${dateStr}.csv`
    a.click()
  }

  // ===== 4+ Hours Run =====
  async function runHours() {
    setHoursLoading(true)
    try {
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, first_name, last_name, school, school_year, active')
        .eq('active', true)
      if (sErr) throw sErr
      const nameById = new Map<string,string>()
      const schoolById = new Map<string,string>()
      const programById = new Map<string,string|null>()
      for (const st of students || []) {
        nameById.set(st.id as string, `${st.first_name} ${st.last_name}`)
        schoolById.set(st.id as string, st.school ?? '')
        programById.set(st.id as string, st.school_year ?? null)
      }

      const { data: logs, error: lErr } = await supabase
        .from('logs')
        .select('student_id, roster_date, action, at, meta')
        .gte('roster_date', rangeStart).lte('roster_date', rangeEnd)
        .in('action', ['picked','arrived','checked'])
      if (lErr) throw lErr

      const startMap = new Map<string,string>()
      const endMap = new Map<string,string>()
      for (const lg of logs || []) {
        const sid = lg.student_id as string
        const d = lg.roster_date as string
        const act = lg.action as string
        const at = lg.at as string
        const meta = (lg as any).meta || {}
        const eff = (act==='checked' && meta && meta.pickupTime)
          ? (estLocalToUtcIso(String(meta.pickupTime)) ?? String(meta.pickupTime))
          : at
        const key = `${d}|${sid}`
        if (act==='picked'||act==='arrived'){if(!startMap.get(key)||new Date(at)<new Date(startMap.get(key)!))startMap.set(key,at)}
        if (act==='checked'){if(!endMap.get(key)||new Date(eff)<new Date(endMap.get(key)!))endMap.set(key,eff)}
      }

      const cols:string[]=[]
      {
        const s=new Date(rangeStart), e=new Date(rangeEnd)
        for(let d=new Date(s);d<=e;d.setDate(d.getDate()+1))cols.push(estDateString(d))
      }
      setHoursCols(cols)

      const rowMap=new Map<string,{student_id:string,student_name:string,school:string,program?:string|null,totals:Record<string,string>}>()
      const fourHours=4*3600000
      for(const [key,startIso] of startMap.entries()){
        const [d,sid]=key.split('|')
        const endIso=endMap.get(key)
        if(!endIso)continue
        const t1=new Date(startIso).getTime(),t2=new Date(endIso).getTime()
        if(isNaN(t1)||isNaN(t2)||t2<=t1)continue
        const diff=t2-t1;if(diff<fourHours)continue
        const pretty=`${Math.floor(diff/3600000)}h ${Math.round((diff%3600000)/60000)}m`
        if(!rowMap.has(sid))
          rowMap.set(sid,{student_id:sid,student_name:nameById.get(sid)||sid,school:schoolById.get(sid)||'',program:programById.get(sid),totals:{}})
        rowMap.get(sid)!.totals[d]=pretty
      }

      const out = Array.from(rowMap.values()).sort((a,b)=>{
        if(sortBy==='first')return a.student_name.localeCompare(b.student_name)
        const last=(s:string)=>s.split(' ').slice(-1)[0]
        return last(a.student_name).localeCompare(last(b.student_name))
      })
      setHoursRows(out)
    } catch(e){console.error('[hours] failed',e);setHoursRows([])}finally{setHoursLoading(false)}
  }

  const fmtCell = (iso?: string|null) =>
    iso ? new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour:'numeric', minute:'2-digit' }).format(new Date(iso)) : ''
  const mmdd = (ymd: string) => new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', month:'2-digit', day:'2-digit' }).format(new Date(ymd))

  const hoursRowsSorted = useMemo(()=>{
    return [...hoursRows].sort((a,b)=>{
      if(sortBy==='first')return a.student_name.localeCompare(b.student_name)
      const last=(s:string)=>s.split(' ').slice(-1)[0]
      return last(a.student_name).localeCompare(last(b.student_name))
    })
  },[hoursRows,sortBy])

  // ===== Render UI =====
  return (
    <div className="container report-wrap">
      <div className="card report-toolbar">
        <div className="row wrap gap" style={{alignItems:'center'}}>
          <div className="seg">
            <button className={`seg-btn ${view==='daily'?'on':''}`} onClick={()=>setView('daily')}>Daily</button>
            <button className={`seg-btn ${view==='hours'?'on':''}`} onClick={()=>setView('hours')}>4+ Hours</button>
            <button className={`seg-btn ${view==='approved'?'on':''}`} onClick={()=>setView('approved')}>Approved Pickups</button>
            <button className={`seg-btn ${view==='history'?'on':''}`} onClick={()=>setView('history')}>Student History</button>
          </div>
        </div>

        {view==='daily'&&(
          <div className="row wrap gap" style={{alignItems:'center',marginTop:8}}>
            <label className="label">Date</label>
            <input type="date" value={dateStr} onChange={e=>setDateStr(e.target.value)} />
            <label className="label">Sort</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}>
              <option value="first">First Name</option>
              <option value="last">Last Name</option>
            </select>
            <label className="label">School</label>
            <div className="seg seg-scroll">
              {SCHOOL_FILTERS.map(opt=>(
                <button key={opt} className={`seg-btn ${school===opt?'on':''}`} onClick={()=>setSchool(opt)}>{opt}</button>
              ))}
            </div>
            <label className="row" style={{gap:6}}><input type="checkbox" checked={hideNoActivity} onChange={e=>setHideNoActivity(e.target.checked)} /><span className="label">Hide no activity</span></label>
            <label className="row" style={{gap:6}}><input type="checkbox" checked={hideSkipped} onChange={e=>setHideSkipped(e.target.checked)} /><span className="label">Hide skipped</span></label>
            <button className="btn" onClick={exportCSV}>⬇️ CSV</button>
          </div>
        )}

        {view==='hours'&&(
          <div className="row wrap gap" style={{alignItems:'center',marginTop:8}}>
            <label className="label">From</label><input type="date" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} />
            <label className="label">To</label><input type="date" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} />
            <label className="label">Sort</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}>
              <option value="first">First Name</option>
              <option value="last">Last Name</option>
            </select>
            <button className="btn" onClick={runHours} disabled={hoursLoading}>{hoursLoading?'Loading…':'Run'}</button>
          </div>
        )}
      </div>

      {view==='daily'&&(
        <div className="card report-table-card">
          {busy?<div className="muted">Loading…</div>:
          filteredSorted.length===0?<div className="muted" style={{padding:'8px 2px'}}>No rows.</div>:
          <div className="report-table-scroll">
            <table className="report-table">
              <thead><tr>
                <th>Student Name</th><th>School</th><th>Program</th><th>Check-in Time</th><th>Check-out Time</th><th>Picked Up By</th><th>Time @ Sunny Days</th><th>Current Status</th>
              </tr></thead>
              <tbody>
                {filteredSorted.map(r=>(
                  <tr key={r.student_id}>
                    <td>{fmtStudentName(r.student_name)}</td>
                    <td>{r.school}</td>
                    <td>{r.program ?? ''}</td>
                    <td>{fmtCell(r.arrived_time)}</td>
                    <td>{fmtCell(r.checked_time)}</td>
                    <td>{r.pickup_person ?? ''}</td>
                    <td>{(r as any).__total_str ?? ''}</td>
                    <td>{r.final_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {view==='hours'&&(
        <div className="card report-table-card">
          {hoursLoading?<div className="muted">Loading…</div>:
          hoursRowsSorted.length===0?<div className="muted" style={{padding:'8px 2px'}}>No rows.</div>:
          <div className="report-table-scroll">
            <table className="report-table">
              <thead><tr><th>Student Name</th><th>School</th><th>Program</th>{hoursCols.map(d=><th key={d}>{mmdd(d)}</th>)}</tr></thead>
              <tbody>
                {hoursRowsSorted.map(r=>(
                  <tr key={r.student_id}>
                    <td>{fmtStudentName(r.student_name)}</td>
                    <td>{r.school}</td>
                    <td>{r.program ?? ''}</td>
                    {hoursCols.map(d=><td key={d}>{r.totals[d]||''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {view==='approved'&&(
        <ApprovedPickupsBlock rows={rows} busy={busy} setRows={setRows}/>
      )}

      {view==='history'&&(<StudentHistoryBlock/>)}
    </div>
  )
}
/* ----- Approved Pickups row/block (same behavior as v1.24) ----- */
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

    // Preferred RPC path (RLS-safe); fallback to direct update if missing
    const { error } = await supabase.rpc(
      'rpc_update_student_approved_pickups',
      { p_student_id: row.student_id, p_pickups: clean }
    )
    if (error) {
      console.warn('[approved_pickups save] RPC failed, falling back to direct update', error)
      const { error: uerr, data: upd } = await supabase
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

      {editing ? (
        <td className="cell-person" colSpan={2} data-testid="ap-editor-spanning-cell">
          <div className="row"
               style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:12, alignItems:'start'}}>
            {/* LEFT: current list with remove buttons */}
            <div className="col" style={{gap:8}}>
              <div className="row" style={{gap:6, flexWrap:'wrap'}}>
                {items.length===0 ? <span className="muted">None</span> :
                  items.map((p,i)=>(
                    <span key={i} className="chip">
                      {p}
                      <button className="btn" style={{marginLeft:6}} onClick={()=>{
                        setItems(prev => prev.filter((_,idx)=>idx!==i))
                      }}>×</button>
                    </span>
                  ))
                }
              </div>
            </div>
            {/* RIGHT: add box + actions */}
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
              <div className="row" style={{gap:6, marginTop:6}}>
                <button className="btn primary" onClick={save}>Save</button>
                <button className="btn" onClick={()=>{
                  setEditing(false)
                  setItems(Array.isArray(row.approved_pickups)?[...row.approved_pickups]:[])
                  setDraft('')
                }}>Cancel</button>
              </div>
            </div>
          </div>
        </td>
      ) : (
        <>
          <td className="cell-person">
            {items.length===0 ? (
              <span className="muted">None</span>
            ) : (
              items.map((p,i)=>(
                <span key={i} className="chip"
                  style={{marginRight:6, display:'inline-block', whiteSpace:'nowrap',
                          overflow:'hidden', textOverflow:'ellipsis', maxWidth:'240px', verticalAlign:'top'}}>{p}</span>
              ))
            )}
          </td>
          <td className="cell-person">
            <button className="btn" onClick={()=>setEditing(true)}>Edit</button>
          </td>
        </>
      )}
    </tr>
  )
}

function ApprovedPickupsBlock({rows, busy, setRows}:{rows:Row[], busy:boolean, setRows:React.Dispatch<React.SetStateAction<Row[]>>}) {
  return (
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
                  <ApprovedRow
                    key={r.student_id}
                    row={r}
                    onSaved={async ()=>{
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
                    }}
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ----- Student History (same behavior as v1.24) ----- */
function StudentHistoryBlock() {
  const [studentId, setStudentId] = React.useState<string>('')
  const [start, setStart] = React.useState<string>(() => estDateString(new Date()))
  const [end, setEnd] = React.useState<string>(() => estDateString(new Date()))
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<Array<{id:number, roster_date:string, action:string, at:string, meta:any, student_name:string}>>([])
  const [students, setStudents] = React.useState<Array<{id:string, name:string}>>([])

  React.useEffect(()=>{(async()=>{
    const { data, error } = await supabase.from('students').select('id, first_name, last_name, active').eq('active', true)
    if (!error && data) {
      setStudents(
        data
          .map(s=>({id:s.id as string, name:`${s.first_name} ${s.last_name}`}))
          .sort((a,b)=>a.name.localeCompare(b.name))
      )
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

      // client-side guard to respect edited pickupTime dates inside meta
      const filtered = (data || []).filter((r: any) => {
        const inRange = (ymd: string) => (ymd >= start && ymd <= end)
        if (r.action === 'checked' && r.meta?.pickupTime) {
          const ymd = String(r.meta.pickupTime).slice(0, 10)
          return inRange(ymd)
        }
        return inRange(String(r.roster_date))
      })
      setRows(filtered as any)
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
        // Preferred RPC for pickupTime
        const { error } = await supabase.rpc('rpc_set_log_pickup_time', {
          p_log_id: logId,
          p_pickup_time: local,
        })
        if (error) {
          console.warn('[history] rpc_set_log_pickup_time failed, falling back to direct update', error)
          const merged = { ...(currentMeta || {}), pickupTime: local }
          const { error: uerr, data: upd } = await supabase
            .from('logs')
            .update({ meta: merged })
            .eq('id', logId)
            .select('id')
            .maybeSingle()
          if (uerr || !upd) throw new Error('No row updated (RPC missing/RLS?)')
        }
      } else {
        // picked/arrived use 'at' column; convert local NY wall time → UTC ISO
        const iso = estLocalToUtcIso(local) ?? new Date().toISOString()
        const { error } = await supabase.rpc('rpc_set_log_at', {
          p_log_id: logId,
          p_at_iso: iso,
        })
        if (error) {
          console.warn('[history] rpc_set_log_at failed, falling back to direct update', error)
          const { error: uerr, data: upd } = await supabase
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
    <div className="card report-table-card history">
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
        <div className="report-table-scroll" style={{padding:'16px 16px 0', ['--report-sticky-top' as any]:'16px'}} data-testid="history-table-scroll">
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

