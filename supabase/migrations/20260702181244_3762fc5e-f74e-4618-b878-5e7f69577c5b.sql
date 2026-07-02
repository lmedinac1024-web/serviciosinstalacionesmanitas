
DELETE FROM public.jobs;

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_servicio_id_fkey;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS servicio_id;

DROP TABLE IF EXISTS public.servicios CASCADE;

ALTER TABLE public.jobs DROP COLUMN IF EXISTS total;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS cantidad;

ALTER TABLE public.jobs RENAME TO servicios;

ALTER TABLE public.servicios RENAME COLUMN hora TO hora_programada;
ALTER TABLE public.servicios RENAME COLUMN telefono TO telefono_cliente;
ALTER TABLE public.servicios RENAME COLUMN servicio TO tipo_servicio;
ALTER TABLE public.servicios RENAME COLUMN lat TO direccion_lat;
ALTER TABLE public.servicios RENAME COLUMN lng TO direccion_lng;
ALTER TABLE public.servicios RENAME COLUMN finalizado_at TO hora_fin;
ALTER TABLE public.servicios RENAME COLUMN llegada_lat TO gps_llegada_lat;
ALTER TABLE public.servicios RENAME COLUMN llegada_lng TO gps_llegada_lng;
ALTER TABLE public.servicios RENAME COLUMN llegada_validada TO direccion_validada_llegada;
ALTER TABLE public.servicios RENAME COLUMN llegada_distancia_m TO distancia_llegada_metros;
ALTER TABLE public.servicios RENAME COLUMN created_at TO creado_en;

ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS referencia TEXT;
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS hora_llegada TIMESTAMPTZ;
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS foto_cancelacion TEXT;
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS gps_final_lat NUMERIC(10,7);
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS gps_final_lng NUMERIC(10,7);
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS gps_cancelacion_lat NUMERIC(10,7);
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS gps_cancelacion_lng NUMERIC(10,7);
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS telegram_cancel_msg_id TEXT;

-- ganancia calculada (usando IN con enum, inmutable)
ALTER TABLE public.servicios ADD COLUMN IF NOT EXISTS ganancia NUMERIC(10,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN estado = 'realizado'::job_status THEN importe + precio_llegada
      WHEN estado IN ('cancelado_cliente'::job_status,'cancelado_no_estaba'::job_status,'cancelado_direccion'::job_status,'cancelado_otro'::job_status) AND direccion_validada_llegada THEN precio_llegada
      ELSE 0::numeric
    END
  ) STORED;

ALTER INDEX IF EXISTS idx_jobs_user_estado RENAME TO idx_servicios_user_estado;
ALTER INDEX IF EXISTS idx_jobs_user_fecha RENAME TO idx_servicios_user_fecha;
ALTER INDEX IF EXISTS idx_jobs_user_finalizado RENAME TO idx_servicios_user_hora_fin;
ALTER TABLE public.servicios RENAME CONSTRAINT jobs_pkey TO servicios_pkey;
ALTER TABLE public.servicios RENAME CONSTRAINT jobs_user_id_fkey TO servicios_user_id_fkey;
ALTER TABLE public.servicios RENAME CONSTRAINT jobs_cliente_id_fkey TO servicios_cliente_id_fkey;
ALTER TABLE public.servicios RENAME CONSTRAINT jobs_empleado_id_fkey TO servicios_empleado_id_fkey;
ALTER TABLE public.servicios RENAME CONSTRAINT jobs_assigned_by_fkey TO servicios_assigned_by_fkey;

DROP POLICY IF EXISTS "admin manages jobs" ON public.servicios;
DROP POLICY IF EXISTS "empleado ve sus jobs" ON public.servicios;
DROP POLICY IF EXISTS "empleado actualiza sus jobs" ON public.servicios;

CREATE POLICY "admin gestiona servicios" ON public.servicios
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "empleado ve sus servicios" ON public.servicios
  FOR SELECT TO authenticated
  USING (empleado_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "empleado actualiza sus servicios" ON public.servicios
  FOR UPDATE TO authenticated
  USING (empleado_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (empleado_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.servicios TO authenticated;
GRANT ALL ON public.servicios TO service_role;

CREATE OR REPLACE FUNCTION public.set_actualizado_en()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.actualizado_en = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS servicios_set_updated_at ON public.servicios;
DROP TRIGGER IF EXISTS servicios_set_actualizado_en ON public.servicios;
CREATE TRIGGER servicios_set_actualizado_en
  BEFORE UPDATE ON public.servicios
  FOR EACH ROW
  EXECUTE FUNCTION public.set_actualizado_en();
