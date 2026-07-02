
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS piso text,
  ADD COLUMN IF NOT EXISTS puerta text;
