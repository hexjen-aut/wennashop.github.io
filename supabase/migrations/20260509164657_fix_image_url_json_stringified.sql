-- Normalise image_url : extrait la 1ère URL si c'est un JSON array stringifié
-- Ex: '["https://...jpg","https://...jpg"]' → 'https://...jpg'
UPDATE products
SET image_url = (
  SELECT jsonb_array_elements_text(image_url::jsonb) LIMIT 1
)
WHERE image_url LIKE '[%'
  AND image_url::text ~ '^\\[.*\\]$';
