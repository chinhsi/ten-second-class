begin;
do $$
declare cid uuid := gen_random_uuid(); qid uuid := gen_random_uuid();
begin
 insert into public.ts_classes(id,code,title) values(cid,replace(cid::text,'-',''),'Synthetic lock verification');
 insert into public.ts_questions(id,class_id,mode,prompt) values(qid,cid,'answer','Synthetic');
 if not public.ts_claim_summary(qid,'en','v1') then raise exception 'first claim failed'; end if;
 if public.ts_claim_summary(qid,'en','v1') then raise exception 'duplicate claim allowed'; end if;
 if public.ts_claim_summary(qid,'en','v2') then raise exception 'concurrent claim allowed'; end if;
 update public.ts_summaries set status='done' where question_id=qid;
 if public.ts_claim_summary(qid,'en','v1') then raise exception 'cached version regenerated'; end if;
 if not public.ts_claim_summary(qid,'en','v2') then raise exception 'new version blocked'; end if;
 if has_function_privilege('anon','public.ts_claim_summary(uuid,text,text)','execute') then raise exception 'anonymous claim access'; end if;
 if has_table_privilege('anon','public.ts_summaries','select') then raise exception 'anonymous summary access'; end if;
end $$;
rollback;
