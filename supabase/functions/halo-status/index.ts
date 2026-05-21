// HALO status: aggregate threat score + counters. Rate-limited per session (60 rpm).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

// Per-key token bucket. Process-local; sufficient for demo.
const buckets = new Map<string, { tokens: number; ts: number }>()
const RPM = 60
const REFILL_MS = 60_000

function rateLimit(key: string): boolean {
  const now = Date.now()
  const b = buckets.get(key) ?? { tokens: RPM, ts: now }
  const refill = Math.floor((now - b.ts) / REFILL_MS) * RPM
  if (refill > 0) { b.tokens = Math.min(RPM, b.tokens + refill); b.ts = now }
  if (b.tokens <= 0) { buckets.set(key, b); return false }
  b.tokens -= 1
  buckets.set(key, b)
  return true
}

type Sev = 'low' | 'medium' | 'high' | 'critical'
interface EvRow { event_type: string; severity: Sev; created_at: string; metadata: any }

function scoreEvents(rows: EvRow[]): number {
  const now = Date.now()
  let score = 0
  let mostRecent = 0
  for (const r of rows) {
    const t = new Date(r.created_at).getTime()
    const ageSec = (now - t) / 1000
    if (t > mostRecent) mostRecent = t
    if (r.severity === 'critical' && ageSec <= 60) score += 25
    else if (r.severity === 'high' && ageSec <= 60) score += 15
    else if (r.severity === 'medium' && ageSec <= 300) score += 8
    else if (r.severity === 'low') score += 1
  }
  // Decay: -5 per 30s of inactivity since most recent event
  if (mostRecent > 0) {
    const idleSec = (now - mostRecent) / 1000
    score -= 5 * Math.floor(idleSec / 30)
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const token = auth.replace('Bearer ', '')
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!rateLimit(userData.user.id)) {
    return new Response(JSON.stringify({ error: 'rate_limited' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data } = await admin.from('halo_events')
    .select('event_type, severity, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(500)
  const events = (data ?? []) as EvRow[]

  const threatScore = scoreEvents(events)
  const honeypotTriggers = events.filter(e => e.event_type === 'HONEYPOT_TRIGGER').length
  const anomalyCount = events.filter(e => e.event_type === 'ANOMALOUS_TRANSFER').length
  const bruteForceCount = events.filter(e => e.event_type === 'BRUTE_FORCE_DETECTED').length

  const status = threatScore >= 70 ? 'CRITICAL' : threatScore >= 30 ? 'ELEVATED' : 'SECURE'

  return new Response(JSON.stringify({
    threatScore, status, totalEvents: events.length,
    honeypotTriggers, anomalyCount, bruteForceCount,
    events: events.slice(0, 20),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
