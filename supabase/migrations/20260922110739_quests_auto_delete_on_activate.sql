CREATE OR REPLACE FUNCTION public.quests_delete_on_activate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'open' AND NEW.status IS DISTINCT FROM 'open' THEN
    IF EXISTS (SELECT 1 FROM quest_disputes WHERE quest_id = OLD.id) THEN
      RETURN NEW;
    END IF;
    DELETE FROM quests WHERE id = OLD.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quests_auto_delete_on_activate
BEFORE UPDATE OF status ON public.quests
FOR EACH ROW
EXECUTE FUNCTION public.quests_delete_on_activate();
