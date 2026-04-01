-- ============================================================
-- Migration: categories
-- ============================================================

CREATE TABLE public.categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  code          text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);

-- Indexes
CREATE INDEX idx_categories_workspace_id ON public.categories(workspace_id);

-- RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- SELECT : membres du workspace
CREATE POLICY "categories_select" ON public.categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT : owner ou admin
CREATE POLICY "categories_insert" ON public.categories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- UPDATE : owner ou admin
CREATE POLICY "categories_update" ON public.categories
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE : owner ou admin
CREATE POLICY "categories_delete" ON public.categories
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Catégories par défaut insérées via la fonction de création de workspace
