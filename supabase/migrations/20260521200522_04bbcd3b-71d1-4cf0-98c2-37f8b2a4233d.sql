
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
-- has_role must remain executable by authenticated role because RLS policies call it
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
