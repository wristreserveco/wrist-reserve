-- Optional seed data for local / staging (adjust URLs as needed)
insert into public.products (name, brand, price, description, media_urls, video_url, status, featured)
values
  (
    'Nocturne Chronograph',
    'Aurelius',
    12400,
    'Swiss automatic chronograph with hand-finished dial and exhibition caseback.',
    '["https://upload.wikimedia.org/wikipedia/commons/8/81/Rolex_Datejust_126234.jpg"]'::jsonb,
    null,
    'available',
    true
  ),
  (
    'Heritage Diver',
    'Marin & Co.',
    8900,
    'Ceramic bezel, 300m depth rating, integrated bracelet.',
    '["https://upload.wikimedia.org/wikipedia/commons/c/cd/Rolex-Submariner.jpg"]'::jsonb,
    null,
    'available',
    true
  ),
  (
    'Midnight GMT',
    'Aurelius',
    15200,
    'Dual-time complication with jet-black dial and gold accents.',
    '["https://upload.wikimedia.org/wikipedia/commons/8/85/Rolex_GMT_Master_II_-_16710_%28without_background%2C_cropped_to_casing%29.jpg"]'::jsonb,
    null,
    'sold',
    false
  );
