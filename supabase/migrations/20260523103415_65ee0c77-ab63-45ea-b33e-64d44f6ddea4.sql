ALTER TABLE public.banks ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

-- Allow any authenticated user to become admin if NO admin exists yet (bootstrap-only).
CREATE OR REPLACE FUNCTION public.bootstrap_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count int;
BEGIN
  SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count > 0 THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, 'admin')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;