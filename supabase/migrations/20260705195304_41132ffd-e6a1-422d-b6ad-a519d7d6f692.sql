
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS direccion_completa text,
  ADD COLUMN IF NOT EXISTS telefonos_extra text,
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS numero_operacion text,
  ADD COLUMN IF NOT EXISTS numero_servicio text,
  ADD COLUMN IF NOT EXISTS imagen_original_url text,
  ADD COLUMN IF NOT EXISTS texto_ocr_original text,
  ADD COLUMN IF NOT EXISTS creado_por uuid;

CREATE OR REPLACE FUNCTION public.guard_servicios_field_tamper()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE is_admin boolean;
BEGIN
  is_admin := public.has_role(auth.uid(),'admin')
           OR public.has_role(auth.uid(),'super_admin')
           OR public.has_role(auth.uid(),'supervisor');
  IF is_admin THEN RETURN NEW; END IF;

  IF NEW.importe IS DISTINCT FROM OLD.importe
    OR NEW.precio_llegada IS DISTINCT FROM OLD.precio_llegada
    OR NEW.direccion IS DISTINCT FROM OLD.direccion
    OR NEW.numero IS DISTINCT FROM OLD.numero
    OR NEW.piso IS DISTINCT FROM OLD.piso
    OR NEW.puerta IS DISTINCT FROM OLD.puerta
    OR NEW.codigo_postal IS DISTINCT FROM OLD.codigo_postal
    OR NEW.ciudad IS DISTINCT FROM OLD.ciudad
    OR NEW.direccion_completa IS DISTINCT FROM OLD.direccion_completa
    OR NEW.direccion_validada_llegada IS DISTINCT FROM OLD.direccion_validada_llegada
    OR NEW.distancia_llegada_metros IS DISTINCT FROM OLD.distancia_llegada_metros
    OR NEW.empleado_id IS DISTINCT FROM OLD.empleado_id
    OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
    OR NEW.tipo_servicio IS DISTINCT FROM OLD.tipo_servicio
    OR NEW.fecha IS DISTINCT FROM OLD.fecha
    OR NEW.hora_programada IS DISTINCT FROM OLD.hora_programada
    OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio
    OR NEW.hora_fin IS DISTINCT FROM OLD.hora_fin
    OR NEW.eliminado_logico IS DISTINCT FROM OLD.eliminado_logico
    OR NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion
    OR NEW.referencia IS DISTINCT FROM OLD.referencia
    OR NEW.numero_operacion IS DISTINCT FROM OLD.numero_operacion
    OR NEW.numero_servicio IS DISTINCT FROM OLD.numero_servicio
    OR NEW.telefonos_extra IS DISTINCT FROM OLD.telefonos_extra
  THEN
    RAISE EXCEPTION 'Solo un administrador puede modificar estos campos del servicio';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
      (OLD.estado = 'pendiente'::job_status AND NEW.estado IN ('en_proceso'::job_status,'cancelado_cliente'::job_status,'cancelado_direccion'::job_status,'cancelado_no_estaba'::job_status,'cancelado_otro'::job_status))
      OR (OLD.estado = 'en_proceso'::job_status AND NEW.estado IN ('realizado'::job_status,'cancelado_cliente'::job_status,'cancelado_direccion'::job_status,'cancelado_no_estaba'::job_status,'cancelado_otro'::job_status))
    ) THEN
      RAISE EXCEPTION 'Transición de estado no permitida para el empleado (% -> %)', OLD.estado, NEW.estado;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_anulacion_servicio()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE is_admin boolean;
BEGIN
  IF NEW.eliminado_logico IS DISTINCT FROM OLD.eliminado_logico THEN
    is_admin := public.has_role(auth.uid(), 'admin')
             OR public.has_role(auth.uid(), 'super_admin')
             OR public.has_role(auth.uid(), 'supervisor');
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
END $function$;

CREATE OR REPLACE FUNCTION public.admin_list_employee_passwords()
 RETURNS TABLE(user_id uuid, password_plain text)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'supervisor')
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar contraseñas de empleados';
  END IF;
  RETURN QUERY SELECT ep.user_id, ep.password_plain FROM public.employee_passwords ep;
END $function$;

DROP POLICY IF EXISTS "Admins ver ordenes" ON storage.objects;
CREATE POLICY "Admins ver ordenes"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ordenes-imagenes'
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor')
    )
  );

DROP POLICY IF EXISTS "Admins subir ordenes" ON storage.objects;
CREATE POLICY "Admins subir ordenes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ordenes-imagenes'
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'super_admin')
      OR public.has_role(auth.uid(),'supervisor')
    )
  );
