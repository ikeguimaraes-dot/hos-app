-- Migration: geofencing Haversine
-- Aplicada diretamente em produção em 2026-06-26.
-- Este arquivo existe apenas para versionamento no repositório.

-- 1. Colunas de geofencing na tabela units
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS latitude        numeric,
  ADD COLUMN IF NOT EXISTS longitude       numeric,
  ADD COLUMN IF NOT EXISTS geofence_radius_m int DEFAULT 200;

-- 2. Colunas adicionais em time_clock_punches
ALTER TABLE time_clock_punches
  ADD COLUMN IF NOT EXISTS aprovado         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS distance_meters  int,
  ADD COLUMN IF NOT EXISTS gps_failed       boolean NOT NULL DEFAULT false;

-- 3. RPC: retorna dados de geofencing de uma unidade
CREATE OR REPLACE FUNCTION get_unit_geofence(p_unit_id uuid)
RETURNS TABLE(latitude numeric, longitude numeric, radius_meters int)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.latitude,
    u.longitude,
    COALESCE(u.geofence_radius_m, 200) AS radius_meters
  FROM units u
  WHERE u.id = p_unit_id;
$$;

GRANT EXECUTE ON FUNCTION get_unit_geofence(uuid) TO anon;

-- 4. RPC: insert_punch atualizada com novos parâmetros (DEFAULT preserva retrocompatibilidade)
CREATE OR REPLACE FUNCTION insert_punch(
  p_employee_id     uuid,
  p_tipo            text,
  p_timestamp       timestamptz,
  p_latitude        numeric  DEFAULT NULL,
  p_longitude       numeric  DEFAULT NULL,
  p_device_info     text     DEFAULT NULL,
  p_aprovado        boolean  DEFAULT true,
  p_distance_meters int      DEFAULT NULL,
  p_gps_failed      boolean  DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO time_clock_punches (
    employee_id,
    tipo,
    timestamp_punch,
    latitude,
    longitude,
    device_info,
    aprovado,
    distance_meters,
    gps_failed
  ) VALUES (
    p_employee_id,
    p_tipo,
    p_timestamp,
    p_latitude,
    p_longitude,
    p_device_info,
    p_aprovado,
    p_distance_meters,
    p_gps_failed
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_punch(uuid, text, timestamptz, numeric, numeric, text, boolean, int, boolean) TO anon;
