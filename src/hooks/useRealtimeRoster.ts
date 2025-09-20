// src/hooks/useRealtimeRoster.ts
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Realtime roster updates + visible-tab polling fallback.
 * - Subscribes to INSERT/UPDATE/DELETE on public.roster_status for today's EST date.
 * - Immediately updates roster + times.
 * - On subscribe (and every 6s when tab is visible), refetch to stay in sync.
 */
export function useRealtimeRoster(
  rosterDateEST: string,
  setRoster: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  setRosterTimes: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  refetchTodayRoster: () => Promise<void>
) {
  const pollTimer = useRef<number | null>(null)

  useEffect(() => {
    // --- Realtime channel filtered to today's roster_date ---
    const channel = supabase
      .channel(`roster-status-${rosterDateEST}`, {
        config: { broadcast: { ack: true } },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'roster_status',
          // server-side filter ensures we only get today's rows
          filter: `roster_date=eq.${rosterDateEST}`,
        },
        (payload) => {
          const row: any = payload.new ?? payload.old
          if (!row) return

          if (payload.eventType === 'DELETE') {
            setRoster((prev) => {
              const next = { ...prev }
              delete next[row.student_id]
              return next
            })
            setRosterTimes((prev) => {
              const next = { ...prev }
              delete next[row.student_id]
              return next
            })
          } else {
            // INSERT / UPDATE
            setRoster((prev) => ({ ...prev, [row.student_id]: row.current_status }))
            if (row.last_update) {
              setRosterTimes((prev) => ({ ...prev, [row.student_id]: row.last_update }))
            }
          }
        }
      )
      .subscribe(async (status) => {
        // console.log('[RT] channel status:', status)
        if (status === 'SUBSCRIBED') {
          try { await refetchTodayRoster() } catch {}
        }
      })

    // --- Visible-tab polling fallback every 6s ---
    const startPolling = () => {
      if (pollTimer.current) return
      pollTimer.current = window.setInterval(async () => {
        if (document.visibilityState === 'visible') {
          try { await refetchTodayRoster() } catch {}
        }
      }, 6000)
    }
    const stopPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') startPolling()
      else stopPolling()
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (document.visibilityState === 'visible') startPolling()

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisibility)
      stopPolling()
    }
  }, [rosterDateEST, setRoster, setRosterTimes, refetchTodayRoster])
}
