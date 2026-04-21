-- Wrist Reserve — adds visitor name to chat messages + enables realtime
-- Run once in Supabase SQL Editor (safe to re-run).

alter table public.messages
  add column if not exists user_name text;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
