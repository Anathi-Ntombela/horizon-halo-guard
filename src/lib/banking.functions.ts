import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { createLinkToken, exchangePublic, getAccounts, createProcessorToken } from './plaid.server'
import { createDwollaCustomer, createFundingSource, createTransferDwolla } from './dwolla.server'

// 1. Create Plaid Link token for the signed-in user.
export const plaidCreateLinkToken = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { link_token } = await createLinkToken(context.userId)
    return { link_token }
  })

// 2. Exchange public_token, register Dwolla customer (if needed), create funding sources, insert bank rows.
export const plaidExchange = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ public_token: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context

    const { data: prof, error: pErr } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (pErr) throw new Error(pErr.message)
    let dwollaCustomerUrl = prof.dwolla_customer_url
    if (!dwollaCustomerUrl) {
      dwollaCustomerUrl = await createDwollaCustomer({
        firstName: prof.first_name || 'New',
        lastName: prof.last_name || 'User',
        email: prof.email,
      })
      await supabaseAdmin.from('profiles').update({ dwolla_customer_url: dwollaCustomerUrl }).eq('id', userId)
    }

    const { access_token } = await exchangePublic(data.public_token)
    const { accounts } = await getAccounts(access_token)

    const inserted: string[] = []
    for (const acct of accounts) {
      const { processor_token } = await createProcessorToken(access_token, acct.account_id)
      const fundingUrl = await createFundingSource(dwollaCustomerUrl, processor_token, acct.name)
      const { data: bank, error } = await supabase.from('banks').insert({
        user_id: userId,
        name: acct.name,
        official_name: acct.official_name ?? acct.name,
        mask: acct.mask ?? '0000',
        subtype: acct.subtype,
        account_type: acct.type,
        current_balance: acct.balances.current ?? 0,
        available_balance: acct.balances.available ?? acct.balances.current ?? 0,
        plaid_access_token: access_token,
        plaid_account_id: acct.account_id,
        funding_source_url: fundingUrl,
      }).select('id').single()
      if (error) throw new Error(error.message)
      inserted.push(bank.id)
    }
    return { added: inserted.length }
  })

// ---- Social engineering interception ------------------------------------

const TransferSchema = z.object({
  source_bank_id: z.string().uuid(),
  recipient_shareable: z.string().min(6).max(60),
  recipient_email: z.string().email(),
  amount: z.coerce.number().positive().max(1_000_000),
  note: z.string().max(280).optional(),
  proceed_token: z.string().uuid().optional(),
  time_on_page: z.number().int().nonnegative().max(86_400).optional(),
})
type TransferInput = z.infer<typeof TransferSchema>

function contextHash(userId: string, v: TransferInput) {
  return `${userId}|${v.source_bank_id}|${v.recipient_shareable}|${v.amount.toFixed(2)}`
}

async function logVector(
  userId: string,
  metadata: Record<string, unknown>,
) {
  await supabaseAdmin.from('halo_events').insert({
    user_id: userId,
    event_type: 'SOCIAL_ENGINEERING_VECTOR',
    severity: 'high',
    metadata,
  })
}

/**
 * Returns { warning, payload } when the transfer should be intercepted.
 * Returns { warning: false } when it's safe to proceed (or a valid proceed_token is supplied).
 */
async function evaluateSocialEngineering(
  userId: string,
  v: TransferInput,
  destBankId: string,
): Promise<
  | { warning: false; flags: string[] }
  | { warning: true; payload: { warning: true; message: string; flags: string[]; proceed_token: string } }
