begin;
alter table public.ts_questions add column if not exists max_seconds integer not null default 10 check (max_seconds in (10,120));
alter table public.ts_responses drop constraint if exists ts_responses_status_check;
alter table public.ts_responses add constraint ts_responses_status_check check (status in ('recording','queued','processing','done','failed'));
alter table public.ts_responses add column if not exists worker_token uuid;
alter table public.ts_responses add column if not exists worker_claimed_at timestamptz;
alter table public.ts_responses add column if not exists worker_started_at timestamptz;
update storage.buckets set file_size_limit=3840044 where id='ten-second-audio';
-- Explicit grants survive a fresh schema build under the October 30 defaults.
grant select,insert,update,delete on public.ts_questions,public.ts_responses to service_role;
revoke all on public.ts_questions,public.ts_responses from anon,authenticated;

create or replace function public.ts_limit_class_rows() returns trigger language plpgsql set search_path='' as $$
declare cap integer;
begin
 perform 1 from public.ts_classes where id=new.class_id for update;
 if TG_TABLE_NAME='ts_members' then
   cap := case when exists(select 1 from public.ts_questions where class_id=new.class_id and max_seconds=120) then 15 else 150 end;
   if (select count(*) from public.ts_members where class_id=new.class_id)>=cap then raise exception '本課堂已達%人上限',cap; end if;
 else
   if (select count(*) from public.ts_questions where class_id=new.class_id)>=80 then raise exception '本課堂已達80題上限'; end if;
 end if;
 return new;
end $$;
create or replace function public.ts_long_question_limit() returns trigger language plpgsql set search_path='' as $$
begin
 if new.max_seconds=120 then
   perform 1 from public.ts_classes where id=new.class_id for update;
   if (select count(*) from public.ts_members where class_id=new.class_id)>15 then raise exception '本課堂已達兩分鐘模式的15人上限，請另建小班課堂'; end if;
 end if;
 return new;
end $$;
drop trigger if exists ts_long_question_limit on public.ts_questions;
create trigger ts_long_question_limit before insert or update of max_seconds,class_id on public.ts_questions for each row execute function public.ts_long_question_limit();

-- One atomic claim per slot across all Edge Function instances. Expired work is
-- left for explicit teacher recovery, never endlessly retried by this queue.
create or replace function public.ts_claim_long_response() returns setof public.ts_responses
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 perform pg_advisory_xact_lock(20261023,1);
 if (select count(*) from public.ts_responses r join public.ts_questions q on q.id=r.question_id
     where q.max_seconds=120 and r.status='processing' and r.worker_claimed_at>now()-interval '180 seconds') >=4 then return; end if;
 select r.id into rid from public.ts_responses r join public.ts_questions q on q.id=r.question_id
 where r.status='queued' and q.max_seconds=120 order by r.submitted_at,r.id limit 1 for update of r skip locked;
 if rid is null then return; end if;
 return query update public.ts_responses set status='processing',worker_token=gen_random_uuid(),worker_claimed_at=now(),worker_started_at=null
 where id=rid and status='queued' returning *;
end $$;
revoke all on function public.ts_claim_long_response() from public,anon,authenticated;
grant execute on function public.ts_claim_long_response() to service_role;
notify pgrst,'reload schema';
commit;
