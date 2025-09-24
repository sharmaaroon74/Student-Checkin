import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { todayKeyEST } from '../lib/date'
import type { Status } from '../types'

/**
 * Realtime + visible-tab polling fallback (5s).
 * Direction-aware time updates to avoid clobbering restored times on Undo:
 *  - Forward (not_picked->picked->arrived->checked): use server last_update
 *  - Backward (Undo): use earliest log time for that target status (today)
 *  - Same-status: leave time unchanged
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

          // 1) update status map
          setRoster(prev => {
            const next = { ...prev }
            if (payload.eventType === 'DELETE') delete next[student_id]
            else next[student_id] = current_status
            return next
          })

          // 2) direction-aware time update
          const prev = lastStatusRef.current[student_id]
          const next = current_status

          // same-status → ignore
          if (prev && prev === next) {
            lastStatusRef.current[student_id] = next
            return
          }

          const isForward = !prev || ORDER[next] > ORDER[prev]
          const showTime = (s: Status) => s === 'picked' || s === 'arrived' || s === 'checked'

          if (showTime(next)) {
            if (isForward) {
              // forward: trust server last_update
              setRosterTimes(p => ({ ...p, [student_id]: last_update }))
            } else {
              // undo: restore original earliest time for target status
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
                    setRosterTimes(p => ({ ...p, [student_id]: data.at as string }))
                  }
                })
            }
          }

          lastStatusRef.current[student_id] = next
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await refetchTodayRoster() } catch {}
        }
      })

    // visible-tab polling fallback (5s)
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
