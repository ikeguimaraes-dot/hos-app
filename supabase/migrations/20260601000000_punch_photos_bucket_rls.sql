-- Bucket punch-photos deve ser criado manualmente no dashboard antes de rodar
-- Supabase → Storage → New bucket → punch-photos (private, 5MB, jpeg/png/webp)

-- RLS: funcionário só acessa as próprias fotos
CREATE POLICY "employee_own_photos" ON storage.objects
  FOR ALL USING (
    bucket_id = 'punch-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role tem acesso total (para uploads server-side)
CREATE POLICY "service_role_full_access" ON storage.objects
  FOR ALL USING (
    bucket_id = 'punch-photos'
    AND auth.role() = 'service_role'
  );
