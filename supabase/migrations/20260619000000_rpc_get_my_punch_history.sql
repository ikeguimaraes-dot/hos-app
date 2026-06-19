-- ═══════════════════════════════════════════════════════════════════════════
-- get_my_punch_history — histórico de pontos dos últimos N dias (default 30)
-- Exclui hoje (< CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo').
-- Usa p_employee_id — padrão do projeto (auth via AsyncStorage, não Supabase).
-- SQL validado diretamente no SQL Editor do Supabase em 19/06/2026.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_punch_history(
  p_employee_id uuid,
  p_days int DEFAULT 30
)
RETURNS TABLE (dia date, punches jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(timestamp_punch AT TIME ZONE 'America/Sao_Paulo') as dia,
    jsonb_agg(
      jsonb_build_object(
        'tipo', tipo,
        'horario', TO_CHAR(
          timestamp_punch AT TIME ZONE 'America/Sao_Paulo',
          'HH24:MI'
        )
      ) ORDER BY timestamp_punch ASC
    ) as punches
  FROM time_clock_punches
  WHERE
    employee_id = p_employee_id
    AND DATE(timestamp_punch AT TIME ZONE 'America/Sao_Paulo')
        < CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo'
    AND DATE(timestamp_punch AT TIME ZONE 'America/Sao_Paulo')
        >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo') - p_days
  GROUP BY dia
  ORDER BY dia DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_punch_history(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION get_my_punch_history(uuid, int) TO authenticated;
