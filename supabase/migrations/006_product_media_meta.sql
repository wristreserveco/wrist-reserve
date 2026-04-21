-- Extra metadata for richer product media (video trim, poster image).
alter table public.products
  add column if not exists video_poster_url text,
  add column if not exists video_trim_start numeric(8, 3),
  add column if not exists video_trim_end numeric(8, 3);
