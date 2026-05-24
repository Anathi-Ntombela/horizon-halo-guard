import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, AlertOctagon } from 'lucide-react'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EVENT_LABELS } from '@/lib/halo'
import { cn } from '@/lib/utils'

type Event = {
  id: string
  event_type: string
  severity: string
  created_at: string
  metadata: Record<string, unknown>
}

function severityDot(sev: string) {
  if (sev === 'critical') return 'bg-red-600 ring-red-200 animate-pulse'
  if (sev === 'high')     return 'bg-amber-500 ring-amber-200'
  return 'bg-slate-400 ring-slate-200'
}

function summariseMeta(m: Record<string, unknown>) {
  if (!m) return ''
  const pairs: string[] = []
  for (const k of ['email', 'recipient_email', 'amount', 'context', 'path', 'failures', 'outcome']) {
    const v = m[k]
    if (v == null) continue
    if (typeof v === 'object') pairs.push(`${k}: ${JSON.stringify(v)}`)
    else pairs.push(`${k}: ${String(v)}`)
    if (pairs.length >= 2) break
  }
  return pairs.join(' • ')
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false })
}

export function IncidentTimeline() {
  const [tick, setTick] = useState(0)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const q = useQuery({
    queryKey: ['halo-incidents', tick],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('halo_events')
        .select('id,event_type,severity,created_at,metadata')
        .in('severity', ['critical', 'high'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as Event[]
    },
  })

  // Realtime — refresh whenever a new halo_event lands.
  useEffect(() => {
    const ch = supabase.channel('halo_events_timeline')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'halo_events' },
        () => setTick((t) => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const events = q.data ?? []

  if (events.length === 0) {
    return (
      <Card className="p-10 text-center space-y-3">
        <ShieldCheck className="size-12 text-emerald-500 mx-auto" />
        <h2 className="text-lg font-semibold">No critical incidents in the last 24 hours.</h2>
        <p className="text-sm text-muted-foreground">System operating normally.</p>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertOctagon className="size-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Incident Timeline — last 24 hours</h2>
        <Badge variant="outline" className="ml-auto">{events.length} events</Badge>
      </div>

      <ol className="relative border-l-2 border-slate-200 ml-3 space-y-5">
        {events.map((e) => (
          <li key={e.id} className="pl-6 relative">
            <span className={cn(
              'absolute -left-[9px] top-1.5 size-4 rounded-full ring-4',
              severityDot(e.severity),
            )} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {EVENT_LABELS[e.event_type] ?? e.event_type.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {summariseMeta(e.metadata) || '—'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <Badge variant="outline" className="text-[10px] tracking-wider uppercase">
                  {e.event_type.replace(/_/g, ' ')}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {formatTime(e.created_at)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
