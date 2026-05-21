import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useAuth } from '@/lib/auth-context'

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
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const banks = useQuery({
    queryKey: ['banks'],
    queryFn: async () => (await supabase.from('banks').select('id,name,mask,current_balance').order('created_at')).data ?? [],
  })
  const { register, handleSubmit, formState, setValue, watch } = useForm<FormValues>({ resolver: zodResolver(Schema) })

  const onSubmit = async (v: FormValues) => {
    if (!user) return
    setLoading(true)
    const { error } = await supabase.from('transactions').insert({
      user_id: user.id,
      bank_id: v.source_bank_id,
      name: `Transfer to ${v.recipient_email}`,
      amount: v.amount,
      category: 'Transfer',
      type: 'debit',
      note: v.note ?? null,
    })
    if (!error && v.amount > 10000) {
      await logHaloEvent('ANOMALOUS_TRANSFER', { amount: v.amount, source: v.source_bank_id, recipient: v.recipient_email })
    }
    setLoading(false)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['recent-tx'] })
    qc.invalidateQueries({ queryKey: ['tx'] })
    toast.success('Transfer recorded')
    nav({ to: '/' })
  }

  const e = formState.errors
  const src = watch('source_bank_id')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Transfer</h1>
        <p className="text-sm text-muted-foreground">
          Send funds. Transfers over $10,000 trigger a HALO anomaly alert.
        </p>
      </div>
      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Source bank</Label>
            <Select value={src ?? ''} onValueChange={(v) => setValue('source_bank_id', v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Select a bank" /></SelectTrigger>
              <SelectContent>
                {(banks.data ?? []).map(b => (
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
              <Label>Recipient shareable ID</Label>
              <Input {...register('recipient_shareable')} />
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send transfer'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
