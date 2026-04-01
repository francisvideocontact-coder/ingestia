-- ============================================================
-- Migration: documents
-- ============================================================

CREATE TABLE public.documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  uploaded_by         uuid NOT NULL REFERENCES auth.users(id),
  original_file_url   text NOT NULL,
  original_filename   text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'verified', 'validated', 'exported')),
  supplier            text,
  date                date,
  amount_ht           numeric(12, 2),
  amount_ttc          numeric(12, 2),
  vat_amount          numeric(12, 2),
  document_type       text CHECK (document_type IN ('facture', 'ndf', 'ticket', 'avoir')),
  category            text,
  confidence_scores   jsonb,
  final_filename      text,
  exported_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_documents_workspace_id ON public.documents(workspace_id);
CREATE INDEX idx_documents_uploaded_by ON public.documents(uploaded_by);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- SELECT : membres du workspace
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT : membres actifs (member, admin, owner)
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- UPDATE : owner/admin peuvent tout modifier, member peut modifier ses propres docs en pending/verified
CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
    OR (
      uploaded_by = auth.uid()
      AND status IN ('pending', 'verified')
      AND EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role = 'member'
      )
    )
  );

-- DELETE : owner ou admin uniquement
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );
