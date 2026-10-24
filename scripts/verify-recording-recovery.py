#!/usr/bin/env python3
"""Isolated live version/recovery checks, silent WAVs only: no AI/browser."""
import importlib.util, io, wave, uuid, hashlib, json, time, sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('readiness',Path(__file__).with_name('classroom-readiness.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
m=c.m
def main():
 rest=c.setup()
 baseline=m.sql('select status,count(*) from public.ts_responses group by status')
 assert all(r['status']=='done' for r in baseline), 'Existing unfinished work: defer deployment/test'
 if '--migrate' in sys.argv:
  m.sql((m.ROOT/'supabase/migrations/20261024034512_recording_recovery_versions.sql').read_text())
  print('Additive version migration applied; existing responses all done.');return
 tid=str(uuid.uuid4());owner=uuid.uuid4().hex+uuid.uuid4().hex;cid=None
 report={'baseline':baseline,'checks':[]}
 def passed(s):report['checks'].append(s)
 def silence(seconds):
  b=io.BytesIO()
  with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0'*(32000*seconds))
  return b.getvalue()
 try:
  rest('ts_teachers',{'id':tid,'display_name':'Temporary recovery verification','key_hash':hashlib.sha256(owner.encode()).hexdigest(),'active':True,'allow_long_recordings':True})
  cls=c.call('create',owner=owner,title='Temporary version recovery');cid=cls['id'];code=cls['code']
  q=c.call('save_question',owner=owner,classId=cid,mode='answer',prompt='Silent recovery',feedbackEnabled=False,maxSeconds=120)
  c.call('class_status',owner=owner,classId=cid,status='active');c.call('open_question',owner=owner,classId=cid,id=q['id'])
  token=uuid.uuid4().hex;c.call('join',code=code,token=token,name='Synthetic silence',studentId='RECOVERY')
  def call(action,**kw):return c.call(action,code=code,token=token,questionId=q['id'],**kw)
  def denied(action,code,**kw):
   try:call(action,**kw)
   except RuntimeError as e:assert code in str(e);return
   raise AssertionError('Expected rejection '+action)
  first=call('start');a=first['recording_version'];assert a
  signed=call('upload_ticket',version=a)
  m.request(signed['signedUrl'],silence(1),{'Content-Type':'audio/wav'},method='PUT')
  b=str(uuid.uuid4())
  assert call('discard_recording',version=a,nextVersion=b)['discarded']
  assert call('discard_recording',version=a,nextVersion=b)['discarded']
  passed('Discard after successful PUT; lost-ack retry is idempotent')
  denied('submit_saved','STALE_RECORDING',version=a);denied('upload_ticket','STALE_RECORDING',version=a)
  assert call('start')['recording_version']==b
  new=call('upload_ticket',version=b);assert new['signedUrl']!=signed['signedUrl']
  m.request(new['signedUrl'],silence(2),{'Content-Type':'audio/wav'},method='PUT')
  # Late old signed PUT cannot affect the new path, even if it succeeds.
  try:m.request(signed['signedUrl'],silence(1),{'Content-Type':'audio/wav'},method='PUT')
  except RuntimeError:pass
  denied('submit_saved','STALE_RECORDING',version=a)
  assert call('submit_saved',version=b)['received'];assert call('submit_saved',version=b)['received']
  for _ in range(40):
   row=rest('ts_responses',query=f"id=eq.{first['id']}&select=*")[0]
   if row['status']=='done':break
   time.sleep(1)
  assert row['status']=='done' and row['result']['level']=='unscorable'
  assert row['path'].endswith(f"{first['id']}-{b}.wav")
  objects=m.sql("select metadata->>'size' as size from storage.objects where bucket_id='ten-second-audio' and name='"+row['path']+"'")
  assert int(objects[0]['size'])==len(silence(2))
  passed('Old submission rejected; new 2-second file accepted and processed without AI')
  denied('discard_recording','ALREADY_RECEIVED',version=b,nextVersion=str(uuid.uuid4()))
  assert call('discard_recording',version=a,nextVersion=b)['discarded']
  unchanged=rest('ts_responses',query=f"id=eq.{first['id']}&select=path,status,processing_completed_at")[0]
  assert unchanged['path']==row['path'] and unchanged['processing_completed_at']==row['processing_completed_at']
  passed('Accepted recording protected; duplicate requests do not restart processing')
  report['passed']=True
 finally:
  out=m.ROOT/'reviews/recording-recovery-2026-10-24.json';out.write_text(json.dumps(report,indent=2))
  if cid:c.call('delete_class',owner=owner,classId=cid)
  rest('ts_teachers',query=f'id=eq.{tid}',method='DELETE')
  report['after_cleanup']=m.sql('select status,count(*) from public.ts_responses group by status')
  assert report['after_cleanup']==baseline
  report['cleanup']='Temporary class/audio/teacher removed; baseline unchanged'
  out.write_text(json.dumps(report,indent=2));print(json.dumps(report))
if __name__=='__main__':
 try:main()
 except Exception as e:
  message=str(e)
  for secret in m.SECRETS:message=message.replace(secret,'[redacted]')
  print(message[:1200]);sys.exit(1)
