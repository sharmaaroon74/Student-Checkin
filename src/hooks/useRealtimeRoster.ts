// src/hooks/useRealtimeRoster.ts
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { todayKeyEST } from '../lib/date'

/**
 * Realtime + fallback polling (visible-tab only).
 * - Subscribe to ALL changes on public.roster_status and ignore non-EST-today rows client-side.
 * - Log subscription status and payloads for quick diagnostics.
 * - On (re)subscribe and every 5s while the tab is visible, do a light refetch (cheap).
 */
export function useRealtimeRoster(
  setRoster: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  refetchTodayRoster: () => Promise<void>
) {
  const pollTimer = useRef<number | null>(null)

  useEffect(() => {
    const today = todayKeyEST()

    // --- Realtime subscription
    const channel = supabase
      .channel('roster-status-realtime', {
        config: { broadcast: { ack: true }, presence: { key: 'roster' } },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roster_status' },
        (payload) => {
          const row: any = payload.new ?? payload.old
          if (!row) return
          if (row.roster_date !== today) return // ignore other days

          // Uncomment during diagnostics (then re-deploy once stable)
          // console.log('[RT]', payload.eventType, row.student_id, row.current_status)

          const { student_id, current_status } = row
          setRoster((prev) => {
            const next = { ...prev }
            if (payload.eventType === 'DELETE') {
              delete next[student_id]
            } else {
              next[student_id] = current_status
            }
            return next
          })
        }
      )
      .subscribe(async (status) => {
        // console.log('[RT] status:', status)
        if (status === 'SUBSCRIBED') {
          try { await refetchTodayRoster() } catch {}
        }
      })

    // --- Visible-tab polling fallback (every 5s)
    const startPolling = () => {
      if (pollTimer.current) return
      pollTimer.current = window.setInterval(async () => {
        if (document.visibilityState === 'visible') {
          try { await refetchTodayRoster() } catch {}
        }
      }, 5000)
    }
    const stopPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') startPolling()
      else stopPolling()
    }
    document.addEventListener('visibilitychange', onVis)
    // start immediately if visible
    if (document.visibilityState === 'visible') startPolling()

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVis)
      stopPolling()
    }
  }, [setRoster, refetchTodayRoster])
}
