import { supabase } from './supabase'

export async function forceLogout() {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
  window.location.replace('/')
}
