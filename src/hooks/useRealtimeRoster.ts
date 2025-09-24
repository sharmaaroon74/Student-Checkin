// src/hooks/useRealtimeRoster.ts
import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { todayKeyEST } from '../lib/date'
import type { Status } from '../types'

/**
 * Realtime + visible-tab polling fallback.
 * Direction-aware timestamp updates:
 *  - Forward (not_picked->picked->arrived->checked): use server last_update.
 *  - Undo (e.g., checked->arrived, arrived->picked): restore the ORIGINAL (earliest) log time for that status.
 *  - Same-status: leave times unchanged.
 */
export function useRealtimeRoster(
  rosterDateEST: string,
  setRoster: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  setRosterTimes: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  refetchTodayRoster: () => Promise<void>
) {
  const pollTimer = useRef<number | null>(null)
  const lastStatusRef = useRef<Record<string, Status>>({})
  const ORDER: Record<Status, number> = { not_picked:0, picked:1, arrived:2, checked:3, skipped:4 }

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
          if (row.roster_date !== today) return

          const { student_id, current_status, last_update } = row as {
            student_id: string
            current_status: Status
            last_update: string
          }

          // 1) update the status map
          setRoster((prev) => {
            const next = { ...prev }
            if (payload.eventType === 'DELETE') delete next[student_id]
            else next[student_id] = current_status
            return next
          })

          // 2) decide how to set the time (direction-aware)
          const prev = lastStatusRef.current[student_id]
          const next = current_status

          // Same-status event → leave time as-is
          if (prev && prev === next) {
            lastStatusRef.current[student_id] = next
            return
          }

          const isForward = !prev || ORDER[next] > ORDER[prev]
          const showTime = (s: Status) => s === 'picked' || s === 'arrived' || s === 'checked'

          if (showTime(next)) {
            if (isForward) {
              // forward: use server last_update
              setRosterTimes((p) => ({ ...p, [student_id]: last_update }))
            } else {
              // undo: restore ORIGINAL time for that status from logs
              supabase
                .from('logs')
                .select('at')
                .eq('roster_date', rosterDateEST)
                .eq('student_id', student_id)
                .eq('action', next)
                .order('at', { ascending: true }) // earliest
                .limit(1)
                .maybeSingle()
                .then(({ data }) => {
                  if (data?.at) {
                    setRosterTimes((p) => ({ ...p, [student_id]: data.at as string }))
                  }
                })
            }
          }

          lastStatusRef.current[student_id] = next
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
     if (document.visibilityState === 'visible') startPolling()
 
     return () => {
       supabase.removeChannel(channel)
       document.removeEventListener('visibilitychange', onVis)
       stopPolling()
     }
  }, [rosterDateEST, setRoster, setRosterTimes, refetchTodayRoster])
}
