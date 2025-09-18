import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    setBusy(false)
    if (error) setErr(error.message); else onDone()
  }

  return (
    <form onSubmit={signIn} className="container" style={{maxWidth:420, marginTop: '12vh'}}>
      <div className="card">
        <h2 className="heading">Sunny Days — Staff Login</h2>
        <p className="muted" style={{marginTop:4}}>Use the shared staff email & password you created in Supabase Auth.</p>
        <div style={{marginTop:12, display:'grid', gap:10}}>
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input placeholder="Password" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
          {err && <div style={{color:'crimson', fontSize:13}}>{err}</div>}
          <button className={"btn primary"} disabled={busy} type="submit">{busy? 'Signing in…':'Sign In'}</button>
        </div>
      </div>
    </form>
  )
}
