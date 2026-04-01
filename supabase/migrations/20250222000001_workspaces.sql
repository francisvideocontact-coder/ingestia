-- ============================================================
-- Migration: workspaces
-- ============================================================

CREATE TABLE public.workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX idx_workspaces_owner_id ON public.workspaces(owner_id);

-- RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- SELECT : membre du workspace
CREATE POLICY "workspaces_select" ON public.workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT : authentifié (le owner crée le workspace)
CREATE POLICY "workspaces_insert" ON public.workspaces
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- UPDATE : owner ou admin du workspace
CREATE POLICY "workspaces_update" ON public.workspaces
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE : owner uniquement
CREATE POLICY "workspaces_delete" ON public.workspaces
  FOR DELETE USING (owner_id = auth.uid());
