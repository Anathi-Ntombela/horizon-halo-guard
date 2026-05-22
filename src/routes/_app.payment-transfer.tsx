import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { logHaloEvent } from '@/lib/halo'
import { dwollaTransfer } from '@/lib/banking.functions'

const Schema = z.object({
  source_bank_id: z.string().uuid(),
  recipient_email: z.string().email(),
  recipient_shareable: z.string().min(6).max(60),
  amount: z.coerce.number().positive().max(1_000_000),
  note: z.string().max(280).optional(),
})
type FormValues = z.infer<typeof Schema>

export const Route = createFileRoute('/_app/payment-transfer')({
  component: TransferPage,
})

function TransferPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const transferFn = useServerFn(dwollaTransfer)
  const [loading, setLoading] = useState(false)
  const banks = useQuery({
    queryKey: ['banks'],
    queryFn: async () => (await supabase.from('banks').select('id,name,mask,current_balance,funding_source_url').order('created_at')).data ?? [],
  })
  const { register, handleSubmit, formState, setValue, watch } = useForm<FormValues>({ resolver: zodResolver(Schema) })

  const onSubmit = async (v: FormValues) => {
    setLoading(true)
    try {
      await transferFn({ data: v })
      if (v.amount > 10000) {
        await logHaloEvent('ANOMALOUS_TRANSFER', { amount: v.amount, source: v.source_bank_id, recipient: v.recipient_email })
      }
      qc.invalidateQueries({ queryKey: ['recent-tx'] })
      qc.invalidateQueries({ queryKey: ['tx'] })
      qc.invalidateQueries({ queryKey: ['banks'] })
      toast.success('Transfer initiated via Dwolla')
      nav({ to: '/' })
    } catch (e: any) {
      toast.error(e.message ?? 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const e = formState.errors
  const src = watch('source_bank_id')
  const achBanks = (banks.data ?? []).filter((b: any) => b.funding_source_url)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Transfer</h1>
        <p className="text-sm text-muted-foreground">
          Send funds via Dwolla ACH. Recipient must be another HORIZON user — use their bank's Share ID.
          Transfers over $10,000 trigger a HALO anomaly alert.
        </p>
      </div>
      <Card className="p-6">
        {achBanks.length === 0 && (
          <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
            None of your banks are ACH-linked yet. Go to <strong>My Banks</strong> → Connect bank to link via Plaid.
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Source bank (must be ACH-linked)</Label>
            <Select value={src ?? ''} onValueChange={(v) => setValue('source_bank_id', v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Select a bank" /></SelectTrigger>
              <SelectContent>
                {achBanks.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name} •••• {b.mask}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {e.source_bank_id && <p className="text-xs text-destructive mt-1">{e.source_bank_id.message}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Recipient email</Label>
              <Input type="email" {...register('recipient_email')} />
              {e.recipient_email && <p className="text-xs text-destructive mt-1">{e.recipient_email.message}</p>}
            </div>
            <div>
              <Label>Recipient bank Share ID</Label>
              <Input {...register('recipient_shareable')} placeholder="e.g. a1b2c3d4e5f6" />
              {e.recipient_shareable && <p className="text-xs text-destructive mt-1">{e.recipient_shareable.message}</p>}
            </div>
          </div>
          <div>
            <Label>Amount (USD)</Label>
            <Input type="number" step="0.01" {...register('amount')} />
            {e.amount && <p className="text-xs text-destructive mt-1">{e.amount.message}</p>}
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Textarea rows={3} {...register('note')} />
          </div>
          <Button type="submit" className="w-full" disabled={loading || achBanks.length === 0}>
            {loading ? 'Sending…' : 'Send transfer via Dwolla'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
