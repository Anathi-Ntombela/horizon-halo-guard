import { supabase } from '@/integrations/supabase/client'

export type HaloEventType =
  | 'AUTH_FAILURE' | 'AUTH_SUCCESS' | 'SESSION_CREATED'
  | 'RAPID_ACCOUNT_LINK' | 'ANOMALOUS_TRANSFER'
  | 'HONEYPOT_TRIGGER' | 'SUSPICIOUS_PATTERN' | 'BRUTE_FORCE_DETECTED'
  | 'SOCIAL_ENGINEERING_VECTOR'
  | 'MFA_FAILURE' | 'MFA_ENROLLED' | 'MFA_VERIFIED'
  // Layer 1 — sensor array
  | 'SENSOR_THERMAL_SPIKE' | 'SENSOR_TAMPER' | 'SENSOR_POWER_SPIKE' | 'SENSOR_ENVIRONMENT'
  // Layer 2 — honeypot network
  | 'HONEYPOT_FAKE_CRED' | 'HONEYPOT_DECOY_SERVER' | 'HONEYPOT_FAKE_FILE'
  // Layer 3 — AI engine
  | 'AI_ANOMALY_CLUSTER' | 'AI_PREDICTIVE_RISK' | 'AI_AUTO_RESPONSE'

export async function logHaloEvent(
  type: HaloEventType,
  metadata: Record<string, unknown> = {},
  severity?: 'low' | 'medium' | 'high' | 'critical',
) {
  try {
    await supabase.functions.invoke('halo-log', { body: { type, metadata, severity } })
  } catch (e) {
    console.warn('halo-log failed', e)
  }
}

export async function fetchHaloStatus() {
  const { data, error } = await supabase.functions.invoke('halo-status')
  if (error) throw error
  return data as {
    threatScore: number
    status: 'SECURE' | 'ELEVATED' | 'CRITICAL'
    totalEvents: number
    honeypotTriggers: number
    anomalyCount: number
    bruteForceCount: number
    events: Array<{ event_type: string; severity: string; created_at: string; metadata: any }>
  }
}

export async function triggerHoneypot() {
  // Calls the public-facing decoy path. Any hit is silently logged as a critical event.
  await fetch('/api/internal/accounts/export', { method: 'GET' }).catch(() => {})
}

export async function clearHaloEvents() {
  const { error } = await supabase.functions.invoke('halo-clear')
  if (error) throw error
}

export function severityColor(s: string) {
  switch (s) {
    case 'critical': return 'bg-red-600 text-white'
    case 'high':     return 'bg-orange-500 text-white'
    case 'medium':   return 'bg-amber-400 text-black'
    default:         return 'bg-emerald-500 text-white'
  }
}

export function relativeTime(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Human-readable labels used by the Incident Timeline.
export const EVENT_LABELS: Record<string, string> = {
  AUTH_FAILURE: 'Failed sign-in attempt detected',
  AUTH_SUCCESS: 'Successful sign-in',
  SESSION_CREATED: 'New session established',
  BRUTE_FORCE_DETECTED: 'Brute force threshold crossed — account blocked',
  HONEYPOT_TRIGGER: 'Decoy endpoint accessed — active probe detected',
  ANOMALOUS_TRANSFER: 'High-value transfer flagged for review',
  SOCIAL_ENGINEERING_VECTOR: 'Transfer matched social engineering pattern',
  SUSPICIOUS_PATTERN: 'Suspicious activity pattern recorded',
  MFA_FAILURE: 'Multi-factor authentication failed',
  MFA_ENROLLED: 'MFA successfully enrolled',
  MFA_VERIFIED: 'MFA verification successful',
}
