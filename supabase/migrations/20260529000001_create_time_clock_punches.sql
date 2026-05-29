-- Tabela de registros de ponto (batidas de entrada/saída)
-- Colunas alinhadas com o código em RegistroScreen.tsx:
--   tipo: 'entrada' | 'saida'
--   timestamp_punch: momento exato do ponto
--   device_info: path da selfie no bucket punch-photos

CREATE TABLE IF NOT EXISTS public.time_clock_punches (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    UUID        REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  tipo           TEXT        CHECK (tipo IN ('entrada', 'saida')) NOT NULL,
  timestamp_punch TIMESTAMPTZ DEFAULT now() NOT NULL,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  device_info    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_clock_punches_employee_ts
  ON public.time_clock_punches (employee_id, timestamp_punch DESC);

-- RLS
ALTER TABLE public.time_clock_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.time_clock_punches
  FOR ALL TO service_role USING (true) WITH CHECK (true);
