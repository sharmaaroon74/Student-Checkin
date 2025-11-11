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

// Printer-friendly Daily HTML (updated headers per requirements)
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
    // removed School Pickup Time
    '<th>Check-in Time</th>' + // was "Sunny Days Arrival Time"
    '<th>Checkout Time</th>' +
    '<th>Picked Up By</th>' +
    '<th>Time @ Sunny Days</th>' +
    '<th>Current Status</th>' +
    '</tr>';

  const body =
    rowsForPrint.length === 0
      ? '<tr><td colspan="7" style="text-align:center;padding:8px;">No rows for this date.</td></tr>'
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
              // removed picked_time column
              `<td>${fmt(r.arrived_time)}</td>` + // Check-in Time
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
      :root { color-scheme: light; }
      body { margin: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .hdr { text-align: center; font-weight: 700; font-size: 18px; margin-bottom: 4px; }
      .meta { text-align: center; font-size: 12px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
      th { text-align: left; }
      @page { margin: 10mm; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <div class="hdr">Sunny Days – Daily Report</div>
    <div class="meta">Date: ${dateStrForHeader}</div>
    <table>
      <thead>${header}</thead>
      <tbody>${body}</tbody>
    </table>
    <script>
      window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 0); });
    </script>
  </body>
</html>`;
}

export default function ReportsPage() {
  // tabs
  const [view, setView] = useState<'daily'|'hours'|'approved'|'history'>('daily')

  // DAILY tab state
  const [dateStr, setDateStr] = useState(estDateString(new Date()))
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')

  // 4+ HOURS (range) tab state — defaults to today
  const [rangeStart, setRangeStart] = useState<string>(estDateString(new Date()))
  const [rangeEnd, setRangeEnd] = useState<string>(estDateString(new Date()))
  const [hoursCols, setHoursCols] = useState<string[]>([])
  const [hoursRows, setHoursRows] = useState<Array<{
    student_id: string
    student_name: string
    school: string
    totals: Record<string, string>
  }>>([])
  const [hoursLoading, setHoursLoading] = useState(false)

  // Display name in table according to current sort toggle
  function fmtStudentName(full: string): string {
    if (sortBy === 'first') return full
    const noParen = full.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
    const parts = noParen.split(' ')
    if (parts.length < 2) return full
    const last = parts[parts.length - 1]
    const first = parts.slice(0, -1).join(' ')
    return `${last}, ${first}`
  }

  const [school, setSchool] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [hideNoActivity, setHideNoActivity] = useState(true)
  const [hideSkipped, setHideSkipped] = useState(true)
  const [onlyLongStays, setOnlyLongStays] = useState(false)

  // shared
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  // ===== Approved tab fetch (unchanged) =====
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

  // ===== Daily fetch (unchanged) =====
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

  // ===== Daily derived (unchanged logic, updated column names later in render/CSV/print) =====
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

  // ===== CSV (Daily) – updated headers/columns =====
  function exportCSV() {
    if (view !== 'daily') return
    const header = [
      'Student Name','School','Check-in Time', // renamed; removed school pickup time
      'Checkout Time','Picked Up By','Time @ Sunny Days','Current Status',
    ]
    const fmt = (iso?: string | null) =>
      iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : ''
    const lines = [header.join(',')]
    for (const r of filteredSorted) {
      lines.push([
        `"${r.student_name.replace(/"/g,'""')}"`,
        `"${(r.school ?? '').replace(/"/g,'""')}"`,
        `"${fmt(r.arrived_time)}"`, // Check-in Time
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

  // Open a minimal printer-friendly page for Daily (uses updated headers)
  function printDaily() {
    if (view !== 'daily') return
    const html = buildDailyPrintHtml(dateStr, filteredSorted as Row[], fmtStudentName)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = url
    document.body.appendChild(iframe)
    iframe.onload = function () {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => { URL.revokeObjectURL(url); iframe.remove() }, 1000)
    }
  }

  // === Helpers for the Hours report ===

  // Build inclusive list of YYYY-MM-DD using UTC-noon ticks (DST-safe)
  function buildDateList(start: string, end: string): string[] {
    if (!start || !end) return []
    const [sy, sm, sd] = start.split('-').map(Number)
    const [ey, em, ed] = end.split('-').map(Number)
    let cur = Date.UTC(sy, (sm ?? 1) - 1, sd ?? 1, 12, 0, 0)
    const endUtc = Date.UTC(ey, (em ?? 1) - 1, ed ?? 1, 12, 0, 0)
    const out: string[] = []
    if (cur > endUtc) return out
    while (cur <= endUtc) {
      out.push(estDateString(new Date(cur)))
      cur += 24 * 60 * 60 * 1000
    }
    return out
  }

  // mm/dd view label (rendered in EST)
  function mmdd(yyyy_mm_dd: string): string {
    const [y, m, d] = yyyy_mm_dd.split('-').map(Number)
    const utcNoon = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0)
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(utcNoon))
  }

  // Run the 4+ Hours report over a date range → pivoted table
  async function runHours() {
    setHoursLoading(true)
    try {
      const cols = buildDateList(rangeStart, rangeEnd)
      setHoursCols(cols)

      if (cols.length === 0) {
        setHoursRows([])
        return
      }

      // Fetch active students for name/school lookup
      const { data: students, error: sErr } = await supabase
        .from('students')
        .select('id, first_name, last_name, school, active')
        .eq('active', true)
      if (sErr) throw sErr
      const nameById = new Map<string,string>()
      const schoolById = new Map<string,string>()
      for (const st of students || []) {
        nameById.set(st.id as string, `${st.first_name} ${st.last_name}`)
        schoolById.set(st.id as string, (st.school as string) ?? '')
      }

      // Pull logs in range
      const { data: logs, error: lErr } = await supabase
        .from('logs')
        .select('student_id, roster_date, action, at, meta')
        .gte('roster_date', rangeStart)
        .lte('roster_date', rangeEnd)
        .in('action', ['picked','arrived','checked'])
      if (lErr) throw lErr

      // For each (student, date): earliest start (picked/arrived) and earliest checkout (checked/pickupTime)
      const startMap = new Map<string,string>()
      const endMap = new Map<string,string>()
      const keyOf = (sid:string, d:string)=>`${d}|${sid}`
      for (const lg of logs || []) {
        const sid = lg.student_id as string
        const d = lg.roster_date as string
        const act = lg.action as string
        const at = lg.at as string
        const meta = (lg as any).meta || {}
        const effectiveAt = (act==='checked' && meta && meta.pickupTime)
          ? (estLocalToUtcIso(String(meta.pickupTime)) ?? String(meta.pickupTime))
          : at
        const k = keyOf(sid, d)
        if (act==='picked' || act==='arrived') {
          const prev = startMap.get(k)
          if (!prev || new Date(at) < new Date(prev)) startMap.set(k, at)
        }
        if (act==='checked') {
          const prev = endMap.get(k)
          if (!prev || new Date(effectiveAt) < new Date(prev)) endMap.set(k, effectiveAt)
        }
      }

      // Build pivot rows per student with only ≥4h totals populated
      const rowMap = new Map<string, { student_id:string, student_name:string, school:string, totals: Record<string,string> }>()
      const fourHoursMs = 4 * 60 * 60 * 1000

      for (const colDate of cols) {
        for (const [k, startIso] of startMap.entries()) {
          const [d, sid] = k.split('|')
          if (d !== colDate) continue
          const endIso = endMap.get(k)
          if (!endIso) continue
          const t0 = new Date(startIso).getTime()
          const t1 = new Date(endIso).getTime()
          if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) continue
          const total = t1 - t0
          if (total < fourHoursMs) continue

          const mins = Math.round(total / 60000)
          const h = Math.floor(mins / 60)
          const m = mins % 60
          const pretty = `${h}h ${m}m`

          if (!rowMap.has(sid)) {
            rowMap.set(sid, {
              student_id: sid,
              student_name: nameById.get(sid) || sid,
              school: schoolById.get(sid) || '',
              totals: {}
            })
          }
          rowMap.get(sid)!.totals[colDate] = pretty
        }
      }

      const out = Array.from(rowMap.values())
        // leave base order by first name; sorting for display handled by memo below
        .sort((a,b)=> a.student_name.localeCompare(b.student_name))

      setHoursRows(out)
    } catch (e) {
      console.error('[hours] fetch failed', e)
      setHoursRows([])
      setHoursCols([])
    } finally {
      setHoursLoading(false)
    }
  }

  // Printer-friendly HTML for the Hours report
  function buildHoursPrintHtml(
    startStr: string,
    endStr: string,
    cols: string[],
    rows: Array<{student_id:string, student_name:string, school:string, totals:Record<string,string>}>
  ): string {
    const headerCells =
      '<tr><th>Student Name</th><th>School</th>' +
      cols.map(c => `<th>${mmdd(c)}</th>`).join('') +
      '</tr>'

    const bodyRows = rows.length === 0
      ? '<tr><td colspan="' + (2+cols.length) + '" style="text-align:center;padding:8px;">No rows.</td></tr>'
      : rows.map(r =>
          '<tr>' +
            `<td>${fmtStudentName(r.student_name)}</td>` + // apply same sort-format as UI
            `<td>${r.school}</td>` +
            cols.map(c => `<td>${r.totals[c] || ''}</td>`).join('') +
          '</tr>'
        ).join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>4+ Hours Report – ${startStr} to ${endStr}</title>
    <style>
      :root { color-scheme: light; }
      body { margin: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .hdr { text-align: center; font-weight: 700; font-size: 18px; margin-bottom: 4px; }
      .meta { text-align: center; font-size: 12px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
      th { text-align: left; }
      @page { margin: 10mm; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <div class="hdr">Sunny Days – 4+ Hours Report</div>
    <div class="meta">Range: ${startStr} → ${endStr}</div>
    <table>
      <thead>${headerCells}</thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <script>
      window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 0); });
    </script>
  </body>
</html>`
  }

  // sort-aware print for Hours (use the same sorting the UI shows)
  function printHours() {
    if (view !== 'hours') return
    const html = buildHoursPrintHtml(rangeStart, rangeEnd, hoursCols, hoursRowsSorted)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = url
    document.body.appendChild(iframe)
    iframe.onload = function () {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => { URL.revokeObjectURL(url); iframe.remove() }, 1000)
    }
  }

  // ===== hoursRows sorted for display by first/last (same toggle as Daily) =====
  const hoursRowsSorted = useMemo(() => {
    const arr = [...hoursRows]
    const norm = (s:string)=>s.toLowerCase().trim()
    const last = (full: string) => {
      const noParen = full.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
      const parts = noParen.split(' ')
      return parts.length ? parts[parts.length - 1] : ''
    }
    return arr.sort((a,b)=>{
      if (sortBy === 'first') {
        return norm(a.student_name).localeCompare(norm(b.student_name), undefined, { sensitivity:'base' })
      }
      const la = last(a.student_name), lb = last(b.student_name)
      return la.localeCompare(lb, undefined, { sensitivity:'base' })
    })
  }, [hoursRows, sortBy])

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
            <button className={`seg-btn ${view==='hours'?'on':''}`} onClick={()=>setView('hours')}>4+ Hours</button>
            <button className={`seg-btn ${view==='approved'?'on':''}`} onClick={()=>setView('approved')}>Approved Pickups</button>
            <button className={`seg-btn ${view==='history'?'on':''}`} onClick={()=>setView('history')}>Student History</button>
          </div>
        </div>

        {/* Row 2: Daily-only controls */}
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
            <button className="btn" style={{padding:'6px 10px'}} title="Download CSV" aria-label="Download CSV" onClick={exportCSV}>⬇️ CSV</button>
            <button className="btn" style={{padding:'6px 10px'}} title="Printer-friendly" aria-label="Printer-friendly Daily Report" data-testid="btn-print-daily" onClick={printDaily}>🖨️ Print</button>
          </div>
        )}

        {/* Row 2 (Hours): range controls + Sort + Print */}
        {view==='hours' && (
          <div className="row wrap gap" style={{alignItems:'center', marginTop:8}}>
            <label className="label">From</label>
            <input type="date" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} />
            <label className="label">To</label>
            <input type="date" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} />
            <label className="label">Sort</label>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)}>
              <option value="first">First Name</option>
              <option value="last">Last Name</option>
            </select>
            <button className="btn" onClick={runHours} disabled={hoursLoading}>{hoursLoading?'Loading…':'Run'}</button>
            <button className="btn" onClick={printHours} disabled={hoursCols.length===0 || hoursRows.length===0}>🖨️ Print</button>
          </div>
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
                    {/* removed School Pickup Time */}
                    <th className="col-time">Check-in Time</th>
                    <th className="col-time">Checkout Time</th>
                    <th className="col-person">Picked Up By</th>
                    <th className="col-time">Time @ Sunny Days</th>
                    <th className="col-status">Current Status</th>
                  </tr>
                </thead>
                <tbody className="report-tbody">
                  {filteredSorted.map((r) => (
                    <tr key={r.student_id}>
                      <td className="cell-name">{fmtStudentName(r.student_name)}</td>
                      <td className="cell-school">{r.school}</td>
                      {/* Check-in = arrived_time */}
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

      {/* 4+ HOURS RANGE VIEW (pivot) */}
      {view === 'hours' && (
        <div className="card report-table-card">
          {hoursLoading ? (
            <div className="muted">Loading…</div>
          ) : hoursRowsSorted.length === 0 ? (
            <div className="muted" style={{padding:'8px 2px'}}>No rows.</div>
          ) : (
            <div className="report-table-scroll" data-testid="hours-table-scroll">
              <table className="report-table">
                <thead className="report-thead">
                  <tr>
                    <th className="col-name">Student Name</th>
                    <th className="col-school">School</th>
                    {hoursCols.map(d => (
                      <th key={d} className="col-time">{mmdd(d)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="report-tbody">
                  {hoursRowsSorted.map((r) => (
                    <tr key={r.student_id}>
                      <td className="cell-name">{fmtStudentName(r.student_name)}</td>
                      <td className="cell-school">{r.school}</td>
                      {hoursCols.map(d => (
                        <td key={d} className="cell-time">{r.totals[d] || ''}</td>
                      ))}
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
        <ApprovedPickupsBlock rows={rows} busy={busy} setRows={setRows} />
      )}

      {/* STUDENT HISTORY */}
      {view === 'history' && (
        <StudentHistoryBlock />
      )}
    </div>
  )
}

/* ----- Approved Pickups row/block kept identical to your prior version ----- */
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
                .map((r)=>(<ApprovedRow key={r.student_id} row={r} onSaved={async ()=>{
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
                }} />))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

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
      // client-side guard to respect edited pickupTime dates
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
