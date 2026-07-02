
-- 1) has_role -> SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 2) clientes: drop broad read, add scoped
DROP POLICY IF EXISTS "authenticated read clientes" ON public.clientes;
CREATE POLICY "read clientes scoped" ON public.clientes
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.servicios s
    WHERE s.cliente_id = clientes.id AND s.empleado_id = auth.uid()
  )
);

-- 3) profiles: drop broad read, add owner+admin
DROP POLICY IF EXISTS "read profiles authenticated" ON public.profiles;
CREATE POLICY "read own or admin profile" ON public.profiles
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

-- 4) telegram_destinos: drop broad read, add scoped
DROP POLICY IF EXISTS "authenticated read destinos" ON public.telegram_destinos;
CREATE POLICY "read destinos scoped" ON public.telegram_destinos
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.user_settings us
    WHERE us.user_id = auth.uid()
      AND telegram_destinos.id = ANY(us.telegram_destinos_permitidos)
  )
);
