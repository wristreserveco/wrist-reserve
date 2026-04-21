-- Wrist Reserve · Square payment link + seed watch categories
-- Idempotent. Safe to re-run.

-- -----------------------------------------------------------------------------
-- Product-level Square payment link (optional override of a default link).
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists square_url text;

-- -----------------------------------------------------------------------------
-- Make category slug uniquely indexed so idempotent seeding actually works.
-- -----------------------------------------------------------------------------
create unique index if not exists categories_slug_key
  on public.categories (slug);

-- -----------------------------------------------------------------------------
-- Seed watch brands (parents) + popular references (children).
-- All inserts use `on conflict (slug) do nothing`, so anything you've already
-- created, renamed, or reordered is safe from being overwritten.
-- -----------------------------------------------------------------------------

-- Parents --------------------------------------------------------------------
insert into public.categories (name, slug, tagline, sort_order, active)
values
  ('Rolex',               'rolex',               'Crown-level icons',        10,  true),
  ('Patek Philippe',      'patek-philippe',      'Haute horlogerie',         20,  true),
  ('Audemars Piguet',     'audemars-piguet',     'Genta architecture',       30,  true),
  ('Omega',               'omega',               'Moonwatch heritage',       40,  true),
  ('Tudor',               'tudor',               'Tool-watch DNA',           50,  true),
  ('Cartier',             'cartier',             'Paris maison',             60,  true),
  ('IWC',                 'iwc',                 'Schaffhausen precision',   70,  true),
  ('Richard Mille',       'richard-mille',       'Motorsport engineering',   80,  true),
  ('Breitling',           'breitling',           'Aviation chronographs',    90,  true),
  ('Hublot',              'hublot',              'Fusion avant-garde',      100,  true),
  ('Tag Heuer',           'tag-heuer',           'Racing stopwatches',      110,  true),
  ('Vacheron Constantin', 'vacheron-constantin', 'Since 1755',              120,  true),
  ('Grand Seiko',         'grand-seiko',         'Japanese craft',          130,  true),
  ('Panerai',             'panerai',             'Italian frogman steel',   140,  true),
  ('A. Lange & Söhne',    'a-lange-sohne',       'Glashütte excellence',    150,  true),
  ('Jaeger-LeCoultre',    'jaeger-lecoultre',    'Reverso maison',          160,  true),
  ('Zenith',              'zenith',              'El Primero originals',    170,  true),
  ('Chopard',             'chopard',             'Mille Miglia heritage',   180,  true)
on conflict (slug) do nothing;

-- Children -------------------------------------------------------------------
-- Pattern: look up the parent id by slug, then insert if the child slug is new.
-- We do this in one statement per child family to keep things copy-paste clean.

-- Rolex
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Submariner',        'rolex-submariner'),
  ('GMT-Master II',     'rolex-gmt-master-ii'),
  ('Daytona',           'rolex-daytona'),
  ('Datejust',          'rolex-datejust'),
  ('Day-Date',          'rolex-day-date'),
  ('Explorer',          'rolex-explorer'),
  ('Sea-Dweller',       'rolex-sea-dweller'),
  ('Deepsea',           'rolex-deepsea'),
  ('Yacht-Master',      'rolex-yacht-master'),
  ('Sky-Dweller',       'rolex-sky-dweller'),
  ('Air-King',          'rolex-air-king'),
  ('Milgauss',          'rolex-milgauss'),
  ('Oyster Perpetual',  'rolex-oyster-perpetual'),
  ('Cellini',           'rolex-cellini'),
  ('1908',              'rolex-1908')
) as v(name, slug)
join public.categories p on p.slug = 'rolex'
on conflict (slug) do nothing;

-- Patek Philippe
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Nautilus',              'patek-nautilus'),
  ('Aquanaut',              'patek-aquanaut'),
  ('Calatrava',             'patek-calatrava'),
  ('Complications',         'patek-complications'),
  ('Grand Complications',   'patek-grand-complications'),
  ('Twenty~4',              'patek-twenty-four'),
  ('Gondolo',               'patek-gondolo'),
  ('Golden Ellipse',        'patek-golden-ellipse')
) as v(name, slug)
join public.categories p on p.slug = 'patek-philippe'
on conflict (slug) do nothing;

-- Audemars Piguet
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Royal Oak',                  'ap-royal-oak'),
  ('Royal Oak Offshore',         'ap-royal-oak-offshore'),
  ('Royal Oak Concept',          'ap-royal-oak-concept'),
  ('Code 11.59',                 'ap-code-11-59'),
  ('Millenary',                  'ap-millenary'),
  ('Jules Audemars',             'ap-jules-audemars')
) as v(name, slug)
join public.categories p on p.slug = 'audemars-piguet'
on conflict (slug) do nothing;

-- Omega
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Speedmaster',    'omega-speedmaster'),
  ('Seamaster',      'omega-seamaster'),
  ('Constellation',  'omega-constellation'),
  ('De Ville',       'omega-de-ville'),
  ('Railmaster',     'omega-railmaster')
) as v(name, slug)
join public.categories p on p.slug = 'omega'
on conflict (slug) do nothing;

-- Tudor
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Black Bay',  'tudor-black-bay'),
  ('Pelagos',    'tudor-pelagos'),
  ('Royal',      'tudor-royal'),
  ('Heritage',   'tudor-heritage'),
  ('Ranger',     'tudor-ranger'),
  ('1926',       'tudor-1926')
) as v(name, slug)
join public.categories p on p.slug = 'tudor'
on conflict (slug) do nothing;

-- Cartier
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Santos',       'cartier-santos'),
  ('Tank',         'cartier-tank'),
  ('Ballon Bleu',  'cartier-ballon-bleu'),
  ('Pasha',        'cartier-pasha'),
  ('Panthère',     'cartier-panthere'),
  ('Ronde Louis',  'cartier-ronde-louis')
) as v(name, slug)
join public.categories p on p.slug = 'cartier'
on conflict (slug) do nothing;

-- IWC
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Portugieser',       'iwc-portugieser'),
  ('Pilot''s Watch',    'iwc-pilots-watch'),
  ('Big Pilot',         'iwc-big-pilot'),
  ('Portofino',         'iwc-portofino'),
  ('Aquatimer',         'iwc-aquatimer'),
  ('Ingenieur',         'iwc-ingenieur'),
  ('Da Vinci',          'iwc-da-vinci')
) as v(name, slug)
join public.categories p on p.slug = 'iwc'
on conflict (slug) do nothing;

-- Richard Mille
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('RM 011',   'rm-011'),
  ('RM 035',   'rm-035'),
  ('RM 055',   'rm-055'),
  ('RM 67-02', 'rm-67-02'),
  ('RM 72-01', 'rm-72-01'),
  ('RM 27-04', 'rm-27-04')
) as v(name, slug)
join public.categories p on p.slug = 'richard-mille'
on conflict (slug) do nothing;

-- Breitling
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Navitimer',    'breitling-navitimer'),
  ('Chronomat',    'breitling-chronomat'),
  ('Superocean',   'breitling-superocean'),
  ('Avenger',      'breitling-avenger'),
  ('Premier',      'breitling-premier'),
  ('Top Time',     'breitling-top-time')
) as v(name, slug)
join public.categories p on p.slug = 'breitling'
on conflict (slug) do nothing;

-- Hublot
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Big Bang',             'hublot-big-bang'),
  ('Classic Fusion',       'hublot-classic-fusion'),
  ('Spirit of Big Bang',   'hublot-spirit-of-big-bang'),
  ('MP Collection',        'hublot-mp-collection')
) as v(name, slug)
join public.categories p on p.slug = 'hublot'
on conflict (slug) do nothing;

-- Tag Heuer
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Carrera',     'tag-carrera'),
  ('Monaco',      'tag-monaco'),
  ('Aquaracer',   'tag-aquaracer'),
  ('Formula 1',   'tag-formula-1'),
  ('Link',        'tag-link')
) as v(name, slug)
join public.categories p on p.slug = 'tag-heuer'
on conflict (slug) do nothing;

-- Vacheron Constantin
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Overseas',        'vc-overseas'),
  ('Patrimony',       'vc-patrimony'),
  ('Traditionnelle',  'vc-traditionnelle'),
  ('Historiques',     'vc-historiques'),
  ('Fiftysix',        'vc-fiftysix')
) as v(name, slug)
join public.categories p on p.slug = 'vacheron-constantin'
on conflict (slug) do nothing;

-- Grand Seiko
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Heritage',      'gs-heritage'),
  ('Elegance',      'gs-elegance'),
  ('Sport',         'gs-sport'),
  ('Evolution 9',   'gs-evolution-9')
) as v(name, slug)
join public.categories p on p.slug = 'grand-seiko'
on conflict (slug) do nothing;

-- Panerai
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Luminor',       'panerai-luminor'),
  ('Submersible',   'panerai-submersible'),
  ('Radiomir',      'panerai-radiomir')
) as v(name, slug)
join public.categories p on p.slug = 'panerai'
on conflict (slug) do nothing;

-- A. Lange & Söhne
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Lange 1',     'als-lange-1'),
  ('Datograph',   'als-datograph'),
  ('Odysseus',    'als-odysseus'),
  ('Saxonia',     'als-saxonia'),
  ('Zeitwerk',    'als-zeitwerk'),
  ('1815',        'als-1815')
) as v(name, slug)
join public.categories p on p.slug = 'a-lange-sohne'
on conflict (slug) do nothing;

-- Jaeger-LeCoultre
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Reverso',             'jlc-reverso'),
  ('Master Control',      'jlc-master-control'),
  ('Master Ultra Thin',   'jlc-master-ultra-thin'),
  ('Polaris',             'jlc-polaris'),
  ('Duomètre',            'jlc-duometre')
) as v(name, slug)
join public.categories p on p.slug = 'jaeger-lecoultre'
on conflict (slug) do nothing;

-- Zenith
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Chronomaster', 'zenith-chronomaster'),
  ('Defy',         'zenith-defy'),
  ('Pilot',        'zenith-pilot'),
  ('Elite',        'zenith-elite')
) as v(name, slug)
join public.categories p on p.slug = 'zenith'
on conflict (slug) do nothing;

-- Chopard
insert into public.categories (name, slug, parent_id, sort_order, active)
select v.name, v.slug, p.id, 0, true
from (values
  ('Mille Miglia',  'chopard-mille-miglia'),
  ('Alpine Eagle',  'chopard-alpine-eagle'),
  ('L.U.C',         'chopard-luc'),
  ('Happy Sport',   'chopard-happy-sport')
) as v(name, slug)
join public.categories p on p.slug = 'chopard'
on conflict (slug) do nothing;
