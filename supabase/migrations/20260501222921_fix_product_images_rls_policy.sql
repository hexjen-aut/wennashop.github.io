-- ÉTAPE 1 : Policy SELECT publique sur product_images
CREATE POLICY "product_images_select_public"
ON public.product_images
FOR SELECT
USING (true);
