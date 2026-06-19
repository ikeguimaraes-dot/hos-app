-- ═══════════════════════════════════════════════════════════════════════════
-- punch_adjustment_requests — solicitações de ajuste de ponto
-- 3 RPCs: create_punch_adjustment (anon), get_my_adjustment_requests (anon),
--         resolve_punch_adjustment (service_role — KPH OS)
-- Timezone: America/Sao_Paulo explícita em tudo.
-- Validação: apenas semana corrente (seg-sex BRT), sem duplicata pendente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tabela ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS punch_adjustment_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  data_referencia       date NOT NULL,
  horario_saida_almoco  time NOT NULL,
  horario_retorno_almoco time NOT NULL,
  motivo                text NOT NULL CHECK (motivo IN (
                          'Esqueci de registrar',
                          'Estava em atendimento',
                          'Sistema indisponível',
                          'Saí para entrega/serviço externo',
                          'Outro'
                        )),
  status                text NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  aprovado_por          uuid REFERENCES auth.users(id),
  aprovado_em           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_par_employee_data
  ON punch_adjustment_requests (employee_id, data_referencia);

CREATE INDEX IF NOT EXISTS idx_par_status
  ON punch_adjustment_requests (status);

ALTER TABLE punch_adjustment_requests ENABLE ROW LEVEL SECURITY;

-- RLS permissiva: anon pode inserir e ler (validação via RPC SECURITY DEFINER)
CREATE POLICY "anon_all_punch_adj" ON punch_adjustment_requests
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── RPC: create_punch_adjustment ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_punch_adjustment(
  p_employee_id          uuid,
  p_data_referencia      date,
  p_horario_saida_almoco time,
  p_horario_retorno_almoco time,
  p_motivo               text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id     uuid;
  v_dow    int;
  v_today  date;
  v_mon    date;
  v_fri    date;
BEGIN
  -- Dia da semana em SP (0=dom, 1=seg … 6=sab)
  v_today := CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo';
  v_dow   := EXTRACT(DOW FROM v_today)::int;

  -- Início (segunda) e fim (sexta) da semana corrente em SP
  v_mon := v_today - ((v_dow + 6) % 7);
  v_fri := v_mon + 4;

  -- Validação: apenas dias úteis da semana corrente
  IF p_data_referencia < v_mon OR p_data_referencia > v_fri THEN
    RAISE EXCEPTION 'Ajuste permitido apenas para dias úteis da semana corrente (% a %)', v_mon, v_fri;
  END IF;

  -- Validação: sem solicitação pendente para o mesmo dia
  IF EXISTS (
    SELECT 1 FROM punch_adjustment_requests
    WHERE employee_id = p_employee_id
      AND data_referencia = p_data_referencia
      AND status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'Já existe uma solicitação pendente para %', p_data_referencia;
  END IF;

  -- Validação: retorno após saída
  IF p_horario_retorno_almoco <= p_horario_saida_almoco THEN
    RAISE EXCEPTION 'Horário de retorno deve ser posterior à saída para almoço';
  END IF;

  INSERT INTO punch_adjustment_requests (
    employee_id, data_referencia,
    horario_saida_almoco, horario_retorno_almoco,
    motivo, status
  ) VALUES (
    p_employee_id, p_data_referencia,
    p_horario_saida_almoco, p_horario_retorno_almoco,
    p_motivo, 'pendente'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_punch_adjustment(uuid, date, time, time, text) TO anon;
GRANT EXECUTE ON FUNCTION create_punch_adjustment(uuid, date, time, time, text) TO authenticated;

-- ── RPC: get_my_adjustment_requests ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_adjustment_requests(
  p_employee_id uuid
)
RETURNS TABLE (
  id                     uuid,
  data_referencia        date,
  horario_saida_almoco   text,
  horario_retorno_almoco text,
  motivo                 text,
  status                 text,
  created_at             text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.data_referencia,
    TO_CHAR(r.horario_saida_almoco, 'HH24:MI')   AS horario_saida_almoco,
    TO_CHAR(r.horario_retorno_almoco, 'HH24:MI') AS horario_retorno_almoco,
    r.motivo,
    r.status,
    TO_CHAR(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at
  FROM punch_adjustment_requests r
  WHERE r.employee_id = p_employee_id
  ORDER BY r.created_at DESC
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_adjustment_requests(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_my_adjustment_requests(uuid) TO authenticated;

-- ── RPC: resolve_punch_adjustment ─────────────────────────────────────────
-- Chamada pelo KPH OS via service_role. Atualiza status e opcionalmente
-- insere 2 pontos retroativos (saida almoço + retorno almoço) em SP time.

CREATE OR REPLACE FUNCTION resolve_punch_adjustment(
  p_request_id    uuid,
  p_aprovado_por  uuid,
  p_status        text,        -- 'aprovado' | 'rejeitado'
  p_inserir_punches boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req punch_adjustment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM punch_adjustment_requests
  WHERE id = p_request_id AND status = 'pendente'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação % não encontrada ou já resolvida', p_request_id;
  END IF;

  UPDATE punch_adjustment_requests
  SET
    status      = p_status,
    aprovado_por = p_aprovado_por,
    aprovado_em  = now()
  WHERE id = p_request_id;

  -- Insere pontos retroativos apenas se aprovado e solicitado
  IF p_status = 'aprovado' AND p_inserir_punches THEN
    INSERT INTO time_clock_punches (employee_id, tipo, timestamp_punch, aprovado)
    VALUES
      -- Saída para almoço: data_referencia + horario_saida_almoco em SP → UTC
      (
        v_req.employee_id,
        'intervalo_inicio',
        (v_req.data_referencia::text || ' ' || v_req.horario_saida_almoco::text)::timestamp
          AT TIME ZONE 'America/Sao_Paulo',
        true
      ),
      -- Retorno do almoço
      (
        v_req.employee_id,
        'intervalo_fim',
        (v_req.data_referencia::text || ' ' || v_req.horario_retorno_almoco::text)::timestamp
          AT TIME ZONE 'America/Sao_Paulo',
        true
      );
  END IF;
END;
$$;

-- Apenas service_role pode resolver (KPH OS usa createServiceClient())
GRANT EXECUTE ON FUNCTION resolve_punch_adjustment(uuid, uuid, text, boolean) TO service_role;
