// Server-only Dwolla sandbox helpers (fetch-based, Worker-compatible).
const DWOLLA_BASE = 'https://api-sandbox.dwolla.com'
const DWOLLA_AUTH = 'https://api-sandbox.dwolla.com/token'

let cachedToken: { token: string; exp: number } | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.exp > now + 30_000) return cachedToken.token
  const key = process.env.DWOLLA_KEY
  const secret = process.env.DWOLLA_SECRET
  if (!key || !secret) throw new Error('DWOLLA credentials missing')
  const basic = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch(DWOLLA_AUTH, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Dwolla auth failed: ${res.status} ${await res.text()}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: j.access_token, exp: now + j.expires_in * 1000 }
  return j.access_token
}

async function dwollaFetch(path: string, init: RequestInit = {}, locationOnly = false) {
  const token = await getAccessToken()
  const res = await fetch(path.startsWith('http') ? path : `${DWOLLA_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.dwolla.v1.hal+json',
      'Content-Type': 'application/vnd.dwolla.v1.hal+json',
    },
  })
  if (!res.ok) throw new Error(`Dwolla ${path} ${res.status}: ${await res.text()}`)
  if (locationOnly) return res.headers.get('Location') ?? ''
  if (res.status === 204) return null
  return res.json()
}

export async function createDwollaCustomer(p: {
  firstName: string; lastName: string; email: string; type?: 'personal'
}): Promise<string> {
  return dwollaFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({ firstName: p.firstName, lastName: p.lastName, email: p.email, type: p.type ?? 'personal' }),
  }, true) as Promise<string>
}

export async function createFundingSource(customerUrl: string, plaidToken: string, name: string): Promise<string> {
  return dwollaFetch(`${customerUrl}/funding-sources`, {
    method: 'POST',
    body: JSON.stringify({ plaidToken, name }),
  }, true) as Promise<string>
}

export async function createTransferDwolla(sourceFundingUrl: string, destFundingUrl: string, amount: number) {
  return dwollaFetch('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      _links: {
        source: { href: sourceFundingUrl },
        destination: { href: destFundingUrl },
      },
      amount: { currency: 'USD', value: amount.toFixed(2) },
    }),
  }, true)
}
