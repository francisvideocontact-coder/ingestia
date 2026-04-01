-- ============================================================
-- Migration: email_connections
-- ============================================================

CREATE TABLE public.email_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('gmail', 'imap')),
  credentials     jsonb NOT NULL DEFAULT '{}',
  filters         jsonb NOT NULL DEFAULT '{}',
  scan_frequency  text NOT NULL DEFAULT 'hourly',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_connections_workspace_id ON public.email_connections(workspace_id);

-- RLS
ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;

-- SELECT : owner ou admin uniquement (données sensibles)
CREATE POLICY "email_connections_select" ON public.email_connections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- INSERT : owner ou admin
CREATE POLICY "email_connections_insert" ON public.email_connections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- UPDATE : owner ou admin
CREATE POLICY "email_connections_update" ON public.email_connections
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE : owner ou admin
CREATE POLICY "email_connections_delete" ON public.email_connections
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );
