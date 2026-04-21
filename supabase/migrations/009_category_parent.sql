-- Wrist Reserve · two-level categories (e.g. Rolex → GMT)

alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete set null;

create index if not exists idx_categories_parent on public.categories (parent_id);
