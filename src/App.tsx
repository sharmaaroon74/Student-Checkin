import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './Login'
import { StudentRow, Status } from './types'
import BusPage from './pages/BusPage'
import CenterPage from './pages/CenterPage'
import SkipPage from './pages/SkipPage'
import './index.css'

type Page = 'bus'|'center'|'skip'
const todayKey = () => new Date().toISOString().slice(0,10)

export default function App(){
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [page, setPage] = useState<Page>('bus')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [roster, setRoster] = useState<Record<string, Status>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)

  // Auth
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      setSession(data.session ?? null)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s)=> setSession(s))
    return ()=> sub.subscription.unsubscribe()
  },[])

  async function refreshRoster(){
    const today = todayKey()
    const rRes = await supabase.from('roster_status').select('*').eq('roster_date', today)
    if (rRes.error) { setError(rRes.error.message); return }
    const map: Record<string, Status> = {}
    ;(rRes.data||[]).forEach((r:any)=>{ map[r.student_id] = r.current_status })
    setRoster(map)
  }

  // Load students + ONLY initialize today's roster if it's missing
  useEffect(()=>{
    if(!session) return
    ;(async()=>{
      setLoading(true); setError(null)
      const today = todayKey()

      // ✅ Fix #1: do NOT reset on every load; only initialize if no rows for today yet
      const exists = await supabase
        .from('roster_status')
        .select('id', { count: 'exact', head: true })
        .eq('roster_date', today)

      if (!exists.error && (exists.count ?? 0) === 0) {
        const reset = await supabase.rpc('api_daily_reset', { p_date: today })
        if (reset.error) console.warn('api_daily_reset:', reset.error.message)
      }

      // Students
      const sRes = await supabase.from('students').select('*').eq('active', true).order('last_name')
      if (sRes.error) { setError(sRes.error.message); setLoading(false); return }
      setStudents((sRes.data||[]) as any)

      // Today's roster
      await refreshRoster()
      setLoading(false)
    })()
  },[session])

  // Realtime subscription
  useEffect(()=>{
    if(!session) return
    const today = todayKey()
    const ch = supabase.channel('roster-v5')
      .on('postgres_changes', { event:'*', schema:'public', table:'roster_status', filter:`roster_date=eq.${today}` },
        async (_payload)=>{ await refreshRoster() })
      .subscribe()
    return ()=> { supabase.removeChannel(ch) }
  },[session])

  async function setStatus(studentId: string, status: Status){
    const today = todayKey()
    const { error } = await supabase.rpc('api_set_status', {
      p_student_id: studentId,
      p_roster_date: today,
      p_new_status: status,
      p_pickup_person: null,
      p_meta: { source:'ui' }
    })
    if(error){ alert(error.message); return }
    setRoster(prev=>({ ...prev, [studentId]: status }))
  }

  if(!ready) return null
  if(!session) return <Login onDone={()=>{}}/>

  return (
    <div className="container">
      <div className="topbar" style={{marginTop:12}}>
        <div className="row">
          <button className={"tab " + (page==='bus'?'active':'')} onClick={()=>setPage('bus')}>Bus</button>
          <button className={"tab " + (page==='center'?'active':'')} onClick={()=>setPage('center')}>Center</button>
          <button className={"tab " + (page==='skip'?'active':'')} onClick={()=>setPage('skip')}>Skip</button>
        </div>
        <div className="row">
          <div className="pill">Roster: <b>{todayKey()}</b></div>
          <button className="btn small" onClick={async()=>{
            const { error } = await supabase.rpc('api_daily_reset', { p_date: todayKey() })
            if(error) alert(error.message); else refreshRoster()
          }}>Daily Reset</button>
          <button className="btn" onClick={async()=>{ await supabase.auth.signOut() }}>Sign Out</button>
        </div>
      </div>

      {loading && <p className="muted" style={{marginTop:8}}>Loading…</p>}
      {error && <p style={{color:'crimson'}}>{error}</p>}

      {!loading && !error && (
        <>
          {page==='bus' && <BusPage students={students} roster={roster} onSet={setStatus} />}
          {page==='center' && <CenterPage students={students} roster={roster} onSet={setStatus} />}
          {page==='skip' && <SkipPage students={students} roster={roster} onSet={setStatus} />}
        </>
      )}
    </div>
  )
}
