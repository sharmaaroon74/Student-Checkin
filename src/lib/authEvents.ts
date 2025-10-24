// src/lib/authEvents.ts
import { supabase } from './supabase'

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
      window.location.replace('/')
      return
    }

    // If we booted without a session (some edge cases), treat as signed out
    if (event === 'INITIAL_SESSION' && !session) {
      window.location.replace('/')
      return
    }

    if (event === 'TOKEN_REFRESHED') {
      // Sanity probe: ensure we truly have a valid user after refresh
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
        window.location.replace('/')
      }
    }
  })

  // Optional: periodic session probe (catches rare silent refresh issues)
  const interval = window.setInterval(async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session) {
      try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
      window.location.replace('/')
    }
  }, 10 * 60 * 1000) // every 10 minutes

  // Expose same shape you already use in App.tsx
  return {
    data: sub,
    // optional helper if you want manual cleanup elsewhere
    stop() {
      try { clearInterval(interval) } catch {}
      try { sub.data.subscription?.unsubscribe?.() } catch {}
    }
  }
}
