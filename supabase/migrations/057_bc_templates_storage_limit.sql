-- Increase bc-templates bucket file size limit to 100MB
-- and relax MIME type restriction (some PPTX tools use slightly different types)
UPDATE storage.buckets
SET
  file_size_limit = 104857600,  -- 100 MB
  allowed_mime_types = ARRAY[
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/octet-stream'   -- fallback for some OS/browser combos
  ]
WHERE id = 'bc-templates';
