// src/lib/sessionGuard.ts
import { supabase } from './supabase'

export async function verifySession(): Promise<'ok'|'fixed'|'signed_out'> {
  try {
    // 1) Do we even have a session object?
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      await supabase.auth.signOut({ scope: 'local' })
      return 'signed_out'
    }

    // 2) Prove the token actually works
    const { data: userData, error } = await supabase.auth.getUser()
    if (error || !userData?.user) {
      // Try refresh, then give up
      const refresh = await supabase.auth.refreshSession()
      if (refresh.error) {
        await supabase.auth.signOut({ scope: 'local' })
        return 'signed_out'
      }
    }
    return 'ok'
  } catch {
    await supabase.auth.signOut({ scope: 'local' })
    return 'fixed'
  }
}
