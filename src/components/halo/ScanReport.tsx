import { useQuery } from '@tanstack/react-query'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, Tooltip } from 'recharts'
import { ShieldCheck } from 'lucide-react'

import { Card } from '@/components/ui/card'

type ScanReport = {
  scan_date: string
  target: string
  alerts: Array<{ risk: string; name: string; status: string }>
  resolved_count: number
  unresolved_count: number
  risk_score_before: number
  risk_score_after: number
}

export function ScanReportCard() {
  const q = useQuery({
    queryKey: ['security-scan-report'],
    staleTime: Infinity, // do not refetch on poll
    queryFn: async () => {
      const res = await fetch('/api/security/scan-report')
      if (!res.ok) throw new Error('scan report unavailable')
      return (await res.json()) as ScanReport
    },
  })

  const data = q.data
  const chart = data
    ? [
        { name: 'Before HALO', score: data.risk_score_before, fill: '#dc2626' },
        { name: 'After HALO',  score: data.risk_score_after,  fill: '#10b981' },
      ]
    : []

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="size-5 text-emerald-600" />
        <h2 className="text-sm font-semibold">Security Scan Summary</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">OWASP ZAP Baseline Assessment</p>

      {q.isLoading && <p className="text-sm text-muted-foreground">Loading scan…</p>}
      {q.isError && <p className="text-sm text-destructive">Could not load scan report.</p>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="flex items-center justify-around">
            <div className="text-center">
              <div className="text-5xl font-bold text-red-600">{data.risk_score_before}</div>
              <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">Before HALO</div>
            </div>
            <div className="text-3xl text-slate-300">→</div>
            <div className="text-center">
              <div className="text-5xl font-bold text-emerald-600">{data.risk_score_after}</div>
              <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">After HALO</div>
            </div>
          </div>
          <div className="h-32">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                <YAxis fontSize={11} stroke="#94a3b8" domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                  {chart.map((c, i) => <Cell key={i} fill={c.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center justify-between text-xs text-muted-foreground">
            <span>{data.resolved_count} alerts resolved · {data.unresolved_count} outstanding</span>
            <span>Last scan: {new Date(data.scan_date).toLocaleString()}</span>
          </div>
        </div>
      )}
    </Card>
  )
}
