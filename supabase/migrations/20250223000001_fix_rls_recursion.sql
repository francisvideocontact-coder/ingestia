-- ============================================================
-- Migration: fix_rls_recursion
-- Corrige la récursion infinie dans les policies workspace_members
-- en utilisant des fonctions SECURITY DEFINER (bypass RLS)
-- ============================================================

-- Helper: l'utilisateur courant est-il membre du workspace ?
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
  );
$$;

-- Helper: l'utilisateur courant est-il owner ou admin du workspace ?
CREATE OR REPLACE FUNCTION public.is_workspace_admin(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

-- ── Correction workspace_members ─────────────────────────────

DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete" ON public.workspace_members;

CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT USING (
    public.is_workspace_member(workspace_id)
  );

CREATE POLICY "workspace_members_insert" ON public.workspace_members
  FOR INSERT WITH CHECK (
    public.is_workspace_admin(workspace_id)
    OR (
      -- Permet au créateur d'insérer son propre enregistrement owner
      user_id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "workspace_members_update" ON public.workspace_members
  FOR UPDATE USING (
    public.is_workspace_admin(workspace_id)
  );

CREATE POLICY "workspace_members_delete" ON public.workspace_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR public.is_workspace_admin(workspace_id)
  );

-- ── Correction workspaces (utilise aussi workspace_members) ──

DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;

CREATE POLICY "workspaces_select" ON public.workspaces
  FOR SELECT USING (
    public.is_workspace_member(id)
  );

CREATE POLICY "workspaces_update" ON public.workspaces
  FOR UPDATE USING (
    public.is_workspace_admin(id)
  );
