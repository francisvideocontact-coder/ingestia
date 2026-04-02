-- ============================================================
-- Migration: invite_members
-- 1. Met à jour handle_new_user pour gérer les invitations
-- 2. Crée une fonction sécurisée pour lister les membres avec leur email
-- ============================================================

-- Met à jour le trigger : si l'utilisateur a un workspace_id dans ses métadonnées
-- (= il a été invité), on l'ajoute au workspace existant au lieu d'en créer un nouveau.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id    uuid;
  v_workspace_name  text;
  v_invited_ws_id   uuid;
  v_invited_role    text;
BEGIN
  v_invited_ws_id := (NEW.raw_user_meta_data->>'workspace_id')::uuid;
  v_invited_role  := COALESCE(NEW.raw_user_meta_data->>'role', 'member');

  IF v_invited_ws_id IS NOT NULL THEN
    -- Utilisateur invité → on l'ajoute au workspace existant
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_invited_ws_id, NEW.id, v_invited_role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
  ELSE
    -- Nouvel utilisateur → on crée son workspace par défaut
    v_workspace_name := split_part(NEW.email, '@', 1);
    v_workspace_id   := gen_random_uuid();

    INSERT INTO public.workspaces (id, name, owner_id)
    VALUES (v_workspace_id, v_workspace_name, NEW.id);

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace_id, NEW.id, 'owner');
  END IF;

  RETURN NEW;
END;
$$;

-- Fonction sécurisée pour récupérer les membres avec leur email
-- (SECURITY DEFINER permet de lire auth.users, inaccessible en RLS normale)
CREATE OR REPLACE FUNCTION public.get_workspace_members(p_workspace_id uuid)
RETURNS TABLE(
  id          uuid,
  user_id     uuid,
  role        text,
  email       text,
  created_at  timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wm.id, wm.user_id, wm.role, u.email, wm.created_at
  FROM public.workspace_members wm
  JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = p_workspace_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = p_workspace_id
        AND m.user_id = auth.uid()
    )
  ORDER BY
    CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
    wm.created_at;
$$;
