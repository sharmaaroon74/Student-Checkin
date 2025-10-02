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
}

const SCHOOL_FILTERS: Array<'All' | 'Bain' | 'QG' | 'MHE' | 'MC'> = ['All','Bain','QG','MHE','MC']

function estDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d)
}

// duration helpers kept local to ReportsPage to avoid touching shared utils
function toDate(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}
function diffMinutes(a?: string | null, b?: string | null): number | null {
  const d1 = toDate(a)
  const d2 = toDate(b)
  if (!d1 || !d2) return null
  const ms = d2.getTime() - d1.getTime()
  if (ms <= 0) return null
  return Math.floor(ms / 60000)
}
function fmtHMM(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}
const MIN_LONG_STAY = 4 * 60 // 4 hours in minutes

export default function ReportsPage() {
  const [dateStr, setDateStr] = useState(estDateString(new Date()))
  const [sortBy, setSortBy] = useState<'first'|'last'>('first')
  const [school, setSchool] = useState<'All'|'Bain'|'QG'|'MHE'|'MC'>('All')
  const [hideNoActivity, setHideNoActivity] = useState(true)
  const [hideSkipped, setHideSkipped] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)

  // new: only show >= 4h stays (unchecked by default)
  const [onlyLongStays, setOnlyLongStays] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setBusy(true)
      try {
        const { data: students, error: sErr } = await supabase
          .from('students')
          .select('id, first_name, last_name, school')
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
          const meta = (lg as any).meta || {}
          // Prefer override time from checkout modal when present (display-only)
          const rawAt = lg.at as string
          const at = (act === 'checked' && meta && meta.pickupTime) ? String(meta.pickupTime) : rawAt

          if (meta && meta.pickupPerson && !pickupBy.has(sid)) {
            pickupBy.set(sid, String(meta.pickupPerson))
          }
          const upd = (map: Map<string,string>) => {
            const prev = map.get(sid)
            if (!prev || new Date(at) < new Date(prev)) map.set(sid, at)
          }
          if (act === 'picked')  upd(pickedEarliest)
          if (act === 'arrived') upd(arrivedEarliest)
          if (act === 'checked') upd(checkedEarliest)
        }

        const finalStatus = new Map<string,string>()
        const lastUpdate  = new Map<string,string>()        
        for (const r of roster ?? []) {
          finalStatus.set(r.student_id as string, r.current_status as string)
          if (r.last_update) lastUpdate.set(r.student_id as string, r.last_update as string)
        }

        const toDisplay: Row[] = (students ?? []).map(st => {
          const sid = st.id as string
          return {
            student_id: sid,
            student_name: `${st.first_name} ${st.last_name}`,
            school: (st.school as string) ?? '',
            picked_time: pickedEarliest.get(sid) || null,
            arrived_time: arrivedEarliest.get(sid) || null,

            // Use earliest 'checked' from logs (respecting meta.pickupTime),
            // else if currently checked today, fall back to roster_status.last_update.
            checked_time: checkedEarliest.get(sid)
               || (String(finalStatus.get(sid) || '').toLowerCase()==='checked'
                   ? (lastUpdate.get(sid) || null)
                   : null),

            pickup_person: pickupBy.get(sid) || null,
            final_status: finalStatus.get(sid) || null,
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
  }, [dateStr])

  const filteredSorted = useMemo(() => {
    let data = [...rows]
    if (school !== 'All') data = data.filter(r => r.school === school)
    if (hideNoActivity) {
      data = data.filter(r => (r.picked_time || r.arrived_time || r.checked_time))
    }
    if (hideSkipped) {
      data = data.filter(r => (r.final_status ?? '').toLowerCase() !== 'skipped')
    }

    const norm = (s: string) => s.toLowerCase().trim()
    const last = (full: string) => {
      const noParen = full.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim()
      const parts = noParen.split(' ')
      return parts.length ? parts[parts.length - 1] : ''
    }

    const base = data
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

    // enrich with computed duration (only if >= 4h)
    const enriched = base.map(r => {
      const minutesFromPickup = diffMinutes(r.picked_time, r.checked_time)
      const minutesFromArrival = diffMinutes(r.arrived_time, r.checked_time)
      const minutes = minutesFromPickup ?? minutesFromArrival
      const isLong = minutes !== null && minutes >= MIN_LONG_STAY
      return Object.assign({}, r, {
        __total_minutes: isLong ? minutes! : null,
        __total_str: isLong ? fmtHMM(minutes!) : '',
        __isLong: !!isLong,
      })
    })
    return onlyLongStays ? enriched.filter(r => (r as any).__isLong) : enriched
  }, [rows, sortBy, hideNoActivity, hideSkipped, school, onlyLongStays])


  function exportCSV() {
    const header = [
      'Student Name',
      'School',
      'School Pickup Time',
      'Sunny Days Arrival Time',
      'Checkout Time',
      'Picked Up By',
      'Time @ Sunny (>=4h)',
      'Current Status',
    ]
    const fmt = (iso?: string | null) =>
      iso ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric', minute: '2-digit'
      }).format(new Date(iso)) : ''
    const lines = [header.join(',')]
    for (const r of filteredSorted) {
      lines.push([
        `"${r.student_name.replace(/"/g,'""')}"`,
        `"${(r.school ?? '').replace(/"/g,'""')}"`,
        `"${fmt(r.picked_time)}"`,
        `"${fmt(r.arrived_time)}"`,
        `"${fmt(r.checked_time)}"`,
        `"${(r.pickup_person ?? '').replace(/"/g,'""')}"`,
         `"${(((r as any).__total_str ?? '')).replace(/"/g,'""')}"`,
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

    return (
    <div className="container report-wrap">
      {/* toolbar */}
      <div className="card report-toolbar">
        <div className="row wrap gap" style={{alignItems:'center'}}>
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
          <div className="row gap" style={{marginLeft:'auto'}}>
           <label className="row" style={{gap:6}}>
             <input type="checkbox" checked={hideNoActivity} onChange={e=>setHideNoActivity(e.target.checked)} />
             <span className="label">Hide no activity</span>
           </label>
           <label className="row" style={{gap:6}}>
             <input type="checkbox" checked={hideSkipped} onChange={e=>setHideSkipped(e.target.checked)} />
             <span className="label">Hide skipped</span>
           </label>

           <label className="row" style={{gap:6}}>
             <input
               type="checkbox"
               checked={onlyLongStays}
               onChange={e=>setOnlyLongStays(e.target.checked)} />
             <span className="label">Only show ≥ 4 hours</span>
           </label>

           <button className="btn" onClick={exportCSV}>Download CSV</button>
          </div>
         </div>
      </div>{/* /toolbar */}
 
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
               {filteredSorted.map((r) => {
                 const fmt = (iso?: string|null) =>
                   iso ? new Intl.DateTimeFormat('en-US', {
                     timeZone:'America/New_York',
                     hour:'numeric', minute:'2-digit'
                   }).format(new Date(iso)) : ''
                 return (
                  <tr key={r.student_id}>
                    <td className="cell-name">{r.student_name}</td>
                    <td className="cell-school">{r.school}</td>
                    <td className="cell-time">{fmt(r.picked_time)}</td>
                    <td className="cell-time">{fmt(r.arrived_time)}</td>
                    <td className="cell-time">{fmt(r.checked_time)}</td>
                    <td className="cell-person">{r.pickup_person || ''}</td>
                    <td className="cell-time">{(r as any).__total_str || ''}</td>
                    <td className="cell-status">
                      <span className={`pill ${String(r.final_status||'').toLowerCase()}`}>
                        {String(r.final_status||'').toLowerCase()==='checked' ? 'checked-out' : (r.final_status || '')}
                      </span>
                    </td>
                   </tr>
                 )
               })}
             </tbody>
          </table>
          </div>
         )}
       </div>
     </div>
   )
 }