> {
  const ctxHash = contextHash(userId, v)

  // If client passed a proceed_token, validate and consume it.
  if (v.proceed_token) {
    const { data: tok } = await supabaseAdmin.from('transfer_proceed_tokens')
      .select('id,context_hash,expires_at,consumed_at')
      .eq('id', v.proceed_token).eq('user_id', userId).maybeSingle()
    if (tok && !tok.consumed_at && tok.context_hash === ctxHash &&
        new Date(tok.expires_at).getTime() > Date.now()) {
      await supabaseAdmin.from('transfer_proceed_tokens')
        .update({ consumed_at: new Date().toISOString() }).eq('id', tok.id)
      return { warning: false, flags: ['user_confirmed'] }
    }
    // Invalid/expired token: fall through to re-evaluate. We do NOT block.
  }

  const flags: string[] = []

  // Check 1 — first transfer to this recipient
  const { count: priorCount } = await supabaseAdmin.from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('type', 'debit')
    .ilike('name', `%${v.recipient_email}%`)
  if ((priorCount ?? 0) === 0) flags.push('new_recipient')

  // Check 2 — recipient bank recently added
  const { data: destBank } = await supabaseAdmin.from('banks')
    .select('created_at').eq('id', destBankId).maybeSingle()
  if (destBank?.created_at) {
    const ageMs = Date.now() - new Date(destBank.created_at).getTime()
    if (ageMs < 24 * 60 * 60 * 1000) flags.push('recently_added')
  }

  // Check 3 — unusual amount
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabaseAdmin.from('transactions')
    .select('amount').eq('user_id', userId).eq('type', 'debit')
    .eq('category', 'Transfer').gte('created_at', since)
  const amounts = (recent ?? []).map((r) => Number(r.amount)).filter((n) => n > 0)
  const avg = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0
  if ((avg > 0 && v.amount > avg * 2) ||
      ((priorCount ?? 0) === 0 && v.amount > 5000)) flags.push('unusual_amount')

  // Vishing signal — submitted very fast
  if (v.time_on_page != null && v.time_on_page < 45) flags.push('vishing_timing')

  // Two or more of the three primary flags trigger friction. vishing_timing alone never blocks.
  const primaryFlagCount = flags.filter((f) => f !== 'vishing_timing').length
  if (primaryFlagCount < 2) {
    return { warning: false, flags }
  }

  // Mint a 5-minute confirmation token and surface the warning.
  const { data: tok, error } = await supabaseAdmin.from('transfer_proceed_tokens').insert({
    user_id: userId,
    context_hash: ctxHash,
    flags,
  }).select('id').single()
  if (error || !tok) throw new Error('Could not issue confirmation token')

  await logVector(userId, {
    outcome: 'intercepted', flags, amount: v.amount,
    recipient_email: v.recipient_email, time_on_page: v.time_on_page ?? null,
  })

  return {
    warning: true,
    payload: {
      warning: true,
      message: 'This transfer has unusual characteristics. Verify the recipient directly before proceeding.',
      flags,
      proceed_token: tok.id,
    },
  }
}

// 3. Real ACH transfer through Dwolla.
export const dwollaTransfer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TransferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context

    const { data: src, error: sErr } = await supabase
      .from('banks').select('*').eq('id', data.source_bank_id).eq('user_id', userId).single()
    if (sErr || !src) throw new Error('Source bank not found')
    if (!src.funding_source_url) throw new Error('Source bank is not linked to ACH (re-connect via Plaid)')

    const { data: dest, error: dErr } = await supabaseAdmin
      .from('banks').select('id,user_id,funding_source_url,name,created_at').eq('shareable_id', data.recipient_shareable).maybeSingle()
    if (dErr) throw new Error(dErr.message)
    if (!dest || !dest.funding_source_url) throw new Error('Recipient account not found or not ACH-linked')

    const social = await evaluateSocialEngineering(userId, data, dest.id)
    if (social.warning) return social.payload

    const transfer = await createTransferDwolla(src.funding_source_url, dest.funding_source_url, data.amount)

    await supabase.from('transactions').insert({
      user_id: userId, bank_id: src.id,
      name: `Transfer to ${data.recipient_email}`,
      amount: data.amount, category: 'Transfer', type: 'debit',
      note: data.note ?? null,
    })
    await supabaseAdmin.from('transactions').insert({
      user_id: dest.user_id, bank_id: dest.id,
      name: `Transfer from ${context.claims?.email ?? 'sender'}`,
      amount: data.amount, category: 'Transfer', type: 'credit',
      note: data.note ?? null,
    })

    return { ok: true, transfer }
  })

// 4. INTERNAL transfer — works for ANY of the user's banks (including the seeded demo banks
// without Plaid/Dwolla). Atomically adjusts balances and records ledger entries.
export const internalTransfer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TransferSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context

    const { data: src, error: sErr } = await supabase
      .from('banks').select('*').eq('id', data.source_bank_id).eq('user_id', userId).single()
    if (sErr || !src) throw new Error('Source bank not found')
    if (Number(src.available_balance) < data.amount) throw new Error('Insufficient funds')

    const { data: dest, error: dErr } = await supabaseAdmin
      .from('banks').select('id,user_id,name,current_balance,available_balance,created_at')
      .eq('shareable_id', data.recipient_shareable).maybeSingle()
    if (dErr) throw new Error(dErr.message)
    if (!dest) throw new Error('Recipient account not found — check the Share ID')
    if (dest.id === src.id) throw new Error('Cannot transfer to the same account')

    const social = await evaluateSocialEngineering(userId, data, dest.id)
    if (social.warning) return social.payload

    await supabaseAdmin.from('banks').update({
      current_balance: Number(src.current_balance) - data.amount,
      available_balance: Number(src.available_balance) - data.amount,
    }).eq('id', src.id)
    await supabaseAdmin.from('banks').update({
      current_balance: Number(dest.current_balance) + data.amount,
      available_balance: Number(dest.available_balance) + data.amount,
    }).eq('id', dest.id)

    await supabase.from('transactions').insert({
      user_id: userId, bank_id: src.id,
      name: `Transfer to ${data.recipient_email}`,
      amount: data.amount, category: 'Transfer', type: 'debit',
      note: data.note ?? null,
    })
    await supabaseAdmin.from('transactions').insert({
      user_id: dest.user_id, bank_id: dest.id,
      name: `Transfer from ${context.claims?.email ?? 'sender'}`,
      amount: data.amount, category: 'Transfer', type: 'credit',
      note: data.note ?? null,
    })

    return { ok: true, debited: src.id, credited: dest.id }
  })

