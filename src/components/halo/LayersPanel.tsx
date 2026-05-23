import { useEffect, useState } from 'react'
import {
  Cpu, Thermometer, Zap, Wind, ShieldAlert, Server, FileLock2, KeyRound,
  Brain, Activity, GitBranch, Lock, Radio, Building2, Landmark, Factory,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { logHaloEvent, type HaloEventType } from '@/lib/halo'
import { toast } from 'sonner'

// ────────── Live simulated sensor readings (Layer 1) ──────────
function useSensorTelemetry() {
  const [t, setT] = useState({ thermal: 42, power: 118, tamper: 0, env: 21 })
  useEffect(() => {
    const id = setInterval(() => {
      setT((p) => ({
        thermal: clamp(p.thermal + jitter(1.2), 30, 95),
        power:   clamp(p.power + jitter(3), 90, 240),
        tamper:  Math.max(0, p.tamper - 1),
        env:     clamp(p.env + jitter(0.3), 18, 28),
      }))
    }, 1500)
    return () => clearInterval(id)
  }, [])
  return [t, setT] as const
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const jitter = (m: number) => (Math.random() - 0.5) * 2 * m

async function fire(type: HaloEventType, metadata: Record<string, unknown>, sev: 'low'|'medium'|'high'|'critical') {
  await logHaloEvent(type, metadata, sev)
}

// ────────── Layer 1: Hardware sensor array ──────────
function SensorArray() {
  const [t, setT] = useSensorTelemetry()
  const sensors = [
    { key: 'thermal', label: 'Thermal',     icon: Thermometer, value: t.thermal, unit: '°C',
      hint: 'Abnormal heat = exfiltration / ransomware', warn: t.thermal > 75, max: 95 },
    { key: 'tamper',  label: 'Tamper',      icon: ShieldAlert, value: t.tamper,  unit: '',
      hint: 'Magnetic & pressure on chassis', warn: t.tamper > 0, max: 10 },
    { key: 'power',   label: 'Power draw',  icon: Zap,         value: t.power,   unit: 'W',
      hint: 'Spikes flag hidden process activity', warn: t.power > 200, max: 240 },
    { key: 'env',     label: 'Environment', icon: Wind,        value: t.env,     unit: '°C',
      hint: 'Cooling, airflow, door/motion', warn: t.env > 26, max: 30 },
  ]
  return (
    <LayerCard
      tone="cyan"
      icon={Cpu}
      title="Layer 1 — Hardware sensor array"
      subtitle="Edge processors per node · operates offline if network is severed"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {sensors.map((s) => (
          <div key={s.key} className={cn('rounded-lg border p-3 bg-card', s.warn && 'border-red-500/60')}>
            <div className="flex items-center gap-2">
              <s.icon className={cn('size-4', s.warn ? 'text-red-500' : 'text-cyan-600')} />
              <span className="text-sm font-medium">{s.label}</span>
              <span className="ml-auto text-sm tabular-nums font-semibold">
                {s.value.toFixed(s.key === 'env' || s.key === 'thermal' ? 1 : 0)}{s.unit}
              </span>
            </div>
            <Progress value={(s.value / s.max) * 100} className="h-1.5 mt-2" />
            <p className="text-[11px] text-muted-foreground mt-1.5">{s.hint}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button size="sm" variant="outline" onClick={async () => {
          setT((p) => ({ ...p, thermal: 88 }))
          await fire('SENSOR_THERMAL_SPIKE', { celsius: 88, node: 'rack-A3' }, 'high')
          toast.warning('Thermal spike logged — rack-A3')
        }}><Thermometer className="size-3.5 mr-1" /> Simulate thermal spike</Button>
        <Button size="sm" variant="outline" onClick={async () => {
          setT((p) => ({ ...p, tamper: 10 }))
          await fire('SENSOR_TAMPER', { node: 'chassis-2', method: 'magnetic' }, 'critical')
          toast.error('Chassis tamper detected')
        }}><ShieldAlert className="size-3.5 mr-1" /> Trigger tamper</Button>
        <Button size="sm" variant="outline" onClick={async () => {
          setT((p) => ({ ...p, power: 232 }))
          await fire('SENSOR_POWER_SPIKE', { watts: 232 }, 'medium')
          toast.warning('Power draw anomaly logged')
        }}><Zap className="size-3.5 mr-1" /> Power spike</Button>
      </div>
    </LayerCard>
  )
}

// ────────── Layer 2: Honeypot network ──────────
function HoneypotNetwork() {
  const lures = [
    { icon: KeyRound,  label: 'Admin / service credentials', count: 14, type: 'HONEYPOT_FAKE_CRED'    as HaloEventType },
    { icon: Server,    label: 'Decoy internal servers',      count: 6,  type: 'HONEYPOT_DECOY_SERVER' as HaloEventType },
    { icon: FileLock2, label: 'High-value data lures',        count: 22, type: 'HONEYPOT_FAKE_FILE'   as HaloEventType },
  ]
  return (
    <LayerCard
      tone="amber"
      icon={Radio}
      title="Layer 2 — Honeypot network"
      subtitle="Decoy assets seeded across environment · any interaction = confirmed compromise"
    >
      <div className="space-y-2">
        {lures.map((l) => (
          <div key={l.label} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
            <l.icon className="size-4 text-amber-600" />
            <span className="text-sm font-medium flex-1">{l.label}</span>
            <Badge variant="outline" className="tabular-nums">{l.count} seeded</Badge>
            <Button size="sm" variant="outline" onClick={async () => {
              await fire(l.type, { asset: l.label }, 'critical')
              toast.error(`Honeypot interaction: ${l.label}`)
            }}>Simulate touch</Button>
          </div>
        ))}
      </div>
    </LayerCard>
  )
}

// ────────── Layer 3: AI analysis engine ──────────
function AIEngine() {
  const [score, setScore] = useState(12)
  useEffect(() => {
    const id = setInterval(() => setScore((s) => clamp(s + jitter(2), 5, 30)), 2000)
    return () => clearInterval(id)
  }, [])
  const modules = [
    { icon: Activity,  label: 'Anomaly detection',  desc: 'Behavioural baseline per asset' },
    { icon: GitBranch, label: 'Predictive modelling', desc: 'Weak signal clustering · aggregate risk' },
    { icon: Lock,      label: 'Auto response',      desc: 'Segment · lock · snapshot · alert' },
  ]
  return (
    <LayerCard
      tone="violet"
      icon={Brain}
      title="Layer 3 — AI analysis engine"
      subtitle="Cross-layer signal correlation · confidence scoring · automated triggers"
    >
      <div className="rounded-lg border p-3 bg-card mb-3 flex items-center gap-3">
        <Brain className="size-5 text-violet-600" />
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Aggregate risk score (rolling)</p>
          <Progress value={score} className="h-2 mt-1" />
        </div>
        <span className="text-2xl font-bold tabular-nums">{Math.round(score)}</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        {modules.map((m) => (
          <div key={m.label} className="rounded-lg border p-3 bg-card">
            <m.icon className="size-4 text-violet-600 mb-1.5" />
            <p className="text-sm font-medium">{m.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" variant="outline" onClick={async () => {
          await fire('AI_ANOMALY_CLUSTER', { signals: 7, confidence: 0.82 }, 'high')
          toast.warning('Anomaly cluster surfaced')
        }}>Cluster weak signals</Button>
        <Button size="sm" variant="outline" onClick={async () => {
          await fire('AI_AUTO_RESPONSE', { action: 'segment+snapshot', target: 'rack-A3' }, 'critical')
          toast.success('Auto-response: segment + snapshot dispatched')
        }}>Trigger auto-response</Button>
      </div>
    </LayerCard>
  )
}

// ────────── Layer 4: Command platform integrations ──────────
function CommandPlatform() {
  const integrations = [
    { label: 'SIEM / SOC',  desc: 'Feed export', icon: Radio },
    { label: 'POPIA / SARB', desc: 'Auto-notify regulator', icon: Landmark },
    { label: 'SAPS / Reg',  desc: 'Cybercrimes Act dispatch', icon: ShieldAlert },
  ]
  const targets = [
    { icon: Landmark, label: 'Banks & finance', desc: 'Server room · admin systems' },
    { icon: Building2, label: 'Government / SOEs', desc: 'Branch endpoints' },
    { icon: Factory,  label: 'Any enterprise',   desc: 'Modular deployment' },
  ]
  return (
    <LayerCard
      tone="emerald"
      icon={ShieldAlert}
      title="Layer 4 — Command platform"
      subtitle="Unified security dashboard · on-premise + optional cloud sync"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Integrations</p>
      <div className="grid sm:grid-cols-3 gap-2 mb-4">
        {integrations.map((i) => (
          <div key={i.label} className="rounded-lg border p-3 bg-card">
            <i.icon className="size-4 text-emerald-600 mb-1.5" />
            <p className="text-sm font-medium">{i.label}</p>
            <p className="text-[11px] text-muted-foreground">{i.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deployment targets</p>
      <div className="grid sm:grid-cols-3 gap-2">
        {targets.map((t) => (
          <div key={t.label} className="rounded-lg border p-3 bg-card">
            <t.icon className="size-4 text-emerald-600 mb-1.5" />
            <p className="text-sm font-medium">{t.label}</p>
            <p className="text-[11px] text-muted-foreground">{t.desc}</p>
          </div>
        ))}
      </div>
    </LayerCard>
  )
}

// ────────── Shared layer card shell ──────────
const TONE: Record<string, string> = {
  cyan:    'from-cyan-500/10 to-transparent border-cyan-500/30',
  amber:   'from-amber-500/10 to-transparent border-amber-500/30',
  violet:  'from-violet-500/10 to-transparent border-violet-500/30',
  emerald: 'from-emerald-500/10 to-transparent border-emerald-500/30',
}
function LayerCard({ tone, icon: Icon, title, subtitle, children }: {
  tone: keyof typeof TONE; icon: any; title: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <Card className={cn('p-5 border bg-gradient-to-br', TONE[tone])}>
      <div className="flex items-start gap-3 mb-4">
        <div className="rounded-lg bg-background/60 border p-2"><Icon className="size-5" /></div>
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

export function LayersPanel() {
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-primary/5 border-primary/20">
        <p className="text-sm">
          HALO is a four-layer defensive architecture. Signals flow upward — hardware sensors feed honeypot
          context into the AI engine, which correlates evidence and dispatches actions through the command platform.
        </p>
      </Card>
      <CommandPlatform />
      <AIEngine />
      <HoneypotNetwork />
      <SensorArray />
    </div>
  )
}
