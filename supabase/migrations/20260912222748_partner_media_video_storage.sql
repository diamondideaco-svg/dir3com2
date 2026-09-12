-- Private partner media remains review-gated. Expand the existing bucket only;
-- no public read policy and no direct client write policy are introduced.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/heic','application/pdf','video/mp4'
    ]::text[],
    public = false
where id = 'partner-media';
