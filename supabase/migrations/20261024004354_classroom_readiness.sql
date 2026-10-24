begin;
alter table public.ts_teachers add column if not exists allow_long_recordings boolean not null default false;
alter table public.ts_questions drop constraint if exists ts_questions_max_seconds_check;
alter table public.ts_questions add constraint ts_questions_max_seconds_check check(max_seconds in (10,20,120));
alter table public.ts_responses add column if not exists ai_started_at timestamptz;
alter table public.ts_responses add column if not exists processing_completed_at timestamptz;
alter table public.ts_responses add column if not exists provider_attempts jsonb;
create or replace function public.ts_long_question_limit() returns trigger language plpgsql set search_path='' as $$
declare teacher uuid;
begin
 if new.max_seconds=120 and (TG_OP='INSERT' or new.status in ('draft','active')) then
   select teacher_id into teacher from public.ts_classes where id=new.class_id for update;
   if teacher is not null and not exists(select 1 from public.ts_teachers where id=teacher and active and allow_long_recordings) then
     raise exception '此老師帳號未開放兩分鐘錄音';
   end if;
   if (select count(*) from public.ts_members where class_id=new.class_id)>15 then raise exception '本課堂已達兩分鐘模式的15人上限，請另建小班課堂'; end if;
 end if;
 return new;
end $$;
drop trigger if exists ts_long_question_limit on public.ts_questions;
create trigger ts_long_question_limit before insert or update of max_seconds,class_id,status on public.ts_questions for each row execute function public.ts_long_question_limit();
revoke all on public.ts_teachers,public.ts_questions,public.ts_responses from anon,authenticated;
grant select,insert,update,delete on public.ts_teachers,public.ts_questions,public.ts_responses to service_role;
notify pgrst,'reload schema';
commit;
