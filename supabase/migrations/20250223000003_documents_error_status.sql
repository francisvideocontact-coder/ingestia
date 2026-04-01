-- ============================================================
-- Migration: documents_error_status
-- Ajoute le statut 'error' pour les documents dont l'analyse IA échoue
-- + applique les fonctions SECURITY DEFINER aux policies documents
-- ============================================================

-- ── Ajouter le statut 'error' ─────────────────────────────

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check
    CHECK (status IN ('pending', 'verified', 'validated', 'exported', 'error'));

-- ── Helper : l'utilisateur est-il membre du workspace ? ───
-- (réutilise is_workspace_member déjà créée par fix_rls_recursion)

-- ── Correction policies documents ────────────────────────

DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;

CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND public.is_workspace_member(workspace_id)
  );

CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (
    public.is_workspace_admin(workspace_id)
    OR (
      uploaded_by = auth.uid()
      AND status IN ('pending', 'verified', 'error')
      AND public.is_workspace_member(workspace_id)
    )
  );

CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (
    public.is_workspace_admin(workspace_id)
  );
