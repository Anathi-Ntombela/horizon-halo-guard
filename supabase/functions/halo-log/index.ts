// HALO event ingestion. Writes a security event, runs brute-force detection,
// inserts a blocked_contexts row after BRUTE_FORCE_DETECTED, and dispatches
// admin email alerts when a critical event is recorded.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@3.23.8'

const EVENT_TYPES = [
  'AUTH_FAILURE', 'AUTH_SUCCESS', 'SESSION_CREATED', 'RAPID_ACCOUNT_LINK',
  'ANOMALOUS_TRANSFER', 'HONEYPOT_TRIGGER', 'SUSPICIOUS_PATTERN', 'BRUTE_FORCE_DETECTED',
  'SOCIAL_ENGINEERING_VECTOR',
  'MFA_FAILURE', 'MFA_ENROLLED', 'MFA_VERIFIED',
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
  SOCIAL_ENGINEERING_VECTOR: 'high',
  MFA_FAILURE: 'high',
  MFA_ENROLLED: 'low',
  MFA_VERIFIED: 'low',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function alertAdmins(event: {
  type: string; severity: string; metadata: Record<string, unknown>; user_id: string | null
}) {
  try {
    const { data: admins } = await admin.from('user_roles').select('user_id').eq('role', 'admin')
    const ids = (admins ?? []).map((r) => r.user_id)
    if (ids.length === 0) return
    const { data: profiles } = await admin.from('profiles').select('email,first_name').in('id', ids)
    const recipients = (profiles ?? []).map((p) => p.email).filter(Boolean) as string[]
    if (recipients.length === 0) return

    const subject = `[HALO] ${event.severity.toUpperCase()} — ${event.type.replace(/_/g, ' ')}`
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px">
        <h2 style="color:#dc2626;margin:0 0 8px">HALO Security Alert</h2>
        <p style="margin:0 0 8px"><strong>${event.type}</strong> — severity <strong>${event.severity}</strong></p>
        <p style="margin:0 0 12px;color:#475569">Triggered at ${new Date().toISOString()}</p>
        <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;overflow:auto">${JSON.stringify(event.metadata, null, 2)}</pre>
        <p style="font-size:12px;color:#64748b">Review the live feed and forensics in the HORIZON HALO dashboard.</p>
      </div>`

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    if (LOVABLE_API_KEY && RESEND_API_KEY) {
      await fetch('https://connector-gateway.lovable.dev/resend/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: 'HALO Alerts <onboarding@resend.dev>',
          to: recipients,
          subject,
          html,
        }),
      })
      console.log(`[HALO] critical alert emailed to ${recipients.length} admin(s)`)
    } else {
      await admin.from('halo_events').insert({
        event_type: 'SUSPICIOUS_PATTERN',
        severity: 'low',
        metadata: {
          notice: 'admin email skipped (RESEND_API_KEY not configured)',
          would_notify: recipients,
          original_event: event.type,
        },
      })
    }
  } catch (e) {
    console.warn('[HALO] alertAdmins failed', e)
  }
}

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

    let userId: string | null = null
    const auth = req.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin.auth.getUser(auth.replace('Bearer ', ''))
      userId = data.user?.id ?? null
    }

    await admin.from('halo_events').insert({
      event_type: type, severity, metadata, user_id: userId,
    })

    // Brute-force detection — combines AUTH_FAILURE and MFA_FAILURE in the same window.
    if (type === 'AUTH_FAILURE' || type === 'MFA_FAILURE') {
      const since = new Date(Date.now() - 120_000).toISOString()
      const email = (metadata as any)?.email
      let q = admin.from('halo_events').select('id', { count: 'exact', head: true })
        .in('event_type', ['AUTH_FAILURE', 'MFA_FAILURE']).gte('created_at', since)
      if (email) q = q.eq('metadata->>email', email)
      const { count } = await q
      if ((count ?? 0) >= 5) {
        const recent = await admin.from('halo_events').select('id', { head: true, count: 'exact' })
          .eq('event_type', 'BRUTE_FORCE_DETECTED')
          .gte('created_at', new Date(Date.now() - 60_000).toISOString())
        if ((recent.count ?? 0) === 0) {
          const blockMeta = { context: 'login', email, failures: count }
          await admin.from('halo_events').insert({
            event_type: 'BRUTE_FORCE_DETECTED', severity: 'critical', metadata: blockMeta,
          })
          // Rate-limit the offending email (and/or IP if we ever capture it) for 15 minutes.
          if (email) {
            const blockedUntil = new Date(Date.now() + 15 * 60_000).toISOString()
            await admin.from('blocked_contexts').insert({
              context: email,
              blocked_until: blockedUntil,
              reason: `${count} failed attempts in 120s`,
            })
          }
          await alertAdmins({
            type: 'BRUTE_FORCE_DETECTED', severity: 'critical',
            metadata: blockMeta, user_id: userId,
          })
        }
      }
    }

    if (severity === 'critical') {
      await alertAdmins({ type, severity, metadata, user_id: userId })
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
