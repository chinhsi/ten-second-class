begin;
create or replace function public.ts_guard_recording_start()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_class uuid;
  class_status text;
  question_status text;
begin
  select class_id into target_class from public.ts_questions where id=new.question_id;
  -- Match delete preparation's class -> question lock order. SHARE conflicts
  -- with its status UPDATE; KEY SHARE would not protect non-key status fields.
  select status into class_status from public.ts_classes where id=target_class for share;
  select status into question_status from public.ts_questions
    where id=new.question_id and class_id=target_class for share;
  if class_status is distinct from 'active' or question_status is distinct from 'active' then
    raise exception '課堂或題目已關閉，不能開始新錄音';
  end if;
  return new;
end;
$$;
revoke all on function public.ts_guard_recording_start() from public, anon, authenticated;
create trigger ts_guard_recording_start before insert on public.ts_responses
for each row execute function public.ts_guard_recording_start();
commit;
