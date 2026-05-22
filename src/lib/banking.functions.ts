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

    // ensure Dwolla customer exists on profile
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

    // Plaid exchange + accounts
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

// 3. Real ACH transfer through Dwolla. Recipient must be another HORIZON user (lookup by shareable_id of one of their banks).
export const dwollaTransfer = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    source_bank_id: z.string().uuid(),
    recipient_shareable: z.string().min(6).max(60),
    recipient_email: z.string().email(),
    amount: z.coerce.number().positive().max(1_000_000),
    note: z.string().max(280).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context

    const { data: src, error: sErr } = await supabase
      .from('banks').select('*').eq('id', data.source_bank_id).eq('user_id', userId).single()
    if (sErr || !src) throw new Error('Source bank not found')
    if (!src.funding_source_url) throw new Error('Source bank is not linked to ACH (re-connect via Plaid)')

    // Lookup destination by shareable_id (must be a real bank in our system)
    const { data: dest, error: dErr } = await supabaseAdmin
      .from('banks').select('id,user_id,funding_source_url,name').eq('shareable_id', data.recipient_shareable).maybeSingle()
    if (dErr) throw new Error(dErr.message)
    if (!dest || !dest.funding_source_url) {
      throw new Error('Recipient account not found or not ACH-linked')
    }

    const transfer = await createTransferDwolla(src.funding_source_url, dest.funding_source_url, data.amount)

    // Log debit on source
    await supabase.from('transactions').insert({
      user_id: userId, bank_id: src.id,
      name: `Transfer to ${data.recipient_email}`,
      amount: data.amount, category: 'Transfer', type: 'debit',
      note: data.note ?? null,
    })
    // Log credit on destination (admin, crosses user)
    await supabaseAdmin.from('transactions').insert({
      user_id: dest.user_id, bank_id: dest.id,
      name: `Transfer from ${context.claims?.email ?? 'sender'}`,
      amount: data.amount, category: 'Transfer', type: 'credit',
      note: data.note ?? null,
    })

    return { ok: true, transfer }
  })
