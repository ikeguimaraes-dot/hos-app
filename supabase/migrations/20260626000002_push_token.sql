ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS push_token text,
  ADD COLUMN IF NOT EXISTS push_token_updated_at timestamptz;

CREATE OR REPLACE FUNCTION upsert_push_token(
  p_employee_id uuid,
  p_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE employees
  SET
    push_token = p_token,
    push_token_updated_at = now()
  WHERE id = p_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_push_token(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION upsert_push_token(uuid, text) TO authenticated;
