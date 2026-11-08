CREATE OR REPLACE FUNCTION public.guard_minimum_service_price()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.importe IS DISTINCT FROM OLD.importe)
     AND (NEW.importe IS NULL OR NEW.importe < 10) THEN
    RAISE EXCEPTION 'El precio del servicio debe ser mayor o igual a 10 €';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER servicios_minimum_price BEFORE INSERT OR UPDATE OF importe ON public.servicios
FOR EACH ROW EXECUTE FUNCTION public.guard_minimum_service_price();