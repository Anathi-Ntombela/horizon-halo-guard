# HORIZON × HALO

A full-stack secure banking app (**HORIZON**) with a hardware-anchored security
monitoring layer (**HALO — Hardware-Anchored Layer for Operational Security**)
running alongside it in the same repository.

---

## What it is

**HORIZON** is a modern personal banking dashboard. Users can sign up, link real
bank accounts (Plaid sandbox), view balances and transactions, and move money
between accounts on the platform — either instantly (internal ledger) or over
real ACH rails (Dwolla sandbox).

**HALO** is the security mesh that watches every meaningful action in the
banking app — sign-ins, account linking, transfers, decoy endpoint hits — and
turns them into a real-time threat picture. It runs as a separate route
(`/halo`) with its own dashboard, but its sensors are woven through the rest
of the app.

---

## Why it was built

Most consumer fintech UIs treat security as a checkbox: an email on a failed
login, an opaque "fraud team" somewhere in the background. HORIZON + HALO
exists to demonstrate the opposite — that a banking app can ship with its
own visible, inspectable security operations centre, where:

- every sensor event is a row you can query,
- every alert has a forensic trail,
- and the user (or an admin) can see *why* the system thinks something is
  wrong, not just *that* it is.

It's a teaching artifact, a reference architecture, and a working sandbox
banking product all at once.

---

## Main purpose

| System    | Purpose                                                                                |
|-----------|----------------------------------------------------------------------------------------|
| HORIZON   | Let a user sign up, link banks, see transactions, and move money safely.               |
| HALO      | Detect, score, store, and surface every suspicious thing that happens in HORIZON.      |

---

## What's been built

### Banking (HORIZON)
- Email/password auth (Supabase) with profile + KYC fields captured at sign-up.
- Auto-seeded demo banks and transactions on first login so the app is useful
  immediately.
- Plaid Link integration (sandbox) to connect real bank accounts.
- Dwolla integration (sandbox) for actual ACH transfers between HORIZON users.
- **Internal transfer mode** — instant on-platform transfers from *any* of the
  user's accounts (including the demo banks) to any other HORIZON user via
  their bank's Share ID. Balances update atomically and a debit/credit pair
  is written to the ledger.
- Home page: "Welcome Back, *FirstName*", total balance, spending-by-category
  pie, recent transactions, bank list.
- Transaction history with category badges.
- My Banks page with Plaid Link button and Share ID for each account.

### Security (HALO)
- Dedicated `halo_events` table with severity (`low|medium|high|critical`),
  event type, JSON metadata, and optional user id.
- Edge functions:
  - `halo-log` — ingests events and auto-detects brute-force (5+ AUTH_FAILURE
    in 120s).
  - `halo-honeypot` — decoy endpoint that returns a believable fake success
    response but silently records a critical event.
  - `halo-status` — aggregates the live threat score (0-100, with decay).
  - `halo-clear` — admin-only event purge.
- **Live monitor** tab: SVG arc gauge, 90-second score timeline (Recharts),
  realtime event feed (Supabase Realtime channel on `halo_events`), stat
  cards for honeypot hits, anomalies and brute-force counts.
- **Threat forensics** tab: filter by severity / event type / metadata search,
  distribution by type, activity-by-hour heatmap, expandable per-event detail
  with raw metadata JSON, and JSON export of the filtered slice.
- **Admin email alerts**: every `critical` event triggers
  `halo-log → alertAdmins(...)`, which looks up every user with the `admin`
  role, resolves their email from `profiles`, and sends a formatted HTML
  alert via the Lovable Resend connector. If no email provider is configured,
  the intent is captured as a `SUSPICIOUS_PATTERN` event so nothing is lost.
- Anomalous transfer detection — any transfer > $10,000 (ACH *or* internal)
  raises an `ANOMALOUS_TRANSFER` event.
- **Rate limiting / lockout** — 5 failed sign-ins from the same context
  (email + IP) drop a row into `blocked_contexts` with a 15-minute TTL;
  `preflightSignIn` rejects the attempt before Supabase Auth is even called.
- **Realistic honeypot path** — decoy lives at `/api/internal/accounts/export`
  (TanStack server route) instead of an obvious `/honeypot` URL.
