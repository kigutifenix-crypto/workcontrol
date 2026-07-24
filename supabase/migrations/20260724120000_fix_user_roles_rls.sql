-- Migration: Allow authenticated users and admins to insert, update, and delete in user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "User roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisors manage user roles" ON public.user_roles;
CREATE POLICY "Supervisors manage user roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_supervisor(auth.uid())) WITH CHECK (public.is_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert user roles" ON public.user_roles;
CREATE POLICY "Authenticated insert user roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update user roles" ON public.user_roles;
CREATE POLICY "Authenticated update user roles" ON public.user_roles FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated delete user roles" ON public.user_roles;
CREATE POLICY "Authenticated delete user roles" ON public.user_roles FOR DELETE TO authenticated USING (true);
