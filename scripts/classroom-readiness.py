#!/usr/bin/env python3
"""One bounded classroom acceptance trial. Uses the existing credential/HTTP helpers.
No browser, no real student recordings, no automatic paid re-run.
"""
import re
import argparse, concurrent.futures, datetime, hashlib, importlib.util, io, json, statistics, subprocess, time, uuid, wave
from pathlib import Path
spec=importlib.util.spec_from_file_location('trial',Path(__file__).with_name('two-minute-trial.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ROOT=m.ROOT; AUDIO=Path('/private/tmp/ten-second-classroom-trial'); REPORT=ROOT/'reviews/classroom-readiness-2026-10-24.json'
MIGRATION=ROOT/'supabase/migrations/20261024004354_classroom_readiness.sql'
def generate():
 AUDIO.mkdir(exist_ok=True)
 # Deliberate phrase-level switches; synthetic voices are NOT a claim about natural speech quality.
 phrases=[
 ('Sinji','我覺得呢個方法唔係淨係叫學生記答案，而係要畀佢哋自己試。'),
 ('Samantha','For example, we can ask students to explain their prior knowledge.'),
 ('Tingting','我同意这个想法，但是我们还要考虑学生有没有足够的时间。'),
 ('Sinji','如果老師一開始就講晒個答案，佢哋可能唔會再諗點解。'),
 ('Samantha','The important part is formative assessment, not just getting the correct answer.'),
 ('Sinji','所以我會先問，你點樣知道呢個解釋係啱嘅？'),
 ('Tingting','然后让他们比较两种解释，说出自己的理由，也可以修改原来的想法。'),
 ('Samantha','I would give feedback after listening to the explanation.'),
 ('Sinji','有啲同學可能識個概念，但係一時唔知點樣用英文講，咁都唔代表佢唔明。'),
 ('Tingting','学生可以换一种语言表达，我们应该看他的意思，而不是只看语言。'),
 ('Samantha','Code switching can help students connect an unfamiliar term with something they already understand.'),
 ('Sinji','我唔會即刻打斷佢，等佢講完先，再問返佢頭先嗰個例子。'),
 ('Tingting','如果例子和结论不一致，老师可以请他再解释一次。'),
 ('Samantha','That gives the teacher evidence of understanding, and gives students a chance to revise.'),
 ('Sinji','最後大家一齊比較，睇下邊個理由有證據支持，唔係淨係揀講得最流利嗰個。'),
 ]
 pcm=b''
 for i,(voice,text) in enumerate(phrases):
  source=AUDIO/f'phrase-{i}.aiff';dest=AUDIO/f'phrase-{i}.wav'
  subprocess.run(['say','-v',voice,'-r','175','-o',str(source),text],check=True,timeout=30)
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(dest)],check=True)
  with wave.open(str(dest)) as w: pcm+=w.readframes(w.getnframes())+b'\0'*3200
 with wave.open(str(AUDIO/'body.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(pcm)
 duration=len(pcm)/32000
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(AUDIO/'body.wav'),'-af',f'atempo={duration/111:.6f}','-ar','16000','-ac','1','-c:a','pcm_s16le',str(AUDIO/'paced.wav')],check=True)
 with wave.open(str(AUDIO/'paced.wav')) as w: pcm=w.readframes(w.getnframes())
 pcm=(pcm+b'\0'*(112*32000))[:112*32000]
 references=[]
 for i in range(1,11):
  tail=f'This is student number {i}. The final word is pineapple.'
  subprocess.run(['say','-v','Samantha','-r','180','-o',str(AUDIO/'tail.aiff'),tail],check=True,timeout=30)
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(AUDIO/'tail.aiff'),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(AUDIO/'tail.wav')],check=True)
  with wave.open(str(AUDIO/'tail.wav')) as w: ending=w.readframes(w.getnframes())
  assert len(ending)<=8*32000
  with wave.open(str(AUDIO/f'{i:02}.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(pcm+ending+b'\0'*(120*32000-len(pcm)-len(ending)))
  references.append({'student':i,'reference':' '.join(t for _,t in phrases)+' '+tail,'sha256':hashlib.sha256((AUDIO/f'{i:02}.wav').read_bytes()).hexdigest()})
 (ROOT/'reviews/classroom-mixed-references-2026-10-24.json').write_text(json.dumps({'scope':'Synthetic phrase-level Cantonese/Mandarin/English switching; not natural single-speaker intra-word switching','voices':['Sinji','Tingting','Samantha'],'seconds':120,'references':references},ensure_ascii=False,indent=2))
 print('Generated 10 synthetic mixed-language WAVs, 120 seconds each. No AI calls.')
def setup():
 m.TOKEN=m.credential()
 keys=m.request(f'https://api.supabase.com/v1/projects/{m.REF}/api-keys',headers={'Authorization':'Bearer '+m.TOKEN})
 service=next(x['api_key'] for x in keys if x['name']=='service_role');m.SECRETS.append(service)
 def rest(table,body=None,query='',method=None):
  return m.request(f'https://{m.REF}.supabase.co/rest/v1/{table}'+('?' +query if query else ''),body,{'apikey':service,'Authorization':'Bearer '+service,'Prefer':'return=representation'},method)
 return rest
ENDPOINT=f'https://{m.REF}.supabase.co/functions/v1/ten-second'
def call(action,**kw):return m.request(ENDPOINT,dict(action=action,**kw),timeout=60)
def migrate():
 m.TOKEN=m.credential()
 source=MIGRATION.read_text()
 probe="""
 do $$ declare tid uuid:=gen_random_uuid();cid uuid:=gen_random_uuid();qid uuid:=gen_random_uuid(); begin
 insert into public.ts_teachers(id,display_name,key_hash) values(tid,'ROLLBACK readiness',tid::text);
 insert into public.ts_classes(id,title,code,teacher_id) values(cid,'ROLLBACK readiness',cid::text,tid);
 insert into public.ts_questions(class_id,mode,prompt,max_seconds) values(cid,'answer','20 seconds',20);
 begin
 insert into public.ts_questions(id,class_id,mode,prompt,max_seconds) values(qid,cid,'answer','120 denied',120);
 raise exception 'Unauthorized long question accepted';
 exception when others then if SQLERRM not like '此老師帳號未開放%' then raise;end if;end;
 update public.ts_teachers set allow_long_recordings=true where id=tid;
 insert into public.ts_questions(id,class_id,mode,prompt,max_seconds) values(qid,cid,'answer','120 allowed',120);
 update public.ts_teachers set allow_long_recordings=false where id=tid;
 begin
 update public.ts_questions set status='active' where id=qid;
 raise exception 'Revoked long question opened';
 exception when others then if SQLERRM not like '此老師帳號未開放%' then raise;end if;end;
 end $$;
 rollback;
 """
 m.sql(source.rsplit('commit;',1)[0]+probe)
 print('Rollback verified: 20 seconds accepted, unauthorized 120 rejected, explicit grant accepted, revoked opening rejected.')
 m.sql(source);print('Migration applied. Existing recordings preserved.')
def live():
 if REPORT.exists():raise RuntimeError('Existing live report: refusing paid re-run')
 assert all((AUDIO/f'{i:02}.wav').exists() for i in range(1,11)),'Generate audio first'
 rest=setup(); baseline=m.sql('select status,count(*) from public.ts_responses group by status')
 if any(r['status'] in ('queued','processing') for r in baseline):raise RuntimeError('Real work active: defer acceptance trial')
 tid=str(uuid.uuid4());owner=uuid.uuid4().hex+uuid.uuid4().hex;cid=None
 report={'status':'started','scope':'10 synthetic mixed-language recordings through deployed Edge; not physical phones or classroom Wi-Fi','baseline':baseline,'checks':{}}
 REPORT.write_text(json.dumps(report))
 try:
  rest('ts_teachers',{'id':tid,'display_name':'Temporary classroom readiness','key_hash':hashlib.sha256(owner.encode()).hexdigest(),'active':True})
  profile=call('teacher_profile',owner=owner);assert profile['allowLongRecordings'] is False
  cls=call('create',owner=owner,title='Temporary Monday readiness');cid=cls['id'];code=cls['code']
  qdata=dict(owner=owner,classId=cid,mode='answer',prompt='Share your thoughts about learning.',feedbackEnabled=False,responseLanguage='auto')
  short=call('save_question',**qdata,maxSeconds=20)
  try:call('save_question',**qdata,maxSeconds=120);raise AssertionError('Unauthorized long accepted')
  except RuntimeError as e:assert '未開放' in str(e)
  try:call('teacher_recording_access',owner=owner,id=tid,allowed=True);raise AssertionError('Teacher self-escalation accepted')
  except RuntimeError as e:assert '403' in str(e)
  rest('ts_teachers',{'allow_long_recordings':True},f'id=eq.{tid}',method='PATCH')
  assert call('teacher_profile',owner=owner)['allowLongRecordings'] is True
  q=call('save_question',**qdata,maxSeconds=120);qid=q['id'];report.update(class_id=cid,question_id=qid)
  call('class_status',owner=owner,classId=cid,status='active');call('open_question',owner=owner,classId=cid,id=qid)
  tokens=[uuid.uuid4().hex+uuid.uuid4().hex for _ in range(10)]
  def prepare(i):
   call('join',code=code,token=tokens[i],name=f'Synthetic {i+1}',studentId=f'READINESS-{i+1}')
   ticket=call('start',code=code,token=tokens[i],questionId=qid)
   signed=call('upload_ticket',code=code,token=tokens[i],questionId=qid,version=ticket['recording_version'])
   return ticket,signed
  with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:prepared=list(pool.map(prepare,range(10)))
  report['checks']['teacher_and_permission']=True
  started=time.monotonic()
  def one(i):
   ticket,signed=prepared[i];start=time.monotonic()
   m.request(signed['signedUrl'],(AUDIO/f'{i+1:02}.wav').read_bytes(),{'Content-Type':'audio/wav'},method='PUT',timeout=90)
   uploaded=time.monotonic()
   call('submit_saved',code=code,token=tokens[i],questionId=qid,version=ticket['recording_version'])
   return {'student':i+1,'id':ticket['id'],'upload_seconds':round(uploaded-start,3),'confirmation_seconds':round(time.monotonic()-uploaded,3),'submitted_elapsed_seconds':round(time.monotonic()-started,3)}
  with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:report['clients']=list(pool.map(one,range(10)))
  deadline=time.monotonic()+180
  while True:
   rows=rest('ts_responses',query=f'question_id=eq.{qid}&select=id,status,submitted_at,worker_claimed_at,worker_started_at,ai_started_at,processing_completed_at,provider_attempts,result,debug_error,path')
   if len(rows)==10 and all(r['status'] in ('done','failed') for r in rows):break
   if time.monotonic()>deadline:raise RuntimeError('Acceptance deadline: no automatic re-run')
   time.sleep(2)
  report['observed_all_terminal_seconds']=round(time.monotonic()-started,3)
  report['results']=rows
  REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2))
  def dt(v):return datetime.datetime.fromisoformat(re.sub(r'\.(\d+)(?=[+-]|Z|$)',lambda m: '.'+m[1].ljust(6,'0')[:6],v).replace('Z','+00:00'))
  for r in rows:
   r['queue_seconds']=(dt(r['worker_claimed_at'])-dt(r['submitted_at'])).total_seconds() if r['worker_claimed_at'] else None
   r['dispatch_and_download_seconds']=(dt(r['ai_started_at'])-dt(r['worker_claimed_at'])).total_seconds() if r['ai_started_at'] else None
   r['assessment_seconds']=(dt(r['processing_completed_at'])-dt(r['ai_started_at'])).total_seconds() if r['processing_completed_at'] and r['ai_started_at'] else None
   transcript=(r.get('result') or {}).get('transcript','')
   r['ending_present']='pineapple' in transcript.lower()
   r['cantonese_preserved']=sum(word in transcript for word in ['唔','佢','嘅','嗰','畀'])>=3
   r['english_terms_preserved']=all(word in transcript.lower().replace('-', ' ') for word in ['prior knowledge','formative assessment','feedback','code switching'])
  report['results']=rows;report['checks']['ten_complete']=len(rows)==10 and all(r['status']=='done' and r['ending_present'] for r in rows)
  report['checks']['mixed_language_markers']=all(r['cantonese_preserved'] and r['english_terms_preserved'] for r in rows)
  # Duplicate submission must not restart a completed recording.
  first=rows[0]; index=next(i for i,t in enumerate(prepared) if t[0]['id']==first['id'])
  call('submit_saved',code=code,token=tokens[index],questionId=qid,version=prepared[index][0]['recording_version'])
  same=rest('ts_responses',query=f"id=eq.{first['id']}&select=processing_completed_at")[0]
  assert same['processing_completed_at']==first['processing_completed_at'];report['checks']['duplicate_no_restart']=True
  dashboard=call('dashboard',owner=owner,classId=cid);assert len(dashboard['responses'])==10
  audio=call('audio',owner=owner,id=first['id']);assert audio.get('signedUrl');report['checks']['teacher_dashboard_audio']=True
  # Recovery on separate silent audio: no additional paid inference or alteration of real responses.
  recovery=call('save_question',**qdata,maxSeconds=120);rid=recovery['id'];call('open_question',owner=owner,classId=cid,id=rid)
  ticket=call('start',code=code,token=tokens[0],questionId=rid);signed=call('upload_ticket',code=code,token=tokens[0],questionId=rid,version=ticket['recording_version'])
  buf=io.BytesIO()
  with wave.open(buf,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0'*32000)
  m.request(signed['signedUrl'],buf.getvalue(),{'Content-Type':'audio/wav'},method='PUT')
  # Normal saved submission followed by two isolated failed/expired-state recovery checks.
  call('submit_saved',code=code,token=tokens[0],questionId=rid,version=ticket['recording_version'])
  def wait_done():
   for _ in range(35):
    row=rest('ts_responses',query=f"id=eq.{ticket['id']}&select=*")[0]
    if row['status']=='done':return row
    time.sleep(1)
   raise RuntimeError('Silent recovery did not finish')
  recovered=wait_done()
  for state in ['failed','processing']:
   expired=(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(minutes=4)).isoformat()
   rest('ts_responses',{'status':state,'worker_claimed_at':expired},f"id=eq.{ticket['id']}",method='PATCH')
   call('retry',owner=owner,id=ticket['id']);after=wait_done();assert after['path']==recovered['path']
  report['checks']['failed_and_expired_recovery']=True
  report['status']='complete';report['passed']=all(report['checks'].values())
 finally:
  REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2))
  if cid:
   call('delete_class',owner=owner,classId=cid)
  rest('ts_teachers',query=f'id=eq.{tid}',method='DELETE')
  report['cleanup']='temporary class/audio/teacher removed'
  report['after_cleanup']=m.sql('select status,count(*) from public.ts_responses group by status')
  REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2))
 print(json.dumps({k:v for k,v in report.items() if k not in ['results','clients']},ensure_ascii=False))
 if not report.get('passed'):raise RuntimeError('Acceptance has unresolved checks; do not automatically re-run')
