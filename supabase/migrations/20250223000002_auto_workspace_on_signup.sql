-- ============================================================
-- Migration: auto_workspace_on_signup
-- Crée automatiquement un workspace + entrée owner dans
-- workspace_members à chaque nouvel utilisateur auth.users
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id  uuid;
  v_workspace_name text;
BEGIN
  -- Nom par défaut = préfixe de l'email (avant @)
  v_workspace_name := split_part(NEW.email, '@', 1);
  v_workspace_id   := gen_random_uuid();

  INSERT INTO public.workspaces (id, name, owner_id)
  VALUES (v_workspace_id, v_workspace_name, NEW.id);

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

-- Trigger déclenché après chaque inscription
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
