-- Block list for brute force / suspicious sign-in contexts
CREATE TABLE public.blocked_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context text NOT NULL,
  blocked_until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_blocked_contexts_lookup ON public.blocked_contexts (context, blocked_until);

ALTER TABLE public.blocked_contexts ENABLE ROW LEVEL SECURITY;

-- Admins can read the block list; nobody can mutate from the client (service role only).
CREATE POLICY "admins read blocked_contexts" ON public.blocked_contexts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Short-lived confirmation tokens for the social-engineering friction modal.
CREATE TABLE public.transfer_proceed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  context_hash text NOT NULL,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transfer_proceed_tokens_user ON public.transfer_proceed_tokens (user_id, expires_at);

ALTER TABLE public.transfer_proceed_tokens ENABLE ROW LEVEL SECURITY;

-- Owners can read their own tokens (used to inspect outstanding warnings); mutation is service-role only.
CREATE POLICY "users read own proceed tokens" ON public.transfer_proceed_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);