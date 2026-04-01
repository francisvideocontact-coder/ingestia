-- ============================================================
-- Migration: export_logs
-- ============================================================

CREATE TABLE public.export_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  exported_at       timestamptz NOT NULL DEFAULT now(),
  drive_file_id     text NOT NULL,
  drive_folder_path text NOT NULL,
  status            text NOT NULL DEFAULT 'success',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_export_logs_document_id ON public.export_logs(document_id);
CREATE INDEX idx_export_logs_exported_at ON public.export_logs(exported_at DESC);

-- RLS
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- SELECT : membres du workspace du document
CREATE POLICY "export_logs_select" ON public.export_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT : owner ou admin du workspace du document
CREATE POLICY "export_logs_insert" ON public.export_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- UPDATE : owner ou admin
CREATE POLICY "export_logs_update" ON public.export_logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = document_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE : owner uniquement
CREATE POLICY "export_logs_delete" ON public.export_logs
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.documents d
      JOIN public.workspaces ws ON ws.id = d.workspace_id
      WHERE d.id = document_id
        AND ws.owner_id = auth.uid()
    )
  );
