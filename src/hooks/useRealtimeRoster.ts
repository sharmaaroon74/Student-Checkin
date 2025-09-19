// src/hooks/useRealtimeRoster.ts
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { todayKeyEST } from '../lib/date'

/**
 * Realtime subscription:
 * - No server-side filter (avoid Realtime filter quirks).
 * - Client-side: ignore rows not for today's EST date.
 * - On connect/reconnect: trigger a lightweight refetch to ensure consistency.
 */
export function useRealtimeRoster(
  setRoster: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  refetchTodayRoster: () => Promise<void>
) {
  useEffect(() => {
    let isMounted = true
    const todayEST = todayKeyEST()

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
          // Ignore events for other days
          if (row.roster_date !== todayEST) return

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
        // On joined/subscribed or rejoined, refetch today's roster once
        if (!isMounted) return
        if (status === 'SUBSCRIBED') {
          try { await refetchTodayRoster() } catch { /* ignore */ }
        }
      })

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [setRoster, refetchTodayRoster])
}
