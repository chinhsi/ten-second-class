begin;
create or replace function public.ts_prepare_class_delete(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Lock/cancel recording rows before checking workers. Concurrent submission
  -- either wins first and is detected below, or loses its recording-status CAS.
  -- Raising rolls back ALL cancellation and class/question status updates.
  update public.ts_classes set status='ended' where id=target;
  update public.ts_questions set status='closed' where class_id=target;
  update public.ts_responses set status='failed'
    where question_id in (select id from public.ts_questions where class_id=target)
      and status='recording';
  if exists(select 1 from public.ts_responses r join public.ts_questions q on q.id=r.question_id
    where q.class_id=target and r.status in ('queued','processing')) then
    raise exception '仍有錄音在處理，未刪除或取消任何錄音；請稍後再試。';
  end if;
end;
$$;
revoke all on function public.ts_prepare_class_delete(uuid) from public, anon, authenticated;
grant execute on function public.ts_prepare_class_delete(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
