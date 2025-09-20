import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Don’t throw—let the UI render and show a friendlier message
  console.error(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Create .env.local and restart the dev server / redeploy.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Expose for debugging in DevTools console:
// Now you can run:  const { data } = await window.supabase.auth.getSession()
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).supabase = supabase
} catch {
  /* noop – SSR or very old browsers */
}
