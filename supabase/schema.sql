begin;
create table if not exists public.ts_classes (
 id uuid primary key default gen_random_uuid(), code text unique not null, title text not null,
 status text not null default 'draft' check(status in ('draft','active','ended')), created_at timestamptz default now());
create table if not exists public.ts_questions (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.ts_classes on delete cascade,
 mode text not null check(mode in ('pronunciation','answer')), prompt text not null, rubric text not null default '',
 response_language text not null default 'auto' check(response_language in ('auto','mandarin','cantonese','english')),
 feedback_enabled boolean not null default true,
 status text not null default 'draft' check(status in ('draft','active','closed')), position integer not null default 0);
create unique index if not exists ts_one_active on public.ts_questions(class_id) where status='active';
create table if not exists public.ts_members (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.ts_classes on delete cascade,
 name text not null, student_id text not null, token_hash text unique not null, joined_at timestamptz default now(), unique(class_id,student_id));
create table if not exists public.ts_responses (
 id uuid primary key default gen_random_uuid(), question_id uuid not null references public.ts_questions on delete cascade,
 member_id uuid not null references public.ts_members on delete cascade,
 status text not null default 'recording' check(status in ('recording','processing','done','failed')),
 started_at timestamptz not null default now(), submitted_at timestamptz, path text, result jsonb,
 unique(question_id,member_id));
alter table public.ts_classes enable row level security;
alter table public.ts_questions enable row level security;
alter table public.ts_members enable row level security;
alter table public.ts_responses enable row level security;
revoke all on public.ts_classes,public.ts_questions,public.ts_members,public.ts_responses from anon,authenticated;
grant all on public.ts_classes,public.ts_questions,public.ts_members,public.ts_responses to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ten-second-audio','ten-second-audio',false,320044,array['audio/wav']) on conflict(id) do nothing;
create or replace function public.ts_open_question(qid uuid, cid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.ts_classes where id=cid and status='active' for update;
 if not found then raise exception '課堂尚未啟用'; end if;
 if not exists(select 1 from public.ts_questions where id=qid and class_id=cid) then raise exception '找不到題目'; end if;
 update public.ts_questions set status='closed' where class_id=cid and status='active';
 update public.ts_questions set status='active' where id=qid;
end $$;
revoke all on function public.ts_open_question(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ts_open_question(uuid,uuid) to service_role;
alter table public.ts_responses add column if not exists debug_error text;
alter table public.ts_questions add column if not exists response_language text not null default 'auto';
alter table public.ts_questions add column if not exists feedback_enabled boolean not null default true;
create or replace function public.ts_limit_class_rows() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.ts_classes where id=new.class_id for update;
 if TG_TABLE_NAME='ts_members' then
   if (select count(*) from public.ts_members where class_id=new.class_id)>=150 then raise exception '本課堂已達150人上限'; end if;
 else
   if (select count(*) from public.ts_questions where class_id=new.class_id)>=80 then raise exception '本課堂已達80題上限'; end if;
 end if;
 return new;
end $$;
drop trigger if exists ts_member_limit on public.ts_members;
create trigger ts_member_limit before insert on public.ts_members for each row execute function public.ts_limit_class_rows();
drop trigger if exists ts_question_limit on public.ts_questions;
create trigger ts_question_limit before insert on public.ts_questions for each row execute function public.ts_limit_class_rows();
commit;
