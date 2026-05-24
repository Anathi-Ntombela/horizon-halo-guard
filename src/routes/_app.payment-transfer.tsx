import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { logHaloEvent } from '@/lib/halo'
import { dwollaTransfer, internalTransfer, reportTransferCancelled } from '@/lib/banking.functions'
import { formatCurrency } from '@/lib/format'

const Schema = z.object({
  source_bank_id: z.string().uuid('Pick a source bank'),
  recipient_email: z.string().email(),
  recipient_shareable: z.string().min(6).max(60),
  amount: z.coerce.number().positive().max(1_000_000),
  note: z.string().max(280).optional(),
})
type FormValues = z.infer<typeof Schema>

type Warning = {
  warning: true
  message: string
  flags: string[]
  proceed_token: string
}

const FLAG_LABELS: Record<string, string> = {
  new_recipient: 'First-ever transfer to this recipient',
  recently_added: 'Recipient bank was added in the last 24 hours',
  unusual_amount: 'Amount is much larger than your recent average',
  vishing_timing: 'Transfer submitted within 45 seconds of opening the page',
}

export const Route = createFileRoute('/_app/payment-transfer')({
  component: TransferPage,
})

function TransferPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const dwolla = useServerFn(dwollaTransfer)
  const internal = useServerFn(internalTransfer)
  const cancelFn = useServerFn(reportTransferCancelled)
  const [mode, setMode] = useState<'internal' | 'ach'>('internal')
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState<{
    payload: Warning
    values: FormValues
    time_on_page: number
  } | null>(null)

  const pageLoadedAt = useRef<number>(Date.now())
  useEffect(() => { pageLoadedAt.current = Date.now() }, [])

  const banks = useQuery({
    queryKey: ['banks'],
    queryFn: async () =>
      (await supabase.from('banks').select('id,name,mask,current_balance,available_balance,funding_source_url').order('created_at')).data ?? [],
  })

  const { register, handleSubmit, formState, setValue, watch, reset } = useForm<FormValues>({
    resolver: zodResolver(Schema),
  })

  const runTransfer = async (
    v: FormValues,
    extras: { proceed_token?: string; time_on_page: number },
  ) => {
    const payload = { ...v, ...extras }
    const fn = mode === 'ach' ? dwolla : internal
    const res: any = await fn({ data: payload })

    // Server returned a friction warning rather than executing.
    if (res?.warning) {
      setWarning({ payload: res as Warning, values: v, time_on_page: extras.time_on_page })
      return false
    }

    if (v.amount > 10_000) {
      await logHaloEvent('ANOMALOUS_TRANSFER', {
        amount: v.amount, mode, source: v.source_bank_id, recipient: v.recipient_email,
      })
    }
    qc.invalidateQueries({ queryKey: ['recent-tx'] })
    qc.invalidateQueries({ queryKey: ['tx'] })
    qc.invalidateQueries({ queryKey: ['banks'] })
    toast.success(mode === 'ach' ? 'Transfer initiated via Dwolla' : 'Internal transfer complete')
    reset()
    nav({ to: '/' })
    return true
  }

  const onSubmit = async (v: FormValues) => {
    setLoading(true)
    try {
      const time_on_page = Math.max(0, Math.floor((Date.now() - pageLoadedAt.current) / 1000))
      await runTransfer(v, { time_on_page })
    } catch (e: any) {
      toast.error(e.message ?? 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const confirmProceed = async () => {
    if (!warning) return
    setLoading(true)
    try {
      await runTransfer(warning.values, {
        proceed_token: warning.payload.proceed_token,
        time_on_page: warning.time_on_page,
      })
      setWarning(null)
    } catch (e: any) {
      toast.error(e.message ?? 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const cancelTransfer = async () => {
    if (!warning) return
    try {
      await cancelFn({ data: {
        proceed_token: warning.payload.proceed_token,
        flags: warning.payload.flags,
      }})
    } catch { /* ignore — best effort */ }
    setWarning(null)
    toast.info('Transfer cancelled. Verifying directly with the recipient is the safest call.')
  }

  const e = formState.errors
  const src = watch('source_bank_id')
  const allBanks = banks.data ?? []
  const achBanks = allBanks.filter((b: any) => b.funding_source_url)
  const sourceList = mode === 'ach' ? achBanks : allBanks
  const selected = sourceList.find((b: any) => b.id === src)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Transfer</h1>
        <p className="text-sm text-muted-foreground">
          Send funds to another HORIZON user using their bank's <strong>Share ID</strong>.
          Transfers over $10,000 trigger a HALO anomaly alert. Unusual recipients prompt a
          friction check before sending.
        </p>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as 'internal' | 'ach')}>
        <TabsList>
          <TabsTrigger value="internal">Internal (any account)</TabsTrigger>
          <TabsTrigger value="ach">ACH via Dwolla</TabsTrigger>
        </TabsList>
        <TabsContent value="internal" className="text-xs text-muted-foreground mt-2">
          Instant on-platform transfer. Works with every connected account, including the demo banks.
        </TabsContent>
        <TabsContent value="ach" className="text-xs text-muted-foreground mt-2">
          Real ACH transfer via Dwolla — requires the source bank to be Plaid-linked.
        </TabsContent>
      </Tabs>

      <Card className="p-6">
        {mode === 'ach' && achBanks.length === 0 && (
          <div className="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
            None of your banks are ACH-linked yet. Go to <strong>My Banks</strong> → Connect bank.
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Source bank</Label>
            <Select value={src ?? ''} onValueChange={(v) => setValue('source_bank_id', v, { shouldValidate: true })}>
              <SelectTrigger><SelectValue placeholder="Select a bank" /></SelectTrigger>
              <SelectContent>
                {sourceList.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} •••• {b.mask} — {formatCurrency(Number(b.available_balance))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground mt-1">
                Available: {formatCurrency(Number(selected.available_balance))}
              </p>
            )}
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

          <Button type="submit" className="w-full"
            disabled={loading || sourceList.length === 0 || (mode === 'ach' && achBanks.length === 0)}>
            {loading ? 'Sending…' : mode === 'ach' ? 'Send via Dwolla ACH' : 'Send internal transfer'}
          </Button>
        </form>
      </Card>

      <Dialog open={!!warning} onOpenChange={(o) => { if (!o) cancelTransfer() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="size-5" /> Verify this transfer
            </DialogTitle>
            <DialogDescription>
              {warning?.payload.message}
            </DialogDescription>
          </DialogHeader>
          {warning && (
            <div className="space-y-2 mt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Why HALO flagged this
              </p>
              <ul className="text-sm space-y-1.5">
                {warning.payload.flags.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{FLAG_LABELS[f] ?? f.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={cancelTransfer} disabled={loading}>
              Cancel transfer
            </Button>
            <Button onClick={confirmProceed} disabled={loading}>
              {loading ? 'Sending…' : 'I have verified this — proceed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
