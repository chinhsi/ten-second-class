begin;
do $$
declare c uuid; q uuid; m uuid; r uuid; rejected boolean:=false;
begin
insert into public.ts_classes(code,title,status) values ('G'||substr(replace(gen_random_uuid()::text,'-',''),1,10),'Temporary guard verification','active') returning id into c;
insert into public.ts_questions(class_id,mode,prompt,status) values(c,'answer','Guard test','active') returning id into q;
insert into public.ts_members(class_id,name,student_id,token_hash) values(c,'Synthetic','GUARD',gen_random_uuid()::text) returning id into m;
insert into public.ts_responses(question_id,member_id) values(q,m) returning id into r;
delete from public.ts_responses where id=r;
perform public.ts_prepare_class_delete(c);
begin
insert into public.ts_responses(question_id,member_id) values(q,m);
exception when raise_exception then
if sqlerrm not like '%不能開始新錄音%' then raise; end if;
rejected:=true;
end;
if not rejected then raise exception 'Guard failed'; end if;
end $$;
select 'PASS active start accepted; insert after delete preparation rejected; all fixtures rolled back' as result;
rollback;
