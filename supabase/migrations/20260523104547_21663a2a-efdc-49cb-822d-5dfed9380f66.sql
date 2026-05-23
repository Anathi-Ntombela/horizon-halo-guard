CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM (
      SELECT user_id FROM public.user_roles
      WHERE role = 'admin'
      ORDER BY created_at ASC
      LIMIT 1
    ) f WHERE f.user_id = _user_id
  );
$$;