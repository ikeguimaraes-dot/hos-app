-- ============================================================
-- HOS App — RPCs com SECURITY DEFINER
-- Projeto: iqgrvptrtphvbmvrqntm | 2026-06-07
--
-- Aliases aplicados (tabela real → interface TypeScript):
--   vacations: start_date→inicio_gozo, end_date→fim_gozo
--              acquisitive_period_start→periodo_aquisitivo_inicio
--              acquisitive_period_end→periodo_aquisitivo_fim
--              days_entitled→dias_direito, days_taken→dias_gozados
--              abono_days→dias_vendidos
--   climate_survey_questions: pergunta→texto
--   climate_surveys: data_fim→prazo
--   absences: data→date, tipo→type, motivo→reason
--   warnings: data→date, nivel→level, descricao→description
--   transport_vouchers: total_bruto→valor_empresa
-- ============================================================

-- ============================================================
-- 1. get_employee_profile — auth.ts Step 3
-- ============================================================
CREATE OR REPLACE FUNCTION get_employee_profile(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT row_to_json(e)
  FROM (
    SELECT id, nome, sobrenome, cpf, departamento, funcao,
           email, data_admissao, ativo, status_rh, photo_url, unit_id
    FROM employees
    WHERE id = p_employee_id
    LIMIT 1
  ) e;
$$;

-- ============================================================
-- 2. get_my_payslips — FinanceiroScreen tab Holerites
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_payslips(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(p ORDER BY p.competencia DESC), '[]'::json)
  FROM payslips p
  WHERE p.employee_id = p_employee_id;
$$;

-- ============================================================
-- 3. get_my_gorjetas — FinanceiroScreen tab Gorjeta
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_gorjetas(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(g ORDER BY g.ano DESC, g.mes DESC), '[]'::json)
  FROM gorjeta_distribuicao g
  WHERE g.employee_id = p_employee_id;
$$;

-- ============================================================
-- 4. get_my_hour_bank — FinanceiroScreen tab Banco de Horas
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_hour_bank(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(h ORDER BY h.competencia DESC), '[]'::json)
  FROM hour_bank h
  WHERE h.employee_id = p_employee_id;
$$;

-- ============================================================
-- 5. get_my_payments — FinanceiroScreen tab Adiantamentos
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_payments(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(c ORDER BY c.competencia DESC), '[]'::json)
  FROM contractor_payments c
  WHERE c.contractor_id = p_employee_id;
$$;

-- ============================================================
-- 6. get_my_vacations — FeriasScreen
-- Aliases: real cols (inglês) → interface (português)
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_vacations(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id',                       v.id,
        'periodo_aquisitivo_inicio', v.acquisitive_period_start,
        'periodo_aquisitivo_fim',    v.acquisitive_period_end,
        'inicio_gozo',               v.start_date,
        'fim_gozo',                  v.end_date,
        'dias_direito',              v.days_entitled,
        'dias_gozados',              v.days_taken,
        'dias_vendidos',             v.abono_days,
        'status',                    v.status
      )
      ORDER BY v.acquisitive_period_start DESC NULLS LAST
    ),
    '[]'::json
  )
  FROM vacations v
  WHERE v.employee_id = p_employee_id;
$$;

