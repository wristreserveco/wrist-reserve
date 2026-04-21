-- Enable Supabase Realtime for orders so the admin dashboard gets live pushes
-- on new orders (no polling, no external services).
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
