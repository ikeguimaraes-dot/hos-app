-- Bucket payroll-reports: RLS para service_role only
-- O bucket foi criado via SDK (createBucket) antes desta migration.
-- Esta policy garante que apenas o service role pode fazer upload/download.

CREATE POLICY "service_role_payroll_reports" ON storage.objects
  FOR ALL USING (
    bucket_id = 'payroll-reports'
    AND auth.role() = 'service_role'
  );
