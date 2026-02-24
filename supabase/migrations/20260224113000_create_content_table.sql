create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'content_processing_status'
  ) then
    create type content_processing_status as enum (
      'pending',
      'processing',
      'completed',
      'failed'
    );
  end if;
end $$;

create table if not exists public.content (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text,
  body_text text,
  author text,
  publish_date timestamptz,
  summary text,
  category text,
  confidence_score double precision,
  metadata jsonb,
  needs_review boolean not null default false,
  processing_status content_processing_status not null default 'pending',
  processing_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_content_updated_at on public.content;
create trigger set_content_updated_at
before update on public.content
for each row
execute function public.set_updated_at();

create index if not exists idx_content_category on public.content (category);
create index if not exists idx_content_processing_status on public.content (processing_status);
create index if not exists idx_content_created_at on public.content (created_at desc);
