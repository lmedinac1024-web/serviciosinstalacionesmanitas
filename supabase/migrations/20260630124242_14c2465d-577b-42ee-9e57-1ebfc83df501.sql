
-- Enum de estados
CREATE TYPE public.job_status AS ENUM (
  'pendiente',
  'en_proceso',
  'realizado',
  'cancelado_cliente',
  'cancelado_no_estaba',
  'cancelado_direccion',
  'cancelado_otro'
);

-- Trabajos
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora time,
  cliente text NOT NULL,
  servicio text,
  direccion text NOT NULL,
  piso text,
  puerta text,
  codigo_postal text,
  ciudad text,
  telefono text,
  estado public.job_status NOT NULL DEFAULT 'pendiente',
  motivo_cancelacion text,
  importe numeric(10,2) NOT NULL DEFAULT 0,
  cantidad integer NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  total numeric(10,2) GENERATED ALWAYS AS (importe * cantidad) STORED,
  foto_inicio text,
  foto_final text,
  observaciones text,
  telegram_inicio_msg_id text,
  telegram_final_msg_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalizado_at timestamptz
);

CREATE INDEX idx_jobs_user_fecha ON public.jobs(user_id, fecha DESC, hora);
CREATE INDEX idx_jobs_user_estado ON public.jobs(user_id, estado);
CREATE INDEX idx_jobs_user_finalizado ON public.jobs(user_id, finalizado_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own jobs" ON public.jobs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ajustes por usuario (chat_id de Telegram, etc.)
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings" ON public.user_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage RLS para bucket job-photos (se crea con tool aparte)
CREATE POLICY "Users read own job photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users upload own job photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own job photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own job photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'job-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
