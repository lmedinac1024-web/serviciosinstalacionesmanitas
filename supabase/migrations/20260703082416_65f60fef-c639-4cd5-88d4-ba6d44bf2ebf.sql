
-- Remove direct table read access; force lookup through a role-checked function
REVOKE SELECT ON public.employee_passwords FROM authenticated;
DROP POLICY IF EXISTS "Admins can read employee passwords" ON public.employee_passwords;
DROP POLICY IF EXISTS "Admins read employee passwords" ON public.employee_passwords;
DROP POLICY IF EXISTS "admins_read_employee_passwords" ON public.employee_passwords;

CREATE OR REPLACE FUNCTION public.admin_list_employee_passwords()
RETURNS TABLE (user_id uuid, password_plain text)
LANGUAGE plpgsql
SECURITY DEFINER
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
