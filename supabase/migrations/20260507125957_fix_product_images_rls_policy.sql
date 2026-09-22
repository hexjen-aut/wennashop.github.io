CREATE POLICY "product_images_public_select"
ON public.product_images
FOR SELECT
TO public
USING (true);
