import React, { useMemo, useState, useEffect } from 'react'
import type { Status, StudentRow } from '../types'
import TopToolbar from '../components/TopToolbar'
import { supabase } from '../lib/supabase'

type Props = {
  students: StudentRow[]
  roster: Record<string, Status>
  onSet: (id: string, st: Status, meta?: any) => Promise<void> | void
  pickedTodayIds?: string[]
}

const ALLOWED_SCHOOLS = ['Bain', 'QG', 'MHE', 'MC']
const BUS_ELIGIBLE_YEARS = [
  'FT - A',
  'FT - B/A',
  'PT3 - A - TWR',
  'PT3 - A - MWF',
  'PT2 - A - WR',
  'PT3 - A - TWF',
]

export default function SkipPage({ students, roster, onSet }: Props) {
  const [schoolSel, setSchoolSel] =
    useState<'All' | 'Bain' | 'QG' | 'MHE' | 'MC'>('All')
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')

  // Tabs
  const [view, setView] = useState<'today' | 'schedule'>('today')

  // Scheduling state
  const [schedStudentId, setSchedStudentId] = useState<string>('')
  const [dateDraft, setDateDraft] = useState<string>('')
  const [dates, setDates] = useState<string[]>([])
  const [note, setNote] = useState<string>('')
  const [future, setFuture] = useState<Array<{ student_id: string; student_name: string; school: string | null; on_date: string; note: string | null }>>([])  
  const [loadingFuture, setLoadingFuture] = useState(false)
  const [saving, setSaving] = useState(false)

  // Meeting-style scheduler UI state (weekdays only; no weekends)
  const [patternDays, setPatternDays] = useState<{[k in 'M'|'T'|'W'|'R'|'F']?: boolean}>({})
  const [patternStart, setPatternStart] = useState<string>('') // YYYY-MM-DD
  const [patternEnd, setPatternEnd] = useState<string>('')     // YYYY-MM-DD
  // Every N weeks (1 = weekly, 2 = alternate weeks, etc.)
  const [patternInterval, setPatternInterval] = useState<number>(1)

  // Display name according to current sort toggle
  const nameFor = (s: StudentRow) =>
    sortBy === 'first' ? `${s.first_name} ${s.last_name}` : `${s.last_name}, ${s.first_name}`

  // Filter + search for Today tab
  const filtered = useMemo(() => {
    const qry = q.trim().toLowerCase()
    const list = students.filter(s => {
      const name = `${s.first_name} ${s.last_name}`.toLowerCase()
      const inSchool = (schoolSel === 'All') ? true : s.school === schoolSel
      const isAllowedSchool = (s.school ? ALLOWED_SCHOOLS.includes(s.school) : true)
      const isEligibleYear = (s.school_year ? BUS_ELIGIBLE_YEARS.includes(s.school_year) : true)
      const ok = (!qry || name.includes(qry)) && inSchool && isAllowedSchool && isEligibleYear && s.active
      return ok
    })
    return list
  }, [students, schoolSel, q, sortBy])

  // ---------- GLOBAL COUNTS ----------
  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      not_picked: 0, picked: 0, arrived: 0, checked: 0, skipped: 0,
    }
    for (const id of Object.keys(roster)) {
      const st = roster[id]
      if (st && c[st] !== undefined) c[st]++
    }
    return c
  }, [roster])

  // ====== Scheduling helpers ======
  const todayKey = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date())

  // Fetch ALL current/future scheduled skips (global list, active only)
  async function refreshFutureList() {
    setLoadingFuture(true)
    try {
      const from = todayKey()
      const { data, error } = await supabase
        .from('future_skips')
        .select('student_id, on_date, note, is_active, students!inner(id, first_name, last_name, school)')
        .eq('is_active', true)
        .gte('on_date', from)
        .order('on_date', { ascending: true })
      if (error) throw error
      const rows = (data || []).map((r: any) => ({
        student_id: r.student_id as string,
        student_name: `${r.students.first_name} ${r.students.last_name}`,
        school: r.students.school ?? null,
        on_date: r.on_date as string,
        note: r.note ?? null,
      }))
      setFuture(rows)
    } catch (e) {
      console.warn('[future skips] fetch', e)
      setFuture([])
    } finally {
      setLoadingFuture(false)
    }
  }

  // List should refresh when entering Schedule, or after schedule changes
  useEffect(() => { if (view === 'schedule') { refreshFutureList() } }, [view])

  async function scheduleDates() {
    if (!schedStudentId) { alert('Choose a student.'); return }
    const clean = Array.from(new Set(dates.map(d => d.trim()).filter(Boolean)))
    if (clean.length === 0) { alert('Add at least one date.'); return }
    setSaving(true)
    try {
      try {
        const { error } = await supabase.rpc('api_schedule_future_skips', {
          p_student_id: schedStudentId, p_dates: clean, p_note: note || null
        })
        if (error) throw error
      } catch {
        // Fallback upsert per-date
        const payload = clean.map(d => ({ student_id: schedStudentId, on_date: d, note, is_active: true }))
        const { error } = await supabase.from('future_skips').upsert(payload, { onConflict: 'student_id,on_date' })
        if (error) throw error
      }
      setDates([]); setDateDraft(''); setNote('')
      await refreshFutureList()
    } catch (e) {
      console.error('[future skips] schedule', e)
      alert('Failed to schedule. Please try again.')
    } finally { setSaving(false) }
  }

  async function unschedule(studentId: string, dateStr: string) {
    try {
      try {
        const { error } = await supabase.rpc('api_unschedule_future_skip', {
          p_student_id: studentId, p_date: dateStr
        })
        if (error) throw error
      } catch {
        const { error } = await supabase.from('future_skips').update({ is_active: false })
          .eq('student_id', studentId).eq('on_date', dateStr)
        if (error) throw error
      }
      await refreshFutureList()
    } catch (e) {
      console.error('[future skips] unschedule', e)
      alert('Failed to remove this date.')
    }
  }

  // === NY-safe civil-day helpers (use NOON UTC to avoid timezone rollbacks) ===
  const DAY_MS = 86400000

  function nyFormatYYYYMMDD(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'
    }).format(d)
  }

  // Build a Date that represents the NY calendar date (ymd) at **noon UTC**
  function nyNoonUTC(y: number, m: number, d: number): Date {
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
  }

  function parseYMD(ymd: string): Date | null {
    if (!ymd) return null
    const [y, m, d] = ymd.split('-').map(Number)
    if (!y || !m || !d) return null
    return nyNoonUTC(y, m, d)
  }

  function nyWeekdayCode(dateNoonUTC: Date): 'M'|'T'|'W'|'R'|'F' | null {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short'
    }).format(dateNoonUTC)
    switch (wd) {
      case 'Mon': return 'M'
      case 'Tue': return 'T'
      case 'Wed': return 'W'
      case 'Thu': return 'R'
      case 'Fri': return 'F'
      default:    return null      // Sat/Sun
    }
  }

  function startOfWeekMondayNY(dateNoonUTC: Date): Date {
    const wdShort = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short'
    }).format(dateNoonUTC)
    const offMap: Record<string, number> = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 }
    const off = offMap[wdShort] ?? 0
    return new Date(dateNoonUTC.getTime() - off * DAY_MS) // still noon UTC
  }

  function weekIndexFrom(baseMondayNoonUTC: Date, dateNoonUTC: Date): number {
    const monday = startOfWeekMondayNY(dateNoonUTC)
    const diffDays = Math.floor((monday.getTime() - baseMondayNoonUTC.getTime()) / DAY_MS)
    // diffDays is multiple of 7 (civil), convert to weeks non-negatively
    return Math.floor(diffDays / 7)
  }

  // First selected weekday ON/AFTER a given date
  function firstWeekdayOnOrAfter(startNoonUTC: Date, code: 'M'|'T'|'W'|'R'|'F'): Date {
    for (let i = 0; i < 7; i++) {
      const t = new Date(startNoonUTC.getTime() + i * DAY_MS)
      const c = nyWeekdayCode(t)
      if (c === code) return t
    }
    return startNoonUTC
  }

  // Generate dates with the **revised rule**:
  // - Start counting FROM Start (today can count)
  // - Anchor parity to the first selected weekday ON/AFTER Start
  // - Include only Mon–Fri on selected weekdays whose week-index matches parity for Every N weeks
  function generatePatternDates(
    startInclusive: string,
    endInclusive: string,
    days: {[k:string]:boolean},
    everyNWeeks: number
  ): string[] {
    if (!startInclusive || !endInclusive) return []
    const startNY = parseYMD(startInclusive)
    const endNY   = parseYMD(endInclusive)
    if (!startNY || !endNY) return []
    if (endNY.getTime() < startNY.getTime()) return []

    // 1) first selected weekday ON/AFTER Start
    let firstSelected: Date | null = null
    ;(['M','T','W','R','F'] as const).forEach(k => {
      if (!days[k]) return
      const d = firstWeekdayOnOrAfter(startNY, k)
      if (!firstSelected || d.getTime() < firstSelected.getTime()) firstSelected = d
    })
    if (!firstSelected) return []

    // 2) anchor = Monday of that first-selected week (all at noon UTC)
    const anchorMonday = startOfWeekMondayNY(firstSelected)

    // 3) iterate from Start through End (all at noon UTC)
    const out: string[] = []
    for (let t = new Date(startNY.getTime()); t.getTime() <= endNY.getTime(); t = new Date(t.getTime() + DAY_MS)) {
      const code = nyWeekdayCode(t)
      if (!code) continue            // skip weekends
      if (!days[code]) continue
      const w = weekIndexFrom(anchorMonday, t)
      if (everyNWeeks > 1 && (w % everyNWeeks) !== 0) continue
      out.push(nyFormatYYYYMMDD(t))
    }
    return out
  }

  function addPatternDates() {
    const anySelected = ['M','T','W','R','F'].some(k => !!patternDays[k as keyof typeof patternDays])
    if (!anySelected) { alert('Select at least one weekday.'); return }
    if (!patternStart) { alert('Choose a Start date.'); return }
    if (!patternEnd) { alert('Choose an End date.'); return }
    if (patternInterval < 1 || !Number.isFinite(patternInterval)) { alert('Every N weeks must be 1 or greater.'); return }
    const gen = generatePatternDates(
      patternStart,
      patternEnd,
      patternDays,
      Math.max(1, Math.floor(patternInterval))
    )
    if (gen.length === 0) { alert('No dates were generated for the selected pattern.'); return }
    setDates(prev => {
      const set = new Set(prev)
      for (const d of gen) set.add(d)
      return Array.from(set).sort()
    })
  }

  // ---------- UI ----------
  return (
    <div className="page container">
      {/* Tab switcher */}
      <div className="row wrap gap" style={{alignItems:'center', marginBottom:8}}>
        <div className="seg">
          <button className={`seg-btn ${view==='today'?'on':''}`} onClick={()=>setView('today')}>Today</button>
          <button className={`seg-btn ${view==='schedule'?'on':''}`} onClick={()=>setView('schedule')}>Schedule</button>
        </div>
      </div>

      <TopToolbar
        schoolSel={schoolSel}
        onSchoolSel={setSchoolSel}
        search={q}
        onSearch={setQ}
        sortBy={sortBy}
        onSortBy={setSortBy}
        counts={counts}
      />

      {/* TODAY VIEW */}
      {view === 'today' && (
        <div className="two-col" style={{ marginTop: 12 }}>
          <div className="card">
            <h3 className="section-title">Mark Skip Today</h3>
            <div className="list">
              {filtered
                .slice()
                .sort((a, b) => nameFor(a).localeCompare(nameFor(b)))
                .map(s => {
                  const st = roster[s.id] || 'not_picked'
                  if (st === 'skipped') return null
                  return (
                    <div key={s.id} className="card-row sd-row">
                      <div>
                        <div className="heading">{nameFor(s)}</div>
                        <div className="sub">{s.school}</div>
                      </div>
                      <div className="sd-card-actions">
                        <button className="btn" onClick={() => onSet(s.id, 'skipped')}>Skip Today</button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="card">
            <h3 className="section-title">Skipped Today</h3>
            <div className="list">
              {filtered
                .slice()
                .sort((a, b) => nameFor(a).localeCompare(nameFor(b)))
                .map(s => {
                  const st = roster[s.id] || 'not_picked'
                  if (st !== 'skipped') return null
                  return (
                    <div key={s.id} className="card-row sd-row">
                      <div>
                        <div className="heading">{nameFor(s)}</div>
                        <div className="sub">{s.school}</div>
                      </div>
                      <div className="sd-card-actions">
                        <button className="btn" onClick={() => onSet(s.id, 'not_picked')}>Unskip</button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULE VIEW */}
      {view === 'schedule' && (
        <div className="two-col" style={{ marginTop: 12 }}>
          {/* Left: create schedule */}
          <div className="card">
            <h3 className="section-title">Schedule Future Skips</h3>
            <div className="col" style={{gap:8}}>
              {/* Pattern */}
              <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <label className="label">Pattern</label>
                <div className="row" style={{gap:6, flexWrap:'wrap'}}>
                  {(['M','T','W','R','F'] as const).map(k=>(
                    <label key={k} className="row" style={{gap:4, alignItems:'center'}}>
                      <input
                        type="checkbox"
                        checked={!!patternDays[k]}
                        onChange={e=>setPatternDays(p=>({...p, [k]: e.target.checked}))}
                      />
                      <span className="chip">{k}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <label className="label">Start</label>
                <input type="date" value={patternStart} onChange={e=>setPatternStart(e.target.value)} />
                <label className="label">End</label>
                <input type="date" value={patternEnd} onChange={e=>setPatternEnd(e.target.value)} />
                <label className="label">Every</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  style={{width:80}}
                  value={patternInterval}
                  onChange={e=>setPatternInterval(Number(e.target.value||'1'))}
                />
                <span className="label">week(s)</span>
                <button className="btn" onClick={addPatternDates}>Add to list</button>
              </div>

              {/* Live preview */}
              <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
                {(() => {
                  const anySelected = ['M','T','W','R','F'].some(k => !!patternDays[k as keyof typeof patternDays])
                  const preview = (patternStart && patternEnd && anySelected)
                    ? generatePatternDates(
                        patternStart,
                        patternEnd,
                        patternDays,
                        Math.max(1, Math.floor(patternInterval||1))
                      )
                    : []
                  const show = preview.slice(0, 12)
                  return (
                    <div className="row" style={{gap:6, flexWrap:'wrap'}}>
                      <span className="muted">Preview ({preview.length}):</span>
                      {show.map(d => <span key={d} className="chip">{d}</span>)}
                      {preview.length > show.length && <span className="muted">…</span>}
                    </div>
                  )
                })()}
              </div>
              <hr />

              <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <label className="label">Student</label>
                <select value={schedStudentId} onChange={e=>setSchedStudentId(e.target.value)}>
                  <option value="">— Select —</option>
                  {students
                    .slice()
                    .sort((a,b)=>nameFor(a).localeCompare(nameFor(b)))
                    .map(s=>(
                      <option key={s.id} value={s.id}>{nameFor(s)} — {s.school}</option>
                    ))}
                </select>
              </div>
              <div className="row" style={{gap:8, alignItems:'center', flexWrap:'wrap'}}>
                <label className="label">Add Date</label>
                <input type="date" value={dateDraft} onChange={e=>setDateDraft(e.target.value)} />
                <button className="btn" onClick={()=>{
                  const d = (dateDraft||'').trim()
                  if (!d) return
                  setDates(prev => prev.includes(d) ? prev : [...prev, d].sort())
                }}>Add</button>
              </div>
              <div className="row" style={{gap:6, flexWrap:'wrap'}}>
                {dates.length===0 ? <span className="muted">No dates added.</span> :
                  dates.map(d=>(
                    <span key={d} className="chip">
                      {d}
                      <button className="btn" style={{marginLeft:6}} onClick={()=>{
                        setDates(prev => prev.filter(x=>x!==d))
                      }}>×</button>
                    </span>
                  ))
                }
              </div>
              <div className="row" style={{gap:8, alignItems:'center'}}>
                <label className="label">Note</label>
                <input placeholder="(optional)" value={note} onChange={e=>setNote(e.target.value)} />
                <button className="btn primary" disabled={!schedStudentId || dates.length===0 || saving} onClick={scheduleDates}>
                  {saving ? 'Saving…' : `Schedule ${dates.length||''}`}
                </button>
              </div>
            </div>
          </div>

          {/* Right: upcoming schedule (global, grouped by date, active-only) */}
          <div className="card">
            <h3 className="section-title">Upcoming Scheduled Skips</h3>
            {loadingFuture ? (
              <div className="muted">Loading…</div>
            ) : future.length===0 ? (
              <div className="muted">No future skip dates found.</div>
            ) : (
              (() => {
                const groups: Record<string, typeof future> = {}
                for (const r of future) (groups[r.on_date] ??= []).push(r)
                const datesSorted = Object.keys(groups).sort()
                return (
                  <div className="list">
                    {datesSorted.map(dt => (
                      <div key={dt} className="card-row sd-row" style={{flexDirection:'column', alignItems:'stretch'}}>
                        <div className="heading" style={{marginBottom:6}}>{dt}</div>
                        <div className="col" style={{gap:6}}>
                          {groups[dt]
                            .slice()
                            .sort((a,b)=>a.student_name.localeCompare(b.student_name))
                            .map(r => (
                              <div key={`${dt}-${r.student_id}`} className="row" style={{justifyContent:'space-between', alignItems:'center', gap:8}}>
                                <div className="row" style={{gap:8, flexWrap:'wrap'}}>
                                  <span className="chip">{r.student_name}</span>
                                  {r.school ? <span className="muted">{r.school}</span> : null}
                                  {r.note ? <span className="muted">• {r.note}</span> : null}
                                </div>
                                <div className="sd-card-actions">
                                  <button className="btn" onClick={()=>unschedule(r.student_id, dt)}>Remove</button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}
          </div>
        </div>
      )}
    </div>
  )
}