-- ============================================================
-- 7. get_my_registro — RegistroScreen (todos os dados estáticos)
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_registro(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'time_records', (
      SELECT COALESCE(json_agg(t ORDER BY t.periodo DESC), '[]'::json)
      FROM time_records t
      WHERE t.employee_id = p_employee_id
    ),
    'overtime', (
      SELECT COALESCE(json_agg(o ORDER BY o.date DESC), '[]'::json)
      FROM overtime_records o
      WHERE o.employee_id = p_employee_id
    ),
    'absences', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',           a.id,
            'date',         a.data,
            'type',         a.tipo,
            'reason',       a.motivo,
            'score_impact', a.score_impact,
            'atestado_path',a.atestado_path
          )
          ORDER BY a.data DESC
        ),
        '[]'::json
      )
      FROM absences a
      WHERE a.employee_id = p_employee_id
    ),
    'warnings', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',            w.id,
            'date',          w.data,
            'level',         w.nivel,
            'description',   w.descricao,
            'score_impact',  w.score_impact,
            'documento_path',w.documento_path
          )
          ORDER BY w.data DESC
        ),
        '[]'::json
      )
      FROM warnings w
      WHERE w.employee_id = p_employee_id
    ),
    'tips', (
      SELECT COALESCE(json_agg(tp ORDER BY tp.periodo DESC), '[]'::json)
      FROM tips_records tp
      WHERE tp.employee_id = p_employee_id
    ),
    'transport', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',                  tv.id,
            'periodo',             tv.periodo,
            'dias_uteis',          tv.dias_uteis,
            'valor_diario',        tv.valor_diario,
            'desconto_funcionario',tv.desconto_funcionario,
            'valor_empresa',       tv.total_bruto
          )
          ORDER BY tv.periodo DESC
        ),
        '[]'::json
      )
      FROM transport_vouchers tv
      WHERE tv.employee_id = p_employee_id
    )
  );
$$;

-- ============================================================
-- 8. get_my_last_punch — RegistroScreen: último ponto do dia
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_last_punch(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT row_to_json(p)
  FROM (
    SELECT tipo, timestamp_punch
    FROM time_clock_punches
    WHERE employee_id = p_employee_id
      AND timestamp_punch >= CURRENT_DATE::timestamptz
    ORDER BY timestamp_punch DESC
    LIMIT 1
  ) p;
$$;

-- ============================================================
-- 9. get_my_development — DesenvolvimentoScreen (aninhado)
-- Preserva: pdi_metas[] em pdis[], trainings{} em training_participants[],
--           action_plan_tasks[] em action_plans[]
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_development(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'pdis', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',          p.id,
            'titulo',      p.titulo,
            'data_inicio', p.data_inicio,
            'data_fim',    p.data_fim,
            'status',      p.status,
            'created_at',  p.created_at,
            'pdi_metas', (
              SELECT COALESCE(json_agg(m), '[]'::json)
              FROM pdi_metas m WHERE m.pdi_id = p.id
            )
          )
          ORDER BY p.created_at DESC
        ),
        '[]'::json
      )
      FROM pdis p WHERE p.employee_id = p_employee_id
    ),
    'feedbacks', (
      SELECT COALESCE(json_agg(f ORDER BY f.created_at DESC), '[]'::json)
      FROM feedbacks f WHERE f.para_employee_id = p_employee_id
    ),
    'trainings', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',         tp.id,
            'status',     tp.status,
            'nota',       tp.nota,
            'created_at', tp.created_at,
            'trainings', (
              SELECT row_to_json(t) FROM trainings t WHERE t.id = tp.training_id
            )
          )
          ORDER BY tp.created_at DESC
        ),
        '[]'::json
      )
      FROM training_participants tp WHERE tp.employee_id = p_employee_id
    ),
    'action_plans', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',         ap.id,
            'titulo',     ap.titulo,
            'origem',     ap.origem,
            'prazo',      ap.prazo,
            'status',     ap.status,
            'created_at', ap.created_at,
            'action_plan_tasks', (
              SELECT COALESCE(json_agg(apt), '[]'::json)
              FROM action_plan_tasks apt WHERE apt.plan_id = ap.id
            )
          )
          ORDER BY ap.created_at DESC
        ),
        '[]'::json
      )
      FROM action_plans ap WHERE ap.employee_id = p_employee_id
    )
  );
$$;

