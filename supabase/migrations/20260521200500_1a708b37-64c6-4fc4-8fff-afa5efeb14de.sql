
-- Roles
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "users view own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "admins manage roles"
  on public.user_roles for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  dob date,
  ssn_last4 text,
  address text,
  city text,
  state text,
  postal_code text,
  dwolla_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "view own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id);
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- Banks
create table public.banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  official_name text,
  account_type text not null default 'depository',
  subtype text default 'checking',
  mask text not null,
  current_balance numeric(14,2) not null default 0,
  available_balance numeric(14,2) not null default 0,
  shareable_id text not null default substr(md5(random()::text), 1, 12),
  created_at timestamptz not null default now()
);

alter table public.banks enable row level security;

create policy "own banks select" on public.banks for select to authenticated using (auth.uid() = user_id);
create policy "own banks insert" on public.banks for insert to authenticated with check (auth.uid() = user_id);
create policy "own banks update" on public.banks for update to authenticated using (auth.uid() = user_id);
create policy "own banks delete" on public.banks for delete to authenticated using (auth.uid() = user_id);

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_id uuid not null references public.banks(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null,
  category text not null default 'Other',
  type text not null default 'debit', -- debit or credit
  note text,
  transaction_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "own tx select" on public.transactions for select to authenticated using (auth.uid() = user_id);
create policy "own tx insert" on public.transactions for insert to authenticated with check (auth.uid() = user_id);
create policy "own tx update" on public.transactions for update to authenticated using (auth.uid() = user_id);
create policy "own tx delete" on public.transactions for delete to authenticated using (auth.uid() = user_id);

create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index transactions_bank_idx on public.transactions (bank_id, transaction_date desc);

-- HALO events
create table public.halo_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.halo_events enable row level security;

create policy "authed read halo events" on public.halo_events
  for select to authenticated using (true);

create policy "admins delete halo events" on public.halo_events
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create index halo_events_created_idx on public.halo_events (created_at desc);

alter publication supabase_realtime add table public.halo_events;

-- Auto-create profile + seeded demo data on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bank1 uuid;
  bank2 uuid;
begin
  insert into public.profiles (id, first_name, last_name, email, dob, ssn_last4, address, city, state, postal_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    nullif(new.raw_user_meta_data->>'dob','')::date,
    new.raw_user_meta_data->>'ssn_last4',
    new.raw_user_meta_data->>'address',
    new.raw_user_meta_data->>'city',
    new.raw_user_meta_data->>'state',
    new.raw_user_meta_data->>'postal_code'
  );

  -- default user role
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;

  -- seed two demo banks
  insert into public.banks (user_id, name, official_name, mask, current_balance, available_balance, subtype)
  values (new.id, 'Chase', 'Chase Total Checking', '4827', 4521.88, 4521.88, 'checking')
  returning id into bank1;

  insert into public.banks (user_id, name, official_name, mask, current_balance, available_balance, subtype)
  values (new.id, 'Bank of America', 'BoA Advantage Savings', '9102', 12840.42, 12840.42, 'savings')
  returning id into bank2;

  -- seed transactions
  insert into public.transactions (user_id, bank_id, name, amount, category, type, transaction_date) values
    (new.id, bank1, 'Whole Foods Market', 84.21, 'Groceries', 'debit', now() - interval '1 day'),
    (new.id, bank1, 'Shell Gas Station', 52.10, 'Transport', 'debit', now() - interval '2 day'),
    (new.id, bank1, 'Payroll Deposit', 3200.00, 'Income', 'credit', now() - interval '3 day'),
    (new.id, bank1, 'Netflix', 15.49, 'Entertainment', 'debit', now() - interval '4 day'),
    (new.id, bank1, 'Uber', 18.75, 'Transport', 'debit', now() - interval '5 day'),
    (new.id, bank2, 'Transfer In', 500.00, 'Transfer', 'credit', now() - interval '6 day'),
    (new.id, bank2, 'Amazon', 132.04, 'Shopping', 'debit', now() - interval '7 day'),
    (new.id, bank2, 'Starbucks', 6.25, 'Food & Drink', 'debit', now() - interval '8 day'),
    (new.id, bank2, 'Electric Bill', 142.30, 'Utilities', 'debit', now() - interval '9 day'),
    (new.id, bank2, 'Spotify', 9.99, 'Entertainment', 'debit', now() - interval '10 day');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
