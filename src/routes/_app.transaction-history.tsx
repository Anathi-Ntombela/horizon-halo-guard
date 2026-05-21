import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, categoryColor } from '@/lib/format'

export const Route = createFileRoute('/_app/transaction-history')({
  component: TxHistoryPage,
})

const PAGE_SIZE = 10

function TxHistoryPage() {
  const banks = useQuery({
    queryKey: ['banks'],
    queryFn: async () => (await supabase.from('banks').select('id,name,mask,current_balance').order('created_at')).data ?? [],
  })
  const [bankId, setBankId] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [page, setPage] = useState(0)

  const txs = useQuery({
    queryKey: ['tx', bankId],
    queryFn: async () => {
      let q = supabase.from('transactions').select('*').order('transaction_date', { ascending: false })
      if (bankId !== 'all') q = q.eq('bank_id', bankId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const filtered = useMemo(
    () => (txs.data ?? []).filter(t => category === 'all' ? true : t.category === category),
    [txs.data, category],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const categories = [...new Set((txs.data ?? []).map(t => t.category))]
  const selectedBank = banks.data?.find(b => b.id === bankId)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transaction History</h1>
        <p className="text-sm text-muted-foreground">Browse your transactions by bank and category.</p>
      </div>

      {selectedBank && (
        <Card className="p-5 bg-primary text-white">
          <p className="text-sm text-white/75">{selectedBank.name} •••• {selectedBank.mask}</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(Number(selectedBank.current_balance))}</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Select value={bankId} onValueChange={(v) => { setBankId(v); setPage(0) }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All banks" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All banks</SelectItem>
            {(banks.data ?? []).map(b => (
              <SelectItem key={b.id} value={b.id}>{b.name} •••• {b.mask}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0) }}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={categoryColor(t.category)}>{t.category}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(t.transaction_date).toLocaleDateString()}
                </TableCell>
                <TableCell className={`text-right font-semibold ${t.type === 'credit' ? 'text-emerald-600' : ''}`}>
                  {t.type === 'credit' ? '+' : '-'}{formatCurrency(Number(t.amount))}
                </TableCell>
              </TableRow>
            ))}
            {slice.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No transactions</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="p-3 flex items-center justify-between border-t">
          <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
