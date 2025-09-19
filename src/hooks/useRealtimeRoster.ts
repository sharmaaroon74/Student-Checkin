import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { todayKeyEST } from '../lib/date'

/**
 * Subscribes to realtime Postgres changes for today's roster rows (EST).
 * Merges INSERT/UPDATE/DELETE into your local roster map.
 */
export function useRealtimeRoster(
  setRoster: React.Dispatch<React.SetStateAction<Record<string, any>>>
) {
  useEffect(() => {
    const today = todayKeyEST()

    const channel = supabase
      .channel('roster-status-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'roster_status',
          filter: `roster_date=eq.${today}`, // EST day
        },
        (payload) => {
          const row: any = payload.new ?? payload.old
          if (!row) return
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [setRoster])
}
