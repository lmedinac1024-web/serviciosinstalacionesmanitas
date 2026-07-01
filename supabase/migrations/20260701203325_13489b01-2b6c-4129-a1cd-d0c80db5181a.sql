
-- === LIMPIAR DATOS ACTUALES ===
DELETE FROM public.jobs;
DELETE FROM public.user_settings;

-- === ROLES ===
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'empleado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manages roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === PROFILES (username visible) ===
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read profiles authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user updates own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- === CLIENTES ===
CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  telefono text,
  direccion text NOT NULL,
  piso text,
  puerta text,
  codigo_postal text,
  ciudad text,
  notas text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages clientes" ON public.clientes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === SERVICIOS ===
CREATE TABLE IF NOT EXISTS public.servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read servicios" ON public.servicios FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages servicios" ON public.servicios FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === TARIFAS POR EMPLEADO Y SERVICIO ===
CREATE TABLE IF NOT EXISTS public.tarifas_empleado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  servicio_id uuid NOT NULL REFERENCES public.servicios(id) ON DELETE CASCADE,
  precio numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empleado_id, servicio_id)
);
GRANT SELECT ON public.tarifas_empleado TO authenticated;
GRANT ALL ON public.tarifas_empleado TO service_role;
ALTER TABLE public.tarifas_empleado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empleado ve su tarifa" ON public.tarifas_empleado FOR SELECT TO authenticated
  USING (empleado_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manages tarifas" ON public.tarifas_empleado FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === TELEGRAM DESTINOS ===
CREATE TABLE IF NOT EXISTS public.telegram_destinos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  chat_id text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_destinos TO authenticated;
GRANT ALL ON public.telegram_destinos TO service_role;
ALTER TABLE public.telegram_destinos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read destinos" ON public.telegram_destinos FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manages destinos" ON public.telegram_destinos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === JOBS: reestructurar ===
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES public.servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empleado_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id);

-- rename user_id semantics: empleado_id is the worker; keep user_id as creador for compatibility
UPDATE public.jobs SET empleado_id = user_id WHERE empleado_id IS NULL;

-- reemplazar policy
DROP POLICY IF EXISTS "Users manage own jobs" ON public.jobs;
CREATE POLICY "empleado ve sus jobs" ON public.jobs FOR SELECT TO authenticated
  USING (empleado_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "empleado actualiza sus jobs" ON public.jobs FOR UPDATE TO authenticated
  USING (empleado_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (empleado_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manages jobs" ON public.jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- === user_settings: destino telegram default por empleado ===
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS telegram_destino_default_id uuid REFERENCES public.telegram_destinos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS username text;

-- === trigger auto-profile en signup ===
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname text;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1));
  INSERT INTO public.profiles (user_id, username, display_name)
  VALUES (NEW.id, uname, COALESCE(NEW.raw_user_meta_data->>'display_name', uname))
  ON CONFLICT (user_id) DO NOTHING;
  -- primer usuario = admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'empleado')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- === updated_at helper ===
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_clientes_updated ON public.clientes;
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_tarifas_updated ON public.tarifas_empleado;
CREATE TRIGGER trg_tarifas_updated BEFORE UPDATE ON public.tarifas_empleado
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