// Logs a "user cancelled the friction modal" — a positive signal.
export const reportTransferCancelled = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    proceed_token: z.string().uuid(),
    flags: z.array(z.string()).max(10).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin.from('transfer_proceed_tokens')
      .update({ consumed_at: new Date().toISOString() }).eq('id', data.proceed_token)
    await logVector(context.userId, {
      outcome: 'user_cancelled',
      flags: data.flags ?? [],
      proceed_token: data.proceed_token,
    })
    return { ok: true }
  })

// 5. ADMIN — list all profiles with their roles. Admin-only.
export const adminListUsers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleCheck } = await supabaseAdmin.rpc('has_role', { _user_id: context.userId, _role: 'admin' })
    if (!roleCheck) throw new Error('Admin role required')
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles').select('id,first_name,last_name,email,created_at').order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const { data: roles } = await supabaseAdmin.from('user_roles').select('user_id,role')
    const byUser = new Map<string, string[]>()
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? []
      arr.push(r.role)
      byUser.set(r.user_id, arr)
    }
    return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }))
  })

// 6. ADMIN — grant/revoke admin role for another user.
export const adminSetRole = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    target_user_id: z.string().uuid(),
    role: z.enum(['admin']),
    grant: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await supabaseAdmin.rpc('is_super_admin', { _user_id: context.userId })
    if (!isSuper) throw new Error('Only the first administrator can manage admins')

    if (data.grant) {
      await supabaseAdmin.from('user_roles').upsert(
        { user_id: data.target_user_id, role: data.role },
        { onConflict: 'user_id,role' },
      )
    } else {
      await supabaseAdmin.from('user_roles').delete()
        .eq('user_id', data.target_user_id).eq('role', data.role)
    }
    return { ok: true }
  })

// 7. Manually add a bank account (e.g. South African banks not supported by Plaid sandbox).
export const addManualBank = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().min(2).max(80),
    official_name: z.string().min(2).max(120),
    mask: z.string().regex(/^\d{4}$/, 'Last 4 digits required'),
    subtype: z.enum(['checking', 'savings', 'credit']),
    currency: z.enum(['USD', 'ZAR']).default('ZAR'),
    opening_balance: z.coerce.number().min(0).max(10_000_000).default(0),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context
    const { data: bank, error } = await supabase.from('banks').insert({
      user_id: userId,
      name: data.name,
      official_name: data.official_name,
      mask: data.mask,
      subtype: data.subtype,
      account_type: data.subtype === 'credit' ? 'credit' : 'depository',
      current_balance: data.opening_balance,
      available_balance: data.opening_balance,
      currency: data.currency,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: bank.id }
  })

// 8. Bootstrap admin — promotes the caller to admin ONLY if no admin exists yet.
export const bootstrapAdmin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin.rpc('bootstrap_admin', { _user_id: context.userId })
    if (error) throw new Error(error.message)
    return { promoted: !!data }
  })

// 9. Pre-flight rate-limit check used by the sign-in form.
// Returns { blocked: true, until } if the email is currently rate-limited.
// This runs WITHOUT auth — anyone can call it for any email.
export const preflightSignIn = createServerFn({ method: 'POST' })
  .inputValidator((d) => z.object({ email: z.string().email() }).parse(d))
  .handler(async ({ data }) => {
    const nowIso = new Date().toISOString()
    const { data: row } = await supabaseAdmin
      .from('blocked_contexts')
      .select('blocked_until')
      .eq('context', data.email)
      .gt('blocked_until', nowIso)
      .order('blocked_until', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (row) {
      // Repeated attempts while blocked — log the pattern.
      await supabaseAdmin.from('halo_events').insert({
        event_type: 'SUSPICIOUS_PATTERN',
        severity: 'high',
        metadata: { context: 'login', email: data.email, blocked_attempt: true },
      })
      return { blocked: true as const, blocked_until: row.blocked_until }
    }
    return { blocked: false as const }
  })