- **Tamper-evident forensics export** — JSON exports include a SHA-256
  `export_hash` over the payload so any post-export edit is detectable.
- **Social-engineering layer** — new-recipient + recently-added-bank +
  unusual-amount flags raise `SOCIAL_ENGINEERING_VECTOR` events; transfers
  with 2+ flags require a server-issued `proceed_token` and a friction modal.
- **Incident timeline** — realtime tab on the HALO dashboard that
  reconstructs security events as plain-English narratives.
- **OWASP ZAP scan summary** card pulled from `/api/security/scan-report`.
- **MFA (TOTP)** — `/mfa/setup` and `/mfa/verify` using Supabase Auth MFA;
  admins must satisfy AAL2 before reaching `/halo` or `/admin`.
- **Public security posture page** at `/security`, linked from the global footer.
- **Case-study reference panel** with a `localStorage`-persisted open state.

### Admin
- New `/admin` route, gated by `is_super_admin(uid)` and MFA (AAL2 required).
- Only the **first** admin (super-admin) can grant or revoke the admin role.
- Lists every profile with their roles and join date.
- Grant / revoke the `admin` role with one click. Roles live in a separate
  `user_roles` table (never on `profiles`) so privilege checks are
  RLS-friendly and immune to client tampering.
- Sidebar shows the **Admin** and **HALO** entries only when the viewer is
  the super-admin / an admin respectively.

---

## How it works

```
                ┌──────────────────────────────────────────────┐
                │              HORIZON (React app)             │
                │  TanStack Router + Query + Tailwind + ShadCN │
                └──────────────────────────────────────────────┘
                                │
              user actions      │      sensor events (logHaloEvent)
                                ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                  createServerFn (TanStack)                   │
   │  banking.functions.ts:                                       │
   │    plaidCreateLinkToken / plaidExchange                      │
   │    dwollaTransfer / internalTransfer                         │
   │    adminListUsers / adminSetRole                             │
   └──────────────────────────────────────────────────────────────┘
                                │
                                ▼
         ┌──────────────────────────────────────────┐
         │   Supabase (Postgres + Auth + Realtime)  │
         │   tables: profiles, banks, transactions, │
         │           halo_events, user_roles        │
         │   RLS on every user-owned table          │
         └──────────────────────────────────────────┘
                                ▲
                                │ inserts events / alerts admins
                                │
   ┌──────────────────────────────────────────────────────────────┐
   │       Edge functions: halo-log, halo-honeypot,               │
   │                       halo-status, halo-clear                │
   │       halo-log → Resend (via Lovable connector) on critical  │
   └──────────────────────────────────────────────────────────────┘
```

### Sensors
The client wraps interesting actions with `logHaloEvent(type, metadata)`,
which posts to `halo-log`. The function writes the row, runs detection
logic, and (for critical events) emails every admin.

### Threat score
`halo-status` reads the last N events and aggregates them into a 0–100
score with time-based decay (-5 per 30s of quiet). Status buckets:
0–30 SECURE, 31–70 ELEVATED, 71–100 CRITICAL.

### Realtime
The HALO page subscribes to `postgres_changes` on `halo_events`, so any
insert (from anywhere — client, edge function, even psql) instantly
refreshes the dashboard.

### Roles & RLS
`user_roles` is a separate table with a SECURITY DEFINER `has_role()`
function. Every admin-only action checks `has_role(auth.uid(), 'admin')`
server-side. Client UI shows/hides on the same check but never trusts it.

---

## Local config

| Secret                         | Used by                          |
|--------------------------------|----------------------------------|
| `PLAID_CLIENT_ID` / `PLAID_SECRET` | Plaid sandbox                    |
| `DWOLLA_KEY` / `DWOLLA_SECRET`     | Dwolla sandbox ACH               |
| `RESEND_API_KEY`              | (optional) HALO admin email alerts via Lovable Resend connector |
| `LOVABLE_API_KEY`              | Lovable connector gateway        |
| `SUPABASE_*`                   | Auto-managed by Lovable Cloud    |

If `RESEND_API_KEY` is missing, HALO will still log every critical event and
record a `SUSPICIOUS_PATTERN` row noting that email delivery was skipped.

---

## Test scenarios

