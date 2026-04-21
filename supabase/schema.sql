e need to do create index if not exists idx_messages_unread
  on public.messages (user_email, sender)
  where read_at is null;

-- Orders: authenticated admin read; inserts happen via service role (webhook)
drop policy if exists "orders_select_authenticated" on public.orders;
create policy "orders_select_authenticated"
  on public.orders for select
  to authenticated
  using (true);

-- Realtime: enable inserts/updates to be pushed to subscribers
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
