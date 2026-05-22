
ALTER TABLE public.banks
  ADD COLUMN IF NOT EXISTS plaid_access_token text,
  ADD COLUMN IF NOT EXISTS plaid_account_id text,
  ADD COLUMN IF NOT EXISTS funding_source_url text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dwolla_customer_url text;
