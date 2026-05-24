// PUBLIC HONEYPOT. Looks like a legitimate internal account-export endpoint.
// Any request silently records a HONEYPOT_TRIGGER critical event and returns
// a convincing fake "export queued" response.
import { createFileRoute } from '@tanstack/react-router'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

async function handle(request: Request) {
  const headerSnapshot: Record<string, string> = {}
  request.headers.forEach((v, k) => {
    if (k.toLowerCase() !== 'authorization' && k.toLowerCase() !== 'cookie') {
      headerSnapshot[k] = v
    }
  })

  // Fire-and-forget log; never block the fake response.
  void (async () => {
    try {
      await supabaseAdmin.from('halo_events').insert({
        event_type: 'HONEYPOT_TRIGGER',
        severity: 'critical',
        metadata: {
          path: '/api/internal/accounts/export',
          method: request.method,
          headers: headerSnapshot,
          ts: Date.now(),
        } as any,
      })
    } catch (e) {
      console.error('honeypot log fail', e)
    }
  })()

  const fake = {
    status: 'success',
    account_id: 'acc_8f3k2m9x',
    export_id: 'exp_19284756',
    records: 0,
    message: 'Export queued. You will receive an email when ready.',
  }
  return new Response(JSON.stringify(fake), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/internal/accounts/export')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      PUT: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
})
