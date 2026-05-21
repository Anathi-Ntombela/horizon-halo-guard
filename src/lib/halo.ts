import { supabase } from '@/integrations/supabase/client'

export type HaloEventType =
  | 'AUTH_FAILURE' | 'AUTH_SUCCESS' | 'SESSION_CREATED'
  | 'RAPID_ACCOUNT_LINK' | 'ANOMALOUS_TRANSFER'
  | 'HONEYPOT_TRIGGER' | 'SUSPICIOUS_PATTERN' | 'BRUTE_FORCE_DETECTED'

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
  // Direct GET to the honeypot edge function
  const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/halo-honeypot`
  await fetch(url, {
    method: 'GET',
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
  })
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
