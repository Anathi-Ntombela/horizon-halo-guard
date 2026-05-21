// Decoy "internal" endpoint. Any request silently triggers a HALO critical alert
// but returns a convincing fake JSON payload so the attacker doesn't notice.
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

  // Fire and forget; never block the fake response
  admin.from('halo_events').insert({
    event_type: 'HONEYPOT_TRIGGER', severity: 'critical',
    metadata: { path: '/api/halo/honeypot', method: req.method, headers: headerSnapshot, ts: Date.now() },
  }).then(() => {}).catch((e) => console.error('honeypot log fail', e))

  // Convincing fake response
  const fake = {
    status: 'ok',
    server: 'horizon-internal-2',
    region: 'us-east-1',
    accounts: [
      { id: 'acct_8821', balance: 142_889.21, owner: 'redacted' },
      { id: 'acct_4410', balance: 88_120.04, owner: 'redacted' },
    ],
    timestamp: new Date().toISOString(),
  }
  return new Response(JSON.stringify(fake), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
