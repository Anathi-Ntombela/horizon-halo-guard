import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { Landmark, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import { plaidCreateLinkToken, plaidExchange } from '@/lib/banking.functions'

export const Route = createFileRoute('/_app/my-banks')({
  component: MyBanksPage,
})

function MyBanksPage() {
  const qc = useQueryClient()
  const createToken = useServerFn(plaidCreateLinkToken)
  const exchange = useServerFn(plaidExchange)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const q = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('banks').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    createToken().then((r) => setLinkToken(r.link_token)).catch((e) => console.error('link_token', e))
  }, [createToken])

  const onSuccess = useCallback(async (public_token: string) => {
    setBusy(true)
    try {
      const r = await exchange({ data: { public_token } })
      toast.success(`Connected ${r.added} account(s)`)
      qc.invalidateQueries({ queryKey: ['banks'] })
      const r2 = await createToken()
      setLinkToken(r2.link_token)
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to link bank')
    } finally {
      setBusy(false)
    }
  }, [exchange, qc, createToken])

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess })

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Banks</h1>
          <p className="text-sm text-muted-foreground">All accounts connected to HORIZON via Plaid sandbox.</p>
        </div>
        <Button onClick={() => open()} disabled={!ready || !linkToken || busy}>
          {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Plus className="size-4 mr-1" />}
          Connect bank
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(q.data ?? []).map(b => (
          <Card key={b.id} className="p-5 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Landmark className="size-6 text-primary" />
              </div>
              <span className="text-xs px-2 py-1 bg-slate-100 rounded">{b.subtype}</span>
            </div>
            <h3 className="font-semibold mt-3">{b.name}</h3>
            <p className="text-xs text-muted-foreground">{b.official_name}</p>
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">Current balance</p>
              <p className="text-2xl font-bold">{formatCurrency(Number(b.current_balance))}</p>
              <p className="text-xs text-muted-foreground mt-1">Account •••• {b.mask}</p>
              <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                Share ID: {b.shareable_id}
                {b.funding_source_url ? ' · ACH ✓' : ' · ACH —'}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 bg-amber-50 border-amber-200">
        <p className="text-xs text-amber-900">
          <strong>Plaid sandbox credentials:</strong> use <code>user_good</code> / <code>pass_good</code> when prompted.
          Connected accounts get a Dwolla funding source for real ACH transfers between HORIZON users.
        </p>
      </Card>
    </div>
  )
}
