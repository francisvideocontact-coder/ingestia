-- ============================================================
-- Migration: email_candidates
-- ============================================================

CREATE TABLE public.email_candidates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_connection_id   uuid NOT NULL REFERENCES public.email_connections(id) ON DELETE CASCADE,
  subject               text NOT NULL,
  sender                text NOT NULL,
  date                  timestamptz NOT NULL,
  detected_type         text NOT NULL CHECK (detected_type IN ('attachment', 'link')),
  attachment_url        text,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'ingested', 'ignored', 'blocked')),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_candidates_connection_id ON public.email_candidates(email_connection_id);
CREATE INDEX idx_email_candidates_status ON public.email_candidates(status);
CREATE INDEX idx_email_candidates_date ON public.email_candidates(date DESC);

-- RLS
ALTER TABLE public.email_candidates ENABLE ROW LEVEL SECURITY;

-- Helper function: résoudre le workspace depuis la connexion email
-- SELECT : membres du workspace parent (via email_connection)
CREATE POLICY "email_candidates_select" ON public.email_candidates
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.email_connections ec
      JOIN public.workspace_members wm ON wm.workspace_id = ec.workspace_id
      WHERE ec.id = email_connection_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT : owner ou admin du workspace (via la connection email)
CREATE POLICY "email_candidates_insert" ON public.email_candidates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.email_connections ec
      JOIN public.workspace_members wm ON wm.workspace_id = ec.workspace_id
      WHERE ec.id = email_connection_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- UPDATE : owner ou admin
CREATE POLICY "email_candidates_update" ON public.email_candidates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.email_connections ec
      JOIN public.workspace_members wm ON wm.workspace_id = ec.workspace_id
      WHERE ec.id = email_connection_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE : owner ou admin
CREATE POLICY "email_candidates_delete" ON public.email_candidates
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.email_connections ec
      JOIN public.workspace_members wm ON wm.workspace_id = ec.workspace_id
      WHERE ec.id = email_connection_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );
