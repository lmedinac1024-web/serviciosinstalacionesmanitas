
-- 1) Trigger para impedir tampering de campos sensibles en servicios por empleados
CREATE OR REPLACE FUNCTION public.guard_servicios_field_tamper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin');
  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Empleados NO pueden modificar campos financieros / de validación / dirección
  IF NEW.importe IS DISTINCT FROM OLD.importe
    OR NEW.ganancia IS DISTINCT FROM OLD.ganancia
    OR NEW.precio_llegada IS DISTINCT FROM OLD.precio_llegada
    OR NEW.direccion IS DISTINCT FROM OLD.direccion
    OR NEW.piso IS DISTINCT FROM OLD.piso
    OR NEW.puerta IS DISTINCT FROM OLD.puerta
    OR NEW.codigo_postal IS DISTINCT FROM OLD.codigo_postal
    OR NEW.ciudad IS DISTINCT FROM OLD.ciudad
    OR NEW.direccion_validada_llegada IS DISTINCT FROM OLD.direccion_validada_llegada
    OR NEW.distancia_llegada_metros IS DISTINCT FROM OLD.distancia_llegada_metros
    OR NEW.empleado_id IS DISTINCT FROM OLD.empleado_id
    OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
    OR NEW.tipo_servicio IS DISTINCT FROM OLD.tipo_servicio
    OR NEW.fecha IS DISTINCT FROM OLD.fecha
    OR NEW.hora_programada IS DISTINCT FROM OLD.hora_programada
    OR NEW.eliminado_logico IS DISTINCT FROM OLD.eliminado_logico
    OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
    OR NEW.referencia IS DISTINCT FROM OLD.referencia
  THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar estos campos del servicio';
  END IF;

  -- Empleados sólo pueden avanzar el estado siguiendo la máquina permitida
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
      (OLD.estado = 'pendiente'  AND NEW.estado IN ('en_curso','cancelado_cliente','cancelado_direccion','cancelado_no_estaba','cancelado_otro'))
      OR (OLD.estado = 'en_curso' AND NEW.estado IN ('realizado','cancelado_cliente','cancelado_direccion','cancelado_no_estaba','cancelado_otro'))
    ) THEN
      RAISE EXCEPTION 'Transición de estado no permitida para el empleado (% -> %)', OLD.estado, NEW.estado;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_servicios_field_tamper ON public.servicios;
CREATE TRIGGER trg_guard_servicios_field_tamper
BEFORE UPDATE ON public.servicios
FOR EACH ROW EXECUTE FUNCTION public.guard_servicios_field_tamper();

-- 2) Revocar EXECUTE público de las funciones SECURITY DEFINER (siguen usables por triggers)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_anulacion_servicio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_user_settings_telegram() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_servicios_field_tamper() FROM PUBLIC, anon, authenticated;

-- has_role sí debe seguir siendo llamable por usuarios autenticados (lo usan las políticas RLS)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;

-- 3) Cerrar auto-signup: nuevos usuarios NO reciben ningún rol salvo el primer admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uname text;
  has_any_admin boolean;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1));
  INSERT INTO public.profiles (user_id, username, display_name)
  VALUES (NEW.id, uname, COALESCE(NEW.raw_user_meta_data->>'display_name', uname))
  ON CONFLICT (user_id) DO NOTHING;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_any_admin;
  IF NOT has_any_admin THEN
    -- Bootstrap: primer usuario es admin
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  -- El resto NO recibe rol automáticamente. Admin debe asignarlo desde el panel.
  RETURN NEW;
END $$;

-- 4) Asegurar trigger anti-self-assign de destinos Telegram (por si no estaba activo)
DROP TRIGGER IF EXISTS trg_guard_user_settings_telegram ON public.user_settings;
CREATE TRIGGER trg_guard_user_settings_telegram
BEFORE INSERT OR UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.guard_user_settings_telegram();
