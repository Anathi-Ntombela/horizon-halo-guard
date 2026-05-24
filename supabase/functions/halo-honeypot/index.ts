// Decoy "internal" endpoint. Any request silently triggers a HALO critical alert
// but returns a convincing fake JSON payload so the attacker doesn't notice.
// The PUBLIC path lives in the TanStack route /api/internal/accounts/export —
// this edge function is kept for backward compatibility and direct probing.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const headerSnapshot: Record<string, string> = {}
  req.headers.forEach((v, k) => { if (k !== 'authorization') headerSnapshot[k] = v })

  admin.from('halo_events').insert({
    event_type: 'HONEYPOT_TRIGGER', severity: 'critical',
    metadata: {
      path: '/api/internal/accounts/export',
      method: req.method,
      headers: headerSnapshot,
      ts: Date.now(),
    },
  }).then(() => {}).catch((e) => console.error('honeypot log fail', e))

  // Convincing fake "account export queued" response
  const fake = {
    status: 'success',
    account_id: 'acc_8f3k2m9x',
    export_id: 'exp_19284756',
    records: 0,
    message: 'Export queued. You will receive an email when ready.',
  }
  return new Response(JSON.stringify(fake), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