-- ============================================================
-- 10. get_unit_surveys — ClimaScreen
-- Aliases: data_fim→prazo | climate_survey_questions.pergunta→texto
-- already_answered: verifica via employee_id (anon não vinculado)
-- ============================================================
CREATE OR REPLACE FUNCTION get_unit_surveys(
  p_unit_id     uuid,
  p_employee_id uuid
)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id',          s.id,
        'titulo',      s.titulo,
        'descricao',   s.descricao,
        'prazo',       s.data_fim,
        'status',      s.status,
        'unit_id',     s.unit_id,
        'already_answered', (
          SELECT EXISTS (
            SELECT 1 FROM climate_survey_responses r
            WHERE r.survey_id = s.id
              AND r.employee_id = p_employee_id
          )
        ),
        'questions', (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'id',     q.id,
                'texto',  q.pergunta,
                'tipo',   q.tipo,
                'opcoes', q.opcoes,
                'ordem',  q.ordem
              )
              ORDER BY q.ordem
            ),
            '[]'::json
          )
          FROM climate_survey_questions q WHERE q.survey_id = s.id
        )
      )
      ORDER BY s.created_at DESC
    ),
    '[]'::json
  )
  FROM climate_surveys s
  WHERE s.unit_id = p_unit_id
    AND s.status = 'ativo';
$$;

-- ============================================================
-- 11. get_my_documents — DocumentosScreen
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_documents(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(d ORDER BY d.uploaded_at DESC NULLS LAST), '[]'::json)
  FROM documents d
  WHERE d.employee_id = p_employee_id;
$$;

-- ============================================================
-- 12. get_my_home — HomeScreen: tudo em uma chamada
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_home(p_employee_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT json_build_object(
    'score', (
      SELECT score FROM employees WHERE id = p_employee_id
    ),
    'photo_url', (
      SELECT photo_url FROM employees WHERE id = p_employee_id
    ),
    'banco_horas', (
      SELECT row_to_json(t)
      FROM (
        SELECT saldo_banco, banco_horas_acumulado
        FROM time_records
        WHERE employee_id = p_employee_id
        ORDER BY periodo DESC
        LIMIT 1
      ) t
    ),
    'faltas_mes', (
      SELECT COUNT(*)
      FROM absences
      WHERE employee_id = p_employee_id
        AND data >= DATE_TRUNC('month', CURRENT_DATE)::date
    ),
    'last_punch', (
      SELECT row_to_json(p)
      FROM (
        SELECT tipo, timestamp_punch
        FROM time_clock_punches
        WHERE employee_id = p_employee_id
          AND timestamp_punch >= CURRENT_DATE::timestamptz
        ORDER BY timestamp_punch DESC
        LIMIT 1
      ) p
    ),
    'last_campanha', (
      SELECT row_to_json(c)
      FROM (
        SELECT title, category
        FROM campaigns
        WHERE active = true
        ORDER BY created_at DESC
        LIMIT 1
      ) c
    ),
    'podium', (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id',        e.id,
            'nome',      e.nome,
            'sobrenome', e.sobrenome,
            'photo_url', e.photo_url,
            'score',     e.score
          )
          ORDER BY e.score DESC
        ),
        '[]'::json
      )
      FROM (
        SELECT id, nome, sobrenome, photo_url, score
        FROM employees
        WHERE score IS NOT NULL
        ORDER BY score DESC
        LIMIT 10
      ) e
    )
  );
$$;

-- ============================================================
-- 13. get_active_campaigns — CampanhasScreen
-- ============================================================
CREATE OR REPLACE FUNCTION get_active_campaigns()
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(json_agg(c ORDER BY c.created_at DESC), '[]'::json)
  FROM campaigns c
  WHERE c.active = true;
$$;

-- ============================================================
-- WRITE RPCs
-- ============================================================

