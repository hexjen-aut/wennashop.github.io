-- Extrait la 1ère URL du tableau JSON stringifié dans image_url (type text)
-- Stratégie : regex pour capturer la 1ère URL entre guillemets dans le tableau
UPDATE products
SET image_url = substring(image_url FROM '"(https?://[^"]+)"')
WHERE image_url LIKE '[%';
