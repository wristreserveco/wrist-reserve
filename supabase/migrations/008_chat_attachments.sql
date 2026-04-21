-- Wrist Reserve · chat attachments
-- Adds IG-style image/video attachments to the chat.

alter table public.messages
  add column if not exists attachment_url text,
  add column if not exists attachment_type text,
  add column if not exists attachment_name text;

-- Constrain the attachment kind. Drop + recreate so re-running migrations stays safe.
alter table public.messages
  drop constraint if exists messages_attachment_type_check;
alter table public.messages
  add constraint messages_attachment_type_check
  check (attachment_type is null or attachment_type in ('image', 'video'));

-- Allow attachment-only messages (no text body).
alter table public.messages
  alter column message drop not null;

-- At least one of {message, attachment_url} must be present.
alter table public.messages
  drop constraint if exists messages_has_content_check;
alter table public.messages
  add constraint messages_has_content_check
  check (
    (message is not null and length(btrim(message)) > 0)
    or attachment_url is not null
  );
