-- Table pour mémoriser les fournisseurs connus et leur catégorie
CREATE TABLE supplier_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,   -- nom normalisé en MAJUSCULES (ex: ORANGE, VIDIQ_INC)
  category text NOT NULL,        -- ex: TELECOMMUNICATION, LOGICIEL
  source text NOT NULL DEFAULT 'manual', -- 'drive_scan' | 'web_search' | 'manual'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (workspace_id, supplier_name)
);

-- Index pour lookup rapide
CREATE INDEX supplier_categories_lookup ON supplier_categories (workspace_id, supplier_name);

-- RLS
ALTER TABLE supplier_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view supplier_categories"
  ON supplier_categories FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert supplier_categories"
  ON supplier_categories FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update supplier_categories"
  ON supplier_categories FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
