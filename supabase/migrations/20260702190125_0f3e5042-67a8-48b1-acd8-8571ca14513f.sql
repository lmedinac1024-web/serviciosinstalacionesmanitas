
-- 1) Nuevos campos para anulación (soft delete admin) y referencia autogenerada
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS eliminado_logico boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulado_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fecha_anulacion timestamptz;

-- 2) Recalcular columna ganancia:
--    - Anulado (eliminado_logico) => 0
--    - Realizado => importe + precio_llegada
--    - Cancelado por trabajador => precio_llegada (SIEMPRE, sin exigir GPS)
--    - Resto => 0
ALTER TABLE public.servicios DROP COLUMN IF EXISTS ganancia;
ALTER TABLE public.servicios ADD COLUMN ganancia numeric(10,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN eliminado_logico THEN 0
      WHEN estado = 'realizado'::job_status THEN importe + precio_llegada
      WHEN estado IN (
        'cancelado_cliente'::job_status,
        'cancelado_no_estaba'::job_status,
        'cancelado_direccion'::job_status,
        'cancelado_otro'::job_status
      ) THEN precio_llegada
      ELSE 0
    END
  ) STORED;

-- 3) Rol super_admin
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'super_admin') THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

-- 4) Referencia autogenerada: SVH-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION public.set_referencia_servicio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referencia IS NULL OR NEW.referencia = '' THEN
    NEW.referencia := 'SVH-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(NEW.id::text,'-',''),1,6));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS servicios_set_referencia ON public.servicios;
CREATE TRIGGER servicios_set_referencia
  BEFORE INSERT ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION public.set_referencia_servicio();

-- 5) Solo admin/super_admin puede anular (marcar eliminado_logico)
--    Trigger que impide a empleados marcar eliminado_logico y autocompleta metadatos
CREATE OR REPLACE FUNCTION public.guard_anulacion_servicio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF NEW.eliminado_logico IS DISTINCT FROM OLD.eliminado_logico THEN
    is_admin := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin');
    IF NOT is_admin THEN
      RAISE EXCEPTION 'Solo administradores pueden anular servicios';
    END IF;
    IF NEW.eliminado_logico = true THEN
      IF NEW.motivo_anulacion IS NULL OR trim(NEW.motivo_anulacion) = '' THEN
        RAISE EXCEPTION 'motivo_anulacion es obligatorio al anular';
      END IF;
      NEW.anulado_por := auth.uid();
      NEW.fecha_anulacion := now();
    ELSE
      NEW.motivo_anulacion := NULL;
      NEW.anulado_por := NULL;
      NEW.fecha_anulacion := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS servicios_guard_anulacion ON public.servicios;
CREATE TRIGGER servicios_guard_anulacion
  BEFORE UPDATE ON public.servicios
  FOR EACH ROW EXECUTE FUNCTION public.guard_anulacion_servicio();

-- 6) Índice útil para listados
CREATE INDEX IF NOT EXISTS idx_servicios_eliminado ON public.servicios(eliminado_logico, empleado_id, fecha);
