import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Landmark, Plus, Loader2, Flag } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatCurrency, SA_BANKS } from '@/lib/format'
import { plaidCreateLinkToken, plaidExchange, addManualBank } from '@/lib/banking.functions'

export const Route = createFileRoute('/_app/my-banks')({
  component: MyBanksPage,
})

const ManualSchema = z.object({
  name: z.string().min(2),
  official_name: z.string().min(2),
  mask: z.string().regex(/^\d{4}$/, 'Enter the last 4 digits'),
  subtype: z.enum(['checking', 'savings', 'credit']),
  currency: z.enum(['USD', 'ZAR']),
  opening_balance: z.coerce.number().min(0),
})
type ManualValues = z.infer<typeof ManualSchema>

function MyBanksPage() {
  const qc = useQueryClient()
  const createToken = useServerFn(plaidCreateLinkToken)
  const exchange = useServerFn(plaidExchange)
  const addBank = useServerFn(addManualBank)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saOpen, setSaOpen] = useState(false)

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

  const form = useForm<ManualValues>({
    resolver: zodResolver(ManualSchema),
    defaultValues: { subtype: 'checking', currency: 'ZAR', opening_balance: 0 },
  })

  const submitManual = async (v: ManualValues) => {
    try {
      await addBank({ data: v })
      toast.success(`${v.name} added`)
      qc.invalidateQueries({ queryKey: ['banks'] })
      setSaOpen(false)
      form.reset({ subtype: 'checking', currency: 'ZAR', opening_balance: 0 })
    } catch (e: any) {
      toast.error(e.message ?? 'Could not add bank')
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Banks</h1>
          <p className="text-sm text-muted-foreground">
            Connect US accounts via Plaid, or add a South African bank manually.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={saOpen} onOpenChange={setSaOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Flag className="size-4 mr-1" /> Add SA bank
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a South African bank</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(submitManual)} className="space-y-3">
                <div>
                  <Label>Bank</Label>
                  <Select
                    value={form.watch('name') ?? ''}
                    onValueChange={(v) => {
                      form.setValue('name', v, { shouldValidate: true })
                      form.setValue('official_name', v, { shouldValidate: true })
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose your bank" /></SelectTrigger>
                    <SelectContent>
                      {SA_BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive mt-1">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Account type</Label>
                    <Select
                      value={form.watch('subtype')}
                      onValueChange={(v) => form.setValue('subtype', v as ManualValues['subtype'])}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="checking">Cheque (Current)</SelectItem>
                        <SelectItem value="savings">Savings</SelectItem>
                        <SelectItem value="credit">Credit card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select
                      value={form.watch('currency')}
                      onValueChange={(v) => form.setValue('currency', v as 'USD' | 'ZAR')}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZAR">ZAR (R)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Last 4 digits</Label>
                    <Input {...form.register('mask')} maxLength={4} placeholder="1234" />
                    {form.formState.errors.mask && (
                      <p className="text-xs text-destructive mt-1">{form.formState.errors.mask.message}</p>
                    )}
                  </div>
                  <div>
                    <Label>Opening balance</Label>
                    <Input type="number" step="0.01" {...form.register('opening_balance')} />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Adding…' : 'Add bank'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Button onClick={() => open()} disabled={!ready || !linkToken || busy}>
            {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Plus className="size-4 mr-1" />}
            Connect via Plaid
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(q.data ?? []).map((b: any) => (
          <Card key={b.id} className="p-5 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Landmark className="size-6 text-primary" />
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs px-2 py-1 bg-slate-100 rounded">{b.subtype}</span>
                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-mono">
                  {b.currency ?? 'USD'}
                </span>
              </div>
            </div>
            <h3 className="font-semibold mt-3">{b.name}</h3>
            <p className="text-xs text-muted-foreground">{b.official_name}</p>
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground">Current balance</p>
              <p className="text-2xl font-bold">{formatCurrency(Number(b.current_balance), b.currency ?? 'USD')}</p>
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
          South African banks (Standard Bank, FNB, Absa, Nedbank, Capitec, etc.) can be added
          manually via <strong>Add SA bank</strong> — they support internal HORIZON transfers in ZAR.
        </p>
      </Card>
    </div>
  )
}
