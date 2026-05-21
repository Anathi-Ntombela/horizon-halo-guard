import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Landmark, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '@/integrations/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'

export const Route = createFileRoute('/_app/my-banks')({
  component: MyBanksPage,
})

function MyBanksPage() {
  const q = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('banks').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Banks</h1>
          <p className="text-sm text-muted-foreground">All accounts connected to HORIZON.</p>
        </div>
        <Button onClick={() => toast.info('Plaid Link is coming in Phase 2')}>
          <Plus className="size-4 mr-1" /> Connect bank
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
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
