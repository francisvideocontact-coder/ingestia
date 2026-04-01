-- Bucket de staging pour les pièces jointes email (temporaire, avant ingestion)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-staging',
  'email-staging',
  false,
  52428800, -- 50 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
);

-- RLS : les membres du workspace peuvent lire/écrire, les admins peuvent supprimer
CREATE POLICY "Members can upload email staging files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'email-staging'
    AND (storage.foldername(name))[1] IN (
      SELECT ec.id::text FROM email_connections ec
      JOIN workspace_members wm ON wm.workspace_id = ec.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can read email staging files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'email-staging'
    AND (storage.foldername(name))[1] IN (
      SELECT ec.id::text FROM email_connections ec
      JOIN workspace_members wm ON wm.workspace_id = ec.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete email staging files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'email-staging'
    AND (storage.foldername(name))[1] IN (
      SELECT ec.id::text FROM email_connections ec
      JOIN workspace_members wm ON wm.workspace_id = ec.workspace_id
      WHERE wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );
