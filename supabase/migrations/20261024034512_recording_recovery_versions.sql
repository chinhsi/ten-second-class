begin;
-- NULL retains compatibility with recordings started before this deployment.
alter table public.ts_responses add column if not exists recording_version uuid;
grant select,insert,update,delete on public.ts_responses to service_role;
revoke all on public.ts_responses from anon,authenticated;
notify pgrst,'reload schema';
commit;
