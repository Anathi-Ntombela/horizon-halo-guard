import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Microscope, Filter, Download } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { severityColor, relativeTime } from '@/lib/halo'
import { cn } from '@/lib/utils'

type Event = {
  id: string
  event_type: string
  severity: string
  created_at: string
  user_id: string | null
  metadata: Record<string, unknown>
}

export function ForensicsPanel() {
  const [sev, setSev] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const eventsQ = useQuery({
    queryKey: ['halo-forensics'],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from('halo_events')
        .select('id,event_type,severity,created_at,user_id,metadata')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Event[]
    },
  })

  const all = eventsQ.data ?? []
  const types = useMemo(() => Array.from(new Set(all.map(e => e.event_type))).sort(), [all])

  const filtered = useMemo(() => all.filter(e => {
    if (sev !== 'all' && e.severity !== sev) return false
    if (type !== 'all' && e.event_type !== type) return false
    if (search) {
      const blob = (e.event_type + ' ' + JSON.stringify(e.metadata)).toLowerCase()
      if (!blob.includes(search.toLowerCase())) return false
    }
    return true
  }), [all, sev, type, search])

  const byType = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filtered) map.set(e.event_type, (map.get(e.event_type) ?? 0) + 1)
    return [...map.entries()].map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  const byHour = useMemo(() => {
    const buckets = new Array(24).fill(0).map((_, h) => ({ hour: `${h}h`, count: 0 }))
    for (const e of filtered) buckets[new Date(e.created_at).getHours()].count++
    return buckets
  }, [filtered])

  // Tamper-evident export: payload + SHA-256 of the canonical events JSON.
  const downloadJSON = async () => {
    try {
      const exportPayload = JSON.stringify(filtered)
      const msgBuffer = new TextEncoder().encode(exportPayload)
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const finalExport = {
        exported_at: new Date().toISOString(),
        event_count: filtered.length,
        export_hash: hashHex,
        events: filtered,
      }

      const blob = new Blob([JSON.stringify(finalExport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'halo_forensics_export.json'
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Export verified — SHA-256: ${hashHex.slice(0, 12)}…`)
    } catch (err) {
      console.error(err)
      toast.error('Export failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Microscope className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Threat forensics</h2>
        <Badge variant="outline" className="ml-auto">{filtered.length} / {all.length} events</Badge>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Filter className="size-3.5" /> Filters</div>
        <div>
          <label className="block text-[10px] uppercase text-muted-foreground mb-1">Severity</label>
          <Select value={sev} onValueChange={setSev}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-[10px] uppercase text-muted-foreground mb-1">Event type</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] uppercase text-muted-foreground mb-1">Search metadata</label>
          <Input placeholder="email, ip, amount…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={downloadJSON}>
          <Download className="size-3.5 mr-1" /> Export (SHA-256)
        </Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-sm font-semibold mb-2">Event distribution by type</p>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={byType} layout="vertical" margin={{ left: 30, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#1e3a8a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-semibold mb-2">Activity by hour of day</p>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={byHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="divide-y max-h-[420px] overflow-y-auto">
          {filtered.map(e => (
            <div key={e.id}>
              <button
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50"
              >
                <Badge className={cn('uppercase text-[10px] tracking-wider', severityColor(e.severity))}>
                  {e.severity}
                </Badge>
                <span className="text-sm font-medium flex-1 truncate">{e.event_type.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted-foreground font-mono truncate max-w-[40%]">
                  {Object.entries(e.metadata ?? {}).slice(0, 2).map(([k, v]) =>
                    `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
                  ).join(' · ') || '—'}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(e.created_at)}</span>
              </button>
              {openId === e.id && (
                <div className="px-4 pb-3 bg-slate-50 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                    <div><span className="text-muted-foreground">Event ID:</span> <span className="font-mono">{e.id}</span></div>
                    <div><span className="text-muted-foreground">Timestamp:</span> {new Date(e.created_at).toLocaleString()}</div>
                    <div><span className="text-muted-foreground">User ID:</span> <span className="font-mono">{e.user_id ?? '—'}</span></div>
                  </div>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded overflow-auto">
{JSON.stringify(e.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No matching events</p>
          )}
        </div>
      </Card>
    </div>
  )
}
