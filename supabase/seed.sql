-- Optional seed data for local / staging (adjust URLs as needed)
insert into public.products (name, brand, price, description, media_urls, video_url, status, featured)
values
  (
    'Nocturne Chronograph',
    'Aurelius',
    12400,
    'Swiss automatic chronograph with hand-finished dial and exhibition caseback.',
    '["https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1600&q=80"]'::jsonb,
    null,
    'available',
    true
  ),
  (
    'Heritage Diver',
    'Marin & Co.',
    8900,
    'Ceramic bezel, 300m depth rating, integrated bracelet.',
    '["https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?auto=format&fit=crop&w=1600&q=80"]'::jsonb,
    null,
    'available',
    true
  ),
  (
    'Midnight GMT',
    'Aurelius',
    15200,
    'Dual-time complication with jet-black dial and gold accents.',
    '["https://images.unsplash.com/photo-1594534475808-b18fc33b045e?auto=format&fit=crop&w=1600&q=80"]'::jsonb,
    null,
    'sold',
    false
  );
