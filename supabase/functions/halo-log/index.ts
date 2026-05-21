// HALO event ingestion. Writes a security event and runs brute-force detection.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3.23.8'

const EVENT_TYPES = [
  'AUTH_FAILURE', 'AUTH_SUCCESS', 'SESSION_CREATED', 'RAPID_ACCOUNT_LINK',
  'ANOMALOUS_TRANSFER', 'HONEYPOT_TRIGGER', 'SUSPICIOUS_PATTERN', 'BRUTE_FORCE_DETECTED',
] as const

const BodySchema = z.object({
  type: z.enum(EVENT_TYPES),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const DEFAULT_SEVERITY: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  AUTH_FAILURE: 'high',
  AUTH_SUCCESS: 'low',
  SESSION_CREATED: 'low',
  RAPID_ACCOUNT_LINK: 'medium',
  ANOMALOUS_TRANSFER: 'critical',
  HONEYPOT_TRIGGER: 'critical',
  SUSPICIOUS_PATTERN: 'high',
  BRUTE_FORCE_DETECTED: 'critical',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { type, metadata = {} } = parsed.data
    const severity = parsed.data.severity ?? DEFAULT_SEVERITY[type]

    // Resolve user_id if JWT provided
    let userId: string | null = null
    const auth = req.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin.auth.getUser(auth.replace('Bearer ', ''))
      userId = data.user?.id ?? null
    }

    await admin.from('halo_events').insert({
      event_type: type, severity, metadata, user_id: userId,
    })

    // Brute-force detection: 5+ AUTH_FAILURE within 120s for the same email/context
    if (type === 'AUTH_FAILURE') {
      const since = new Date(Date.now() - 120_000).toISOString()
      const email = (metadata as any)?.email
      let q = admin.from('halo_events').select('id', { count: 'exact', head: true })
        .eq('event_type', 'AUTH_FAILURE').gte('created_at', since)
      if (email) q = q.eq('metadata->>email', email)
      const { count } = await q
      if ((count ?? 0) >= 5) {
        // Avoid duplicates: only log if no BRUTE_FORCE in last 60s for same context
        const recent = await admin.from('halo_events').select('id', { head: true, count: 'exact' })
          .eq('event_type', 'BRUTE_FORCE_DETECTED')
          .gte('created_at', new Date(Date.now() - 60_000).toISOString())
        if ((recent.count ?? 0) === 0) {
          await admin.from('halo_events').insert({
            event_type: 'BRUTE_FORCE_DETECTED', severity: 'critical',
            metadata: { context: 'login', email, failures: count },
          })
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('halo-log error', err)
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
