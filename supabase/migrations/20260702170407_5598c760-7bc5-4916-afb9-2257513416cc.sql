ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS telegram_destinos_permitidos uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS telegram_destinos_favoritos uuid[] NOT NULL DEFAULT '{}';