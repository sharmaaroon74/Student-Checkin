// src/lib/authEvents.ts
import { supabase } from './supabase'

function redirectHomeOnce() {
  if (window.location.pathname !== '/') {
    window.location.replace('/')
  }
}

/**
 * Monitors auth state changes and redirects to /login when the user becomes unauthenticated.
 * Notes:
 * - Supabase v2 does NOT emit a "TOKEN_REFRESHED_FAILED" event.
 * - We handle SIGNED_OUT directly, and sanity-probe on TOKEN_REFRESHED.
 * - We also run a lightweight periodic session check in case refresh silently fails.
 */
export function startAuthMonitor() {
  const sub = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      // Only redirect if we're not already on root
      redirectHomeOnce()
      return
    }

    if (event === 'INITIAL_SESSION' && !session) {
      // Let App.tsx render <Login/> at '/'
      redirectHomeOnce()
      return
    }

    if (event === 'TOKEN_REFRESHED') {
      // Sanity probe to ensure refreshed token is truly valid
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
        redirectHomeOnce()
      }
    }
  })

  // Optional: periodic probe (not required for this fix)
  const interval = window.setInterval(async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session) {
      try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
      redirectHomeOnce()
    }
  }, 10 * 60 * 1000)

  return {
    data: sub,
    stop() {
      try { clearInterval(interval) } catch {}
      try { sub.data.subscription?.unsubscribe?.() } catch {}
    }
  }
}