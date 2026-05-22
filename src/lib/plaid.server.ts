// Server-only Plaid sandbox helpers (fetch-based).
const PLAID_BASE = 'https://sandbox.plaid.com'

function creds() {
  const client_id = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!client_id || !secret) throw new Error('PLAID credentials missing')
  return { client_id, secret }
}

async function plaid<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${PLAID_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds(), ...body }),
  })
  if (!res.ok) throw new Error(`Plaid ${path} ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function createLinkToken(userId: string) {
  return plaid<{ link_token: string }>('/link/token/create', {
    user: { client_user_id: userId },
    client_name: 'HORIZON',
    products: ['auth'],
    language: 'en',
    country_codes: ['US'],
  })
}

export async function exchangePublic(public_token: string) {
  return plaid<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token })
}

export async function getAccounts(access_token: string) {
  return plaid<{
    accounts: Array<{
      account_id: string; name: string; official_name?: string; mask?: string;
      subtype: string; type: string;
      balances: { available: number | null; current: number | null }
    }>
  }>('/accounts/get', { access_token })
}

export async function createProcessorToken(access_token: string, account_id: string) {
  return plaid<{ processor_token: string }>('/processor/token/create', {
    access_token, account_id, processor: 'dwolla',
  })
}
