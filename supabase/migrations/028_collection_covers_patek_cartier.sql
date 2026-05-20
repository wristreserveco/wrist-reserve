-- Collection tile heroes: Patek blue-dial Nautilus, Cartier steel Santos.

update public.categories
set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Patek-Philippe-Nautilus-5711-1A-010-1.jpg/1280px-Patek-Philippe-Nautilus-5711-1A-010-1.jpg'
where slug in ('patek-philippe', 'patek-nautilus');

update public.categories
set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Cartier_Santos_wristwatch.jpg/1280px-Cartier_Santos_wristwatch.jpg'
where slug in ('cartier', 'cartier-santos');
