-- 014_category_images_and_cleanup.sql
--
-- 1. Prune categories for brands we're not carrying (everything except
--    the seven the owner signed off on).
-- 2. Populate image_url for the remaining categories with clean
--    Wikimedia Commons URLs where available. Leaves nulls where we
--    couldn't source a reliable photo — the storefront falls back to a
--    neutral placeholder and admin can upload the real inventory photo.
--
-- Idempotent: safe to re-run. Deletes cascade via parent_id FK,
-- updates are straight writes.

begin;

-- Prune non-kept brands. parent_id FK is ON DELETE SET NULL, so we have
-- to delete sub-categories first (otherwise they'd be left orphaned).
with kept as (
  select id from public.categories
  where parent_id is null and slug in ('rolex', 'audemars-piguet', 'patek-philippe', 'richard-mille', 'omega', 'cartier', 'hublot')
)
delete from public.categories
 where parent_id is not null
   and parent_id not in (select id from kept);

delete from public.categories
 where parent_id is null
   and slug not in ('rolex', 'audemars-piguet', 'patek-philippe', 'richard-mille', 'omega', 'cartier', 'hublot');

-- Image assignments.
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Rolex-Submariner.jpg' where slug = 'rolex';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Audemars_Piguet_Royal_Oak_ref._15202.jpg/1280px-Audemars_Piguet_Royal_Oak_ref._15202.jpg' where slug = 'audemars-piguet';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Patek-Philippe-Nautilus-5711.jpg' where slug = 'patek-philippe';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/RM_67-01_Automatic_Extra_Plat.jpg/1280px-RM_67-01_Automatic_Extra_Plat.jpg' where slug = 'richard-mille';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg' where slug = 'omega';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/d/df/Cartier_Tank.jpg' where slug = 'cartier';
update public.categories set image_url = null where slug = 'hublot';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Rolex-Submariner.jpg' where slug = 'rolex-submariner';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Daytona116509.jpg' where slug = 'rolex-daytona';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/8/85/Rolex_GMT_Master_II_-_16710_%28without_background%2C_cropped_to_casing%29.jpg' where slug = 'rolex-gmt-master-ii';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/8/81/Rolex_Datejust_126234.jpg' where slug = 'rolex-datejust';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/0/03/Rolex-day-date-champagne-dial-18k-yellow-gold-president-automatic-men_s-watch-118238cdp.webp' where slug = 'rolex-day-date';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/8/80/Rolex_Sea_Dweller_16600.jpg' where slug = 'rolex-sea-dweller';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg/1280px-Rolex_Deepsea_Sea-Dweller_116660_Blue_Dial_%27James_Cameron%27.jpg' where slug = 'rolex-deepsea';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/8/88/Rolex_Milgauss_116400GV.jpg' where slug = 'rolex-milgauss';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Rolex_Explorer_II_%28edited%29.jpg/1280px-Rolex_Explorer_II_%28edited%29.jpg' where slug = 'rolex-explorer';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Rolex_Yachtmaster_II_116680.JPG/1280px-Rolex_Yachtmaster_II_116680.JPG' where slug = 'rolex-yacht-master';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Rolex_Sky-Dweller_in_oro_bianco.jpg/1280px-Rolex_Sky-Dweller_in_oro_bianco.jpg' where slug = 'rolex-sky-dweller';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Rolex_Air-King_ref._126900%2C_risalente_al_2022.jpg/1280px-Rolex_Air-King_ref._126900%2C_risalente_al_2022.jpg' where slug = 'rolex-air-king';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Rolex_Cellini_Moonphase_ref._50535.jpg' where slug = 'rolex-cellini';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/8/81/Rolex_Datejust_126234.jpg' where slug = 'rolex-oyster-perpetual';
update public.categories set image_url = null where slug = 'rolex-1908';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Audemars_Piguet_Royal_Oak_ref._15202.jpg/1280px-Audemars_Piguet_Royal_Oak_ref._15202.jpg' where slug = 'ap-royal-oak';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/1/1e/Audemars_Piguet_Royal_Oak_Offshore_Diver.jpg' where slug = 'ap-royal-oak-offshore';
update public.categories set image_url = null where slug = 'ap-royal-oak-concept';
update public.categories set image_url = null where slug = 'ap-code-11-59';
update public.categories set image_url = null where slug = 'ap-jules-audemars';
update public.categories set image_url = null where slug = 'ap-millenary';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/7/74/Patek-Philippe-Nautilus-5711.jpg' where slug = 'patek-nautilus';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Patek_Philippe_Aquanaut_Advanced_Research_ref._5650G_limitato_a_500_pezzi.jpg/1280px-Patek_Philippe_Aquanaut_Advanced_Research_ref._5650G_limitato_a_500_pezzi.jpg' where slug = 'patek-aquanaut';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Calatrava1.jpg' where slug = 'patek-calatrava';
update public.categories set image_url = null where slug = 'patek-complications';
update public.categories set image_url = null where slug = 'patek-grand-complications';
update public.categories set image_url = null where slug = 'patek-golden-ellipse';
update public.categories set image_url = null where slug = 'patek-gondolo';
update public.categories set image_url = null where slug = 'patek-twenty-four';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/RM_67-01_Automatic_Extra_Plat.jpg/1280px-RM_67-01_Automatic_Extra_Plat.jpg' where slug = 'rm-011';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/RM_67-01_Automatic_Extra_Plat.jpg/1280px-RM_67-01_Automatic_Extra_Plat.jpg' where slug = 'rm-67-02';
update public.categories set image_url = null where slug = 'rm-035';
update public.categories set image_url = null where slug = 'rm-055';
update public.categories set image_url = null where slug = 'rm-27-04';
update public.categories set image_url = null where slug = 'rm-72-01';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Vintage_Omega_Speedmaster_%22Pre-moon%22.jpg' where slug = 'omega-speedmaster';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/4/46/Omega_Seamaster_Co-Axial.jpg' where slug = 'omega-seamaster';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/4/40/Omega_Constellation_in_oro_al_quarzo_risalente_ai_primi_anni_Ottanta.jpg' where slug = 'omega-constellation';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Omega_De_Ville_Handaufzug.png' where slug = 'omega-de-ville';
update public.categories set image_url = null where slug = 'omega-railmaster';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/d/df/Cartier_Tank.jpg' where slug = 'cartier-tank';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Cartier_Santos.jpg' where slug = 'cartier-santos';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Cartier_Panth%C3%A8re_Ruban.jpg/1280px-Cartier_Panth%C3%A8re_Ruban.jpg' where slug = 'cartier-panthere';
update public.categories set image_url = 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Cartier_Pasha_automatico.jpg' where slug = 'cartier-pasha';
update public.categories set image_url = null where slug = 'cartier-ballon-bleu';
update public.categories set image_url = null where slug = 'cartier-ronde-louis';
update public.categories set image_url = null where slug = 'hublot-big-bang';
update public.categories set image_url = null where slug = 'hublot-classic-fusion';
update public.categories set image_url = null where slug = 'hublot-mp-collection';
update public.categories set image_url = null where slug = 'hublot-spirit-of-big-bang';

commit;
