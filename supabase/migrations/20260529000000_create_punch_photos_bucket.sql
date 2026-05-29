-- Migration: cria bucket punch-photos para selfies do registro de ponto
-- Separa selfies de ponto dos documentos de RH (bucket 'documents')
-- Executar manualmente no Supabase SQL Editor após o merge do PR

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'punch-photos',
  'punch-photos',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Colaborador upload punch photo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'punch-photos');

CREATE POLICY "Colaborador lê própria punch photo"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'punch-photos');

CREATE POLICY "Service role acesso total punch-photos"
  ON storage.objects TO service_role
  USING (bucket_id = 'punch-photos')
  WITH CHECK (bucket_id = 'punch-photos');
