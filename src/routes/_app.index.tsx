import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Landmark, TrendingUp, ArrowRight } from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, categoryColor } from '@/lib/format'
import { useAuth } from '@/lib/auth-context'

export const Route = createFileRoute('/_app/')({
  component: HomePage,
})

const PIE_COLORS = ['#1e3a8a', '#3b82f6', '#60a5fa', '#a78bfa', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']

function HomePage() {
  const { user } = useAuth()
  const profileQ = useQuery({
    queryKey: ['profile-me', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('first_name,last_name').eq('id', user!.id).maybeSingle()
      if (error) throw error
      return data
    },
  })
  const banksQ = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('banks').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })
  const txQ = useQuery({
    queryKey: ['recent-tx'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions')
        .select('*').order('transaction_date', { ascending: false }).limit(5)
      if (error) throw error
      return data
    },
  })
  const catQ = useQuery({
    queryKey: ['cat-spend'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions')
        .select('category, amount, type').eq('type', 'debit')
      if (error) throw error
      const map = new Map<string, number>()
      for (const r of data) map.set(r.category, (map.get(r.category) ?? 0) + Number(r.amount))
      return [...map.entries()].map(([name, value]) => ({ name, value }))
    },
  })

  const totalBalance = (banksQ.data ?? []).reduce((s, b) => s + Number(b.current_balance), 0)
  const firstName = profileQ.data?.first_name?.trim()
    || user?.email?.split('@')[0]
    || 'there'

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Welcome Back, {firstName}</h1>
        <p className="text-muted-foreground text-sm">Here's a snapshot of your finances.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 bg-gradient-to-br from-primary to-blue-700 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/75">Total balance</p>
              <p className="text-4xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
              <p className="text-xs text-white/75 mt-2">Across {banksQ.data?.length ?? 0} connected accounts</p>
            </div>
            <TrendingUp className="size-10 text-white/40" />
          </div>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Spending by category</p>
          <div className="h-40 mt-2">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={catQ.data ?? []} dataKey="value" nameKey="name" innerRadius={36} outerRadius={64}>
                  {(catQ.data ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent transactions</h3>
            <Link to="/transaction-history" className="text-xs text-primary inline-flex items-center gap-1">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y">
            {(txQ.data ?? []).map(t => (
              <div key={t.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{t.name}</p>
                  <Badge variant="secondary" className={categoryColor(t.category)}>{t.category}</Badge>
                </div>
                <p className={t.type === 'credit' ? 'text-emerald-600 font-semibold' : 'font-semibold'}>
                  {t.type === 'credit' ? '+' : '-'}{formatCurrency(Number(t.amount))}
                </p>
              </div>
            ))}
            {(txQ.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No transactions yet.</p>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">Your banks</h3>
          <div className="space-y-3">
            {(banksQ.data ?? []).map(b => (
              <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Landmark className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{b.name}</p>
                  <p className="text-xs text-muted-foreground">•••• {b.mask}</p>
                </div>
                <p className="font-semibold text-sm">{formatCurrency(Number(b.current_balance))}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
