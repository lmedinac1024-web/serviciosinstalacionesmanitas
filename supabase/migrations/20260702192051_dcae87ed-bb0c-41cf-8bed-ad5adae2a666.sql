
-- 1. handle_new_user: only bootstrap admin. No auto-empleado role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uname text;
BEGIN
  uname := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1));
  INSERT INTO public.profiles (user_id, username, display_name)
  VALUES (NEW.id, uname, COALESCE(NEW.raw_user_meta_data->>'display_name', uname))
  ON CONFLICT (user_id) DO NOTHING;
  -- Solo el PRIMER usuario obtiene rol admin automaticamente.
  -- El resto de empleados los crea el admin desde el panel (adminCreateEmployee).
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

-- 2. Trigger to prevent employees from self-granting Telegram destinations.
-- Only admin/super_admin can modify telegram_destinos_permitidos and telegram_destinos_favoritos.
CREATE OR REPLACE FUNCTION public.guard_user_settings_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_admin boolean;
  old_permitidos jsonb;
  old_favoritos jsonb;
  new_permitidos jsonb;
  new_favoritos jsonb;
BEGIN
  is_admin := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin');
  IF is_admin THEN
    RETURN NEW;
  END IF;

  new_permitidos := to_jsonb(NEW.telegram_destinos_permitidos);
  new_favoritos := to_jsonb(NEW.telegram_destinos_favoritos);

  IF TG_OP = 'INSERT' THEN
    -- Non-admin cannot create settings with any telegram destinations pre-populated.
    IF new_permitidos IS NOT NULL AND jsonb_typeof(new_permitidos) = 'array' AND jsonb_array_length(new_permitidos) > 0 THEN
      RAISE EXCEPTION 'Solo un administrador puede asignar destinos Telegram permitidos';
    END IF;
  ELSE
    old_permitidos := to_jsonb(OLD.telegram_destinos_permitidos);
    old_favoritos := to_jsonb(OLD.telegram_destinos_favoritos);
    IF COALESCE(new_permitidos, '[]'::jsonb) IS DISTINCT FROM COALESCE(old_permitidos, '[]'::jsonb) THEN
      RAISE EXCEPTION 'Solo un administrador puede modificar los destinos Telegram permitidos';
    END IF;
    -- Favoritos must be a subset of permitidos (which the user cannot change).
    IF new_favoritos IS NOT NULL AND jsonb_typeof(new_favoritos) = 'array' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(new_favoritos) f
        WHERE NOT (f IN (SELECT jsonb_array_elements_text(COALESCE(new_permitidos, '[]'::jsonb))))
      ) THEN
        RAISE EXCEPTION 'Los favoritos solo pueden incluir destinos permitidos';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_user_settings_telegram ON public.user_settings;
CREATE TRIGGER trg_guard_user_settings_telegram
BEFORE INSERT OR UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.guard_user_settings_telegram();
