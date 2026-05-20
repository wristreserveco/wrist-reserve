-- AP: catalog-style Royal Oak (no hand). Cartier tile uses /public asset via app override.

update public.categories
set image_url = 'https://upload.wikimedia.org/wikipedia/commons/0/0e/Audemars_2385_Royal_Oak_resized.jpg'
where slug in ('audemars-piguet', 'ap-royal-oak');
