-- Per-teacher workspaces. Existing classes stay in the original owner's workspace.
begin;
create table if not exists public.ts_teachers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(display_name) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ts_teachers add column if not exists key_hash text unique;
alter table public.ts_teachers enable row level security;
revoke all on public.ts_teachers from anon, authenticated;
grant all on public.ts_teachers to service_role;
alter table public.ts_classes add column if not exists teacher_id uuid
  references public.ts_teachers(id) on delete restrict;
create index if not exists ts_classes_teacher_idx on public.ts_classes(teacher_id);
commit;