def twenty():
 rest=setup();tid=str(uuid.uuid4());owner=uuid.uuid4().hex+uuid.uuid4().hex;cid=None
 try:
  rest('ts_teachers',{'id':tid,'display_name':'Temporary 20 second check','key_hash':hashlib.sha256(owner.encode()).hexdigest(),'active':True})
  cls=call('create',owner=owner,title='Temporary 20 second check');cid=cls['id'];code=cls['code']
  q=call('save_question',owner=owner,classId=cid,mode='answer',prompt='Silent upload check',feedbackEnabled=False,maxSeconds=20)
  call('class_status',owner=owner,classId=cid,status='active');call('open_question',owner=owner,classId=cid,id=q['id'])
  token=uuid.uuid4().hex;call('join',code=code,token=token,name='Synthetic silence',studentId='20-SECOND')
  ticket=call('start',code=code,token=token,questionId=q['id'])
  buf=io.BytesIO()
  with wave.open(buf,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0'*640000)
  call('submit',code=code,token=token,questionId=q['id'],audio=m.base64.b64encode(buf.getvalue()).decode())
  for _ in range(30):
   row=rest('ts_responses',query=f"id=eq.{ticket['id']}&select=status,result")[0]
   if row['status']=='done':break
   time.sleep(1)
  assert row['status']=='done' and row['result']['level']=='unscorable'
  print('PASS: full 20-second 640044-byte WAV accepted through live HTTP; silence completed without AI.')
 finally:
  if cid:call('delete_class',owner=owner,classId=cid)
  rest('ts_teachers',query=f'id=eq.{tid}',method='DELETE')
def main():
 global REPORT
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['generate','migrate','live','twenty']);p.add_argument('--report-repair-run',action='store_true');a=p.parse_args()
 if a.report_repair_run:REPORT=ROOT/'reviews/classroom-readiness-2026-10-24-report-repair.json'
 {'generate':generate,'migrate':migrate,'live':live,'twenty':twenty}[a.mode]()
if __name__=='__main__':
 try:main()
 except Exception as e:
  msg=str(e)
  for key in m.SECRETS:msg=msg.replace(key,'[redacted]')
  print(msg[:1200]);raise SystemExit(1)
