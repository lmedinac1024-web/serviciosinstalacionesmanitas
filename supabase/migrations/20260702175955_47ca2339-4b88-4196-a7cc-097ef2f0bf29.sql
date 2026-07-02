
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS precio_llegada numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS llegada_validada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS llegada_lat numeric(10,7),
  ADD COLUMN IF NOT EXISTS llegada_lng numeric(10,7),
  ADD COLUMN IF NOT EXISTS llegada_distancia_m integer,
  ADD COLUMN IF NOT EXISTS servicio_id uuid REFERENCES public.servicios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observaciones text;
