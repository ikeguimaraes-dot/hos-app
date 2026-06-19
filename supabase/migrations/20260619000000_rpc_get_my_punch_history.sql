-- ═══════════════════════════════════════════════════════════════════════════
-- get_my_punch_history — histórico de pontos dos últimos N dias (default 30)
-- Exclui hoje (< data SP atual) — hoje já aparece no PontoHeroCard.
-- Usa p_employee_id em vez de auth.uid() — padrão do projeto (sem sessão
-- Supabase; auth é gerenciada via AsyncStorage no cliente).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_punch_history(
  p_employee_id uuid,
  p_days        int DEFAULT 30
)
RETURNS TABLE (
  dia     date,
  punches jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(tcp.timestamp_punch AT TIME ZONE 'America/Sao_Paulo') AS dia,
    jsonb_agg(
      jsonb_build_object(
        'tipo',    tcp.tipo,
        'horario', TO_CHAR(
          tcp.timestamp_punch AT TIME ZONE 'America/Sao_Paulo',
          'HH24:MI'
        )
      ) ORDER BY tcp.timestamp_punch ASC
    ) AS punches
  FROM time_clock_punches tcp
  WHERE
    tcp.employee_id = p_employee_id
    AND DATE(tcp.timestamp_punch AT TIME ZONE 'America/Sao_Paulo')
          >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - p_days
    AND DATE(tcp.timestamp_punch AT TIME ZONE 'America/Sao_Paulo')
          <  (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
  GROUP BY dia
  ORDER BY dia DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_punch_history(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION get_my_punch_history(uuid, int) TO authenticated;