1. **Welcome screen** — sign up with a real first name, log in, see
   *Welcome Back, &lt;FirstName&gt;*.
2. **Internal transfer** — go to Payment Transfer → Internal tab → pick the
   seeded Chase account → paste another HORIZON user's bank Share ID →
   send. Balances on both sides update immediately.
3. **Admin** — promote yourself to admin via SQL once, then use the
   `/admin` UI to manage every other user.
4. **HALO alert email** — trigger 5 failed sign-ins in a row, or send a
   transfer over $10,000. Every admin receives an HTML alert email.
5. **Forensics** — open HALO → Forensics, filter by severity = critical,
   click any event to see the raw metadata JSON, export the filtered
   slice to JSON.

---

## Tech stack

### HORIZON (banking app)

| Layer            | Choice                                                                  |
|------------------|-------------------------------------------------------------------------|
| Framework        | React 19 + TanStack Start / TanStack Router (file-based, SSR-ready)     |
| Data fetching    | TanStack Query (loaders + hooks, cache invalidation on auth changes)    |
| Server logic     | `createServerFn` (TanStack) — `plaidExchange`, `dwollaTransfer`, `internalTransfer`, `addManualBank`, `adminListUsers`, `adminSetRole`, `bootstrapAdmin` |
| Styling          | Tailwind v4 + ShadCN UI (semantic tokens in `src/styles.css`)           |
| Forms            | React Hook Form + Zod (every form, client and server validated)         |
| Auth             | Supabase Auth (email/password) with HttpOnly session via SSR cookies    |
| Database         | Supabase Postgres — `profiles`, `banks`, `transactions`, `user_roles`   |
| Access control   | Row-Level Security on every user-owned table; `has_role()` RPC for roles |
| Payments (US)    | Plaid Link (sandbox) + Dwolla (sandbox ACH)                             |
| Payments (ZA)    | Manual bank add (Standard Bank, FNB, Absa, Nedbank, Capitec, Investec, Discovery, TymeBank, African Bank, Bank Zero) — internal ZAR transfers |
| Currency         | `Intl.NumberFormat` per-bank — USD ($) and ZAR (R) supported            |
| Build / runtime  | Vite 7, Cloudflare Worker SSR target                                    |

### HALO (security layer)

| Layer            | Choice                                                                  |
|------------------|-------------------------------------------------------------------------|
| Event store      | `halo_events` table (Postgres) — type, severity, JSON metadata, user id |
| Ingestion        | `halo-log` edge function — Zod-validated, brute-force detection         |
| Decoy endpoint   | `halo-honeypot` edge function — returns plausible fake success           |
| Aggregation      | `halo-status` edge function — 0-100 threat score with time decay        |
| Admin actions    | `halo-clear` edge function — purge gated by `has_role('admin')`         |
| Real-time push   | Supabase Realtime (`postgres_changes` channel on `halo_events`)         |
| Dashboard UI     | React + Recharts (arc gauge SVG, timeline, distribution bars)           |
| Forensics        | Recharts bars + JSON export of filtered slice                           |
| Alerting         | Resend via the Lovable connector gateway — admin-only HTML emails       |
| Role storage     | `user_roles` table + `has_role(uid, role)` SECURITY DEFINER function    |
| Bootstrap admin  | `bootstrap_admin(uid)` — server-only function, succeeds only when no admin exists |
| Detection rules  | Brute-force (5× AUTH_FAILURE / 120s), anomalous transfer (> $10,000), social-engineering vector (new recipient + new bank + unusual amount) |
| Rate limiting    | `blocked_contexts` table + `preflightSignIn` server fn (15-min TTL)     |
| Honeypot path    | `/api/internal/accounts/export` (TanStack server route, plausible decoy) |
| Tamper evidence  | SHA-256 `export_hash` appended to forensics JSON exports                |
| Friction modal   | `transfer_proceed_tokens` + server-issued single-use proceed token       |
| Incident timeline| Realtime HALO tab — plain-English event narratives                       |
| Scan reporting   | `/api/security/scan-report` route surfacing OWASP ZAP summary           |
| MFA              | Supabase Auth TOTP — `/mfa/setup`, `/mfa/verify`; AAL2 required for `/halo` and `/admin` |
| Public posture   | `/security` route + footer link explaining controls to end users         |


