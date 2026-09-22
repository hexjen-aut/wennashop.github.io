CREATE OR REPLACE FUNCTION public.notify_vendor_validation()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'artisan' AND OLD.status = 'pending' AND NEW.status = 'active' THEN
    NEW.vendor_validated_at = now();
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (NEW.id, 'vendor_validated', 'Compte vendeur validé',
      'Votre compte vendeur WennaShop a été validé. Vous pouvez maintenant créer votre boutique.');
  ELSIF NEW.role = 'artisan' AND OLD.status = 'pending' AND NEW.status = 'banned' THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (NEW.id, 'vendor_rejected', 'Dossier vendeur refusé',
      COALESCE(NEW.vendor_reject_reason, 'Votre dossier vendeur n''a pas été validé.'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_vendor_validation ON public.users;
CREATE TRIGGER trg_notify_vendor_validation
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_vendor_validation();
