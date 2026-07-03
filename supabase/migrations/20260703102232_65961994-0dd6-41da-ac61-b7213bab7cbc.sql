GRANT SELECT ON public.employee_passwords TO authenticated;

DROP POLICY IF EXISTS "Admins pueden ver contraseñas" ON public.employee_passwords;
DROP POLICY IF EXISTS "Admins can read employee passwords" ON public.employee_passwords;
DROP POLICY IF EXISTS "Admins read employee passwords" ON public.employee_passwords;
DROP POLICY IF EXISTS "admins_read_employee_passwords" ON public.employee_passwords;

CREATE POLICY "Admins pueden ver contraseñas"
  ON public.employee_passwords
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.admin_list_employee_passwords()
RETURNS TABLE (user_id uuid, password_plain text)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar contraseñas de empleados';
  END IF;
  RETURN QUERY SELECT ep.user_id, ep.password_plain FROM public.employee_passwords ep;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_employee_passwords() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_employee_passwords() TO authenticated;