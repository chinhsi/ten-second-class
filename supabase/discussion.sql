begin;
create table if not exists public.ts_summaries (
 question_id uuid not null references public.ts_questions on delete cascade,
 language text not null check(language in ('en','zh')),
 fingerprint text not null,
 status text not null check(status in ('processing','done','failed')),
 result jsonb,
 started_at timestamptz not null default now(),
 primary key(question_id,language)
);
alter table public.ts_summaries enable row level security;
revoke all on public.ts_summaries from anon,authenticated;
grant all on public.ts_summaries to service_role;
create or replace function public.ts_claim_summary(qid uuid, lang text, version text) returns boolean
language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
 insert into public.ts_summaries(question_id,language,fingerprint,status)
 values(qid,lang,version,'processing')
 on conflict(question_id,language) do update
 set fingerprint=excluded.fingerprint,status='processing',result=null,started_at=now()
 where (ts_summaries.status <> 'processing' or ts_summaries.started_at < now()-interval '90 seconds')
 and (ts_summaries.status <> 'done' or ts_summaries.fingerprint <> excluded.fingerprint)
 returning question_id into claimed;
 return claimed is not null;
end $$;
revoke all on function public.ts_claim_summary(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ts_claim_summary(uuid,text,text) to service_role;
commit;
