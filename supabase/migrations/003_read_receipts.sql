-- Wrist Reserve — Instagram-style read receipts on messages
-- Run once in Supabase SQL Editor (safe to re-run).

alter table public.messages
  add column if not exists read_at timestamptz;

create index if not exists idx_messages_unread
  on public.messages (user_email, sender)
  where read_at is null;

-- Admin (authenticated) can flip read_at when viewing a thread.
drop policy if exists "messages_update_authenticated" on public.messages;
create policy "messages_update_authenticated"
  on public.messages for update
  to authenticated
  using (true)
  with check (true);
