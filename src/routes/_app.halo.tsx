import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Shield, AlertTriangle, Activity, Eye, Hammer, Trash2, Zap,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea,
} from 'recharts'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ForensicsPanel } from '@/components/halo/ForensicsPanel'
import { LayersPanel } from '@/components/halo/LayersPanel'
import {
  fetchHaloStatus, triggerHoneypot, clearHaloEvents, severityColor, relativeTime,
} from '@/lib/halo'

export const Route = createFileRoute('/_app/halo')({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) throw redirect({ to: '/sign-in' })
    const { data: ok } = await supabase.rpc('has_role', {
      _user_id: sess.session.user.id, _role: 'admin',
    })
    if (!ok) throw redirect({ to: '/' })
  },
  component: HaloPage,
})

interface HaloState {
  threatScore: number
  status: 'SECURE' | 'ELEVATED' | 'CRITICAL'
  totalEvents: number
  honeypotTriggers: number
  anomalyCount: number
  bruteForceCount: number
  events: Array<{ event_type: string; severity: string; created_at: string; metadata: any }>
}

function statusColor(s: HaloState['status']) {
  if (s === 'CRITICAL') return 'text-red-600'
  if (s === 'ELEVATED') return 'text-amber-500'
  return 'text-emerald-600'
}
function gaugeStroke(s: HaloState['status']) {
  if (s === 'CRITICAL') return '#dc2626'
  if (s === 'ELEVATED') return '#f59e0b'
  return '#10b981'
}

function ThreatGauge({ score, status }: { score: number; status: HaloState['status'] }) {
  // Arc gauge using SVG (180deg)
  const r = 80
  const c = Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const dash = c * pct
  return (
    <div className="relative w-56 h-32 mx-auto">
      <svg viewBox="0 0 200 110" className="w-full h-full">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={gaugeStroke(status)}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: 'stroke-dasharray 600ms ease, stroke 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="text-4xl font-bold">{score}</div>
        <div className={cn('text-xs font-semibold tracking-wider', statusColor(status))}>{status}</div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, accent }: {
  icon: any; label: string; value: number; accent?: string
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className={cn('text-2xl font-bold mt-1', accent)}>{value}</p>
        </div>
        <Icon className={cn('size-5 text-muted-foreground', value > 0 && accent)} />
      </div>
    </Card>
  )
}

function HaloPage() {
  const { isAdmin } = useAuth()
  const [state, setState] = useState<HaloState | null>(null)
  const [timeline, setTimeline] = useState<Array<{ t: number; score: number }>>([])
  const startedAt = useRef(Date.now())

  const refresh = useCallback(async () => {
    try {
      const data = await fetchHaloStatus()
      setState(data)
      setTimeline(prev => {
        const next = [...prev, { t: Math.floor((Date.now() - startedAt.current) / 1000), score: data.threatScore }]
        return next.slice(-30)
      })
    } catch (e: any) {
      console.warn(e)
    }
  }, [])

  // Initial + 3s polling
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  // Realtime push refresh whenever a new event lands
  useEffect(() => {
    const ch = supabase.channel('halo_events_live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'halo_events' },
        () => refresh(),
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'halo_events' },
        () => refresh(),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [refresh])

  const onHoneypot = async () => {
    await triggerHoneypot()
    toast.warning('Honeypot triggered — alert silently raised')
  }
  const onClear = async () => {
    try {
      await clearHaloEvents()
      toast.success('Event log cleared')
      setTimeline([])
    } catch {
      toast.error('Admin role required to clear log')
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="size-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">HALO Security</h1>
          <p className="text-sm text-muted-foreground">Hardware-Anchored Layer for Operational Security</p>
        </div>
      </div>

      <Tabs defaultValue="monitor">
        <TabsList>
          <TabsTrigger value="monitor">Live monitor</TabsTrigger>
          <TabsTrigger value="architecture">Architecture</TabsTrigger>
          <TabsTrigger value="forensics">Forensics</TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-6 lg:col-span-1">
              <p className="text-sm font-semibold mb-2">Threat score</p>
              <ThreatGauge score={state?.threatScore ?? 0} status={state?.status ?? 'SECURE'} />
              <p className="text-xs text-muted-foreground text-center mt-2">
                Updates in real time from sensor events
              </p>
            </Card>

            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              <StatCard icon={Activity} label="Events logged" value={state?.totalEvents ?? 0} />
              <StatCard icon={Eye} label="Honeypot hits" value={state?.honeypotTriggers ?? 0}
                        accent={(state?.honeypotTriggers ?? 0) > 0 ? 'text-red-600' : ''} />
              <StatCard icon={AlertTriangle} label="Anomalies" value={state?.anomalyCount ?? 0}
                        accent={(state?.anomalyCount ?? 0) > 0 ? 'text-amber-600' : ''} />
              <StatCard icon={Hammer} label="Brute-force" value={state?.bruteForceCount ?? 0}
                        accent={(state?.bruteForceCount ?? 0) > 0 ? 'text-red-600' : ''} />
            </div>
          </div>

          <Card className="p-6">
            <p className="text-sm font-semibold mb-3">Threat score (last ~90s)</p>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={timeline} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <XAxis dataKey="t" tickFormatter={(v) => `${v}s`} stroke="#94a3b8" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                  <Tooltip formatter={(v: number) => [v, 'Score']} labelFormatter={(l) => `t = ${l}s`} />
                  <ReferenceArea y1={0} y2={30} fill="#10b981" fillOpacity={0.05} />
                  <ReferenceArea y1={30} y2={70} fill="#f59e0b" fillOpacity={0.05} />
                  <ReferenceArea y1={70} y2={100} fill="#dc2626" fillOpacity={0.07} />
                  <Line type="monotone" dataKey="score" stroke="#1e3a8a" strokeWidth={2.5}
                        dot={false} isAnimationActive />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">Live event feed</p>
              <Badge variant="outline" className="text-xs">Realtime</Badge>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto">
              {(state?.events ?? []).map((e, i) => (
                <div key={i} className="py-2.5 flex items-center gap-3">
                  <Badge className={cn('uppercase text-[10px] tracking-wider', severityColor(e.severity))}>
                    {e.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{e.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {Object.entries(e.metadata ?? {}).slice(0, 3).map(([k, v]) =>
                        `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
                      ).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(e.created_at)}</span>
                </div>
              ))}
              {(state?.events ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No events yet</p>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <p className="text-sm font-semibold mb-1">Demo controls</p>
            <p className="text-xs text-muted-foreground mb-4">
              These actions exist for demonstration only. Critical events email all admins.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={onHoneypot} variant="outline">
                <Zap className="size-4 mr-1" /> Simulate honeypot trigger
              </Button>
              <Button onClick={onClear} variant="outline" disabled={!isAdmin}
                      title={isAdmin ? '' : 'Admin role required'}>
                <Trash2 className="size-4 mr-1" /> Clear event log {isAdmin ? '' : '(admin only)'}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="forensics" className="mt-4">
          <ForensicsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
