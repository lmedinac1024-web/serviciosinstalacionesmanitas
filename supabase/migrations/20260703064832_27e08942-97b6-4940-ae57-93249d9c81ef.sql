
-- Tabla de contraseñas visibles para admin
CREATE TABLE public.employee_passwords (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_plain TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT ON public.employee_passwords TO authenticated;
GRANT ALL ON public.employee_passwords TO service_role;
ALTER TABLE public.employee_passwords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins pueden ver contraseñas"
  ON public.employee_passwords FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Tabla de solicitudes de reset
CREATE TABLE public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  nota TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);
GRANT SELECT, INSERT ON public.password_reset_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede crear una solicitud (formulario público)
CREATE POLICY "Anyone can request reset"
  ON public.password_reset_requests FOR INSERT TO anon, authenticated
  WITH CHECK (estado = 'pendiente');

-- Solo admins pueden ver/actualizar
CREATE POLICY "Admins ven solicitudes"
  ON public.password_reset_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Admins resuelven solicitudes"
  ON public.password_reset_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