-- 14. insert_punch — RegistroScreen: bater ponto
CREATE OR REPLACE FUNCTION insert_punch(
  p_employee_id uuid,
  p_tipo        text,
  p_timestamp   timestamptz,
  p_latitude    float8,
  p_longitude   float8,
  p_device_info text
)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO time_clock_punches
    (employee_id, tipo, timestamp_punch, latitude, longitude, device_info)
  VALUES
    (p_employee_id, p_tipo, p_timestamp, p_latitude, p_longitude, p_device_info)
  RETURNING json_build_object(
    'id',              id,
    'tipo',            tipo,
    'timestamp_punch', timestamp_punch
  );
$$;

-- 15. submit_survey_responses — ClimaScreen: enviar respostas
-- real table: climate_survey_responses(resposta text, nota numeric)
-- input: [{survey_id, question_id, employee_id, resposta_valor, resposta_texto, resposta_opcao}]
-- mapping: resposta_valor→nota, (resposta_texto|resposta_opcao)→resposta
CREATE OR REPLACE FUNCTION submit_survey_responses(p_responses json)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO climate_survey_responses
    (survey_id, question_id, employee_id, nota, resposta)
  SELECT
    (r->>'survey_id')::uuid,
    (r->>'question_id')::uuid,
    CASE WHEN r->>'employee_id' IS NULL THEN NULL
         ELSE (r->>'employee_id')::uuid END,
    CASE WHEN r->>'resposta_valor' IS NULL THEN NULL
         ELSE (r->>'resposta_valor')::numeric END,
    COALESCE(r->>'resposta_texto', r->>'resposta_opcao')
  FROM json_array_elements(p_responses) AS r;
END;
$$;

-- 16. insert_document — DocumentosScreen: registrar doc no banco
CREATE OR REPLACE FUNCTION insert_document(
  p_employee_id  uuid,
  p_unit_id      uuid,
  p_name         text,
  p_type         text,
  p_storage_path text
)
RETURNS json
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO documents (employee_id, unit_id, name, type, storage_path)
  VALUES (p_employee_id, p_unit_id, p_name, p_type, p_storage_path)
  RETURNING json_build_object('id', id, 'storage_path', storage_path);
$$;

-- 17. update_employee_photo — HomeScreen: atualizar foto de perfil
CREATE OR REPLACE FUNCTION update_employee_photo(
  p_employee_id uuid,
  p_photo_url   text
)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE employees SET photo_url = p_photo_url WHERE id = p_employee_id;
$$;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION get_employee_profile(uuid)                                      TO anon;
GRANT EXECUTE ON FUNCTION get_my_payslips(uuid)                                           TO anon;
GRANT EXECUTE ON FUNCTION get_my_gorjetas(uuid)                                           TO anon;
GRANT EXECUTE ON FUNCTION get_my_hour_bank(uuid)                                          TO anon;
GRANT EXECUTE ON FUNCTION get_my_payments(uuid)                                           TO anon;
GRANT EXECUTE ON FUNCTION get_my_vacations(uuid)                                          TO anon;
GRANT EXECUTE ON FUNCTION get_my_registro(uuid)                                           TO anon;
GRANT EXECUTE ON FUNCTION get_my_last_punch(uuid)                                         TO anon;
GRANT EXECUTE ON FUNCTION get_my_development(uuid)                                        TO anon;
GRANT EXECUTE ON FUNCTION get_unit_surveys(uuid, uuid)                                    TO anon;
GRANT EXECUTE ON FUNCTION get_my_documents(uuid)                                          TO anon;
GRANT EXECUTE ON FUNCTION get_my_home(uuid)                                               TO anon;
GRANT EXECUTE ON FUNCTION get_active_campaigns()                                          TO anon;
GRANT EXECUTE ON FUNCTION insert_punch(uuid, text, timestamptz, float8, float8, text)     TO anon;
GRANT EXECUTE ON FUNCTION submit_survey_responses(json)                                   TO anon;
GRANT EXECUTE ON FUNCTION insert_document(uuid, uuid, text, text, text)                   TO anon;
GRANT EXECUTE ON FUNCTION update_employee_photo(uuid, text)                               TO anon;
