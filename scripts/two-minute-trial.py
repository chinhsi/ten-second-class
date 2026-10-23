#!/usr/bin/env python3
"""Bounded two-minute trial. Credentials stay in memory; no existing classes changed.
--check: read-only connectivity; --validate: rollback-only migration/queue checks;
--migrate: apply the additive migration. --silence/--live require deployed code.
"""
import argparse,base64,concurrent.futures,datetime,hashlib,io,json,os,ssl,subprocess,time,urllib.request,urllib.error,uuid,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REF='fdfhyekuehybjkfyatjn'
CTX=ssl.create_default_context(cafile='/etc/ssl/cert.pem')
SECRETS=[]
def credential():
 for account in ('supabase','default','access-token'):
  p=subprocess.run(['security','find-generic-password','-s','Supabase CLI','-a',account,'-w'],capture_output=True,text=True,timeout=60)
  value=p.stdout.strip()
  if value.startswith('go-keyring-base64:'): value=base64.b64decode(value.split(':',1)[1]).decode()
  if p.returncode==0 and value.startswith('sbp_'):
   key=value;SECRETS.append(key);return key
 raise RuntimeError('Existing Supabase CLI credential unavailable')
def request(url,body=None,headers=None,method=None,timeout=30):
 data=json.dumps(body).encode() if body is not None and not isinstance(body,bytes) else body
 h={'Content-Type':'application/json',**(headers or {})}
 req=urllib.request.Request(url,data,headers=h,method=method)
 try:
  with urllib.request.urlopen(req,timeout=timeout,context=CTX) as r:
   content=r.read();return json.loads(content) if content else None
 except urllib.error.HTTPError as e:
  message=e.read().decode(errors='replace')
  for key in SECRETS:message=message.replace(key,'[redacted]')
  raise RuntimeError(f'HTTP {e.code}: {message[:800]}') from None
TOKEN=None
def sql(query):
 return request(f'https://api.supabase.com/v1/projects/{REF}/database/query',{'query':query},{'Authorization':'Bearer '+TOKEN},timeout=45)
AUDIO_DIR=Path('/private/tmp/ten-second-two-minute-trial')
def literal(value):return "'"+str(value).replace("'","''")+"'"
def generate_audio():
 AUDIO_DIR.mkdir(exist_ok=True)
 text="""I think we should check an artificial intelligence answer before using it in a lesson. A fluent answer can sound very confident even when the information is wrong. My first step would be to identify the main claim and ask what evidence would support it. For example, if the answer gives a date or describes a research finding, I would look for the original source. I would check whether the source really exists and whether it actually says what the answer claims. I would also compare the answer with another trustworthy source. Two websites repeating the same sentence do not necessarily provide two independent pieces of evidence. They might both be copying an earlier mistake. Another important step is to consider the context. An explanation that works for one group of learners may not work for a different age group or language background. The teacher needs to decide whether the examples fit the students and whether the task supports the intended learning goal. I would not ask the system to make that final decision for me. Instead, I would use its draft as a starting point and revise it using my knowledge of the class. If I could not verify an important claim, I would mark it as uncertain or leave it out. In the classroom I would invite students to compare a reliable answer with a misleading answer and explain their reasons. This makes checking information an activity that students can practise. My main conclusion is that artificial intelligence can help us prepare and explore ideas, but responsibility for the lesson remains with the teacher."""
 (AUDIO_DIR/'common.txt').write_text(text)
 subprocess.run(['say','-v','Samantha','-r','155','-o',str(AUDIO_DIR/'common.aiff'),'-f',str(AUDIO_DIR/'common.txt')],check=True,timeout=45)
 def convert(src,dest):
  subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(src),'-ar','16000','-ac','1','-c:a','pcm_s16le',str(dest)],check=True,timeout=20)
 convert(AUDIO_DIR/'common.aiff',AUDIO_DIR/'common.wav')
 with wave.open(str(AUDIO_DIR/'common.wav')) as w:duration=w.getnframes()/16000
 subprocess.run(['ffmpeg','-loglevel','error','-y','-i',str(AUDIO_DIR/'common.wav'),'-af',f'atempo={duration/111:.6f}','-ar','16000','-ac','1','-c:a','pcm_s16le',str(AUDIO_DIR/'body.wav')],check=True,timeout=20)
 with wave.open(str(AUDIO_DIR/'body.wav')) as w:body=w.readframes(w.getnframes())
 body=(body+b'\0'*(112*32000))[:112*32000]
 for i in range(1,16):
  tail=f'This is the end of student number {i}. The final word is pineapple.'
  subprocess.run(['say','-v','Samantha','-r','180','-o',str(AUDIO_DIR/'tail.aiff'),tail],check=True,timeout=20)
  convert(AUDIO_DIR/'tail.aiff',AUDIO_DIR/'tail.wav')
  with wave.open(str(AUDIO_DIR/'tail.wav')) as w:ending=w.readframes(w.getnframes())
  if len(ending)>8*32000:raise RuntimeError('Synthetic ending too long; no clips sent')
  pcm=body+ending
  with wave.open(str(AUDIO_DIR/f'{i:02}.wav'),'wb') as w:
   w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(pcm+b'\0'*(120*32000-len(pcm)))
 print('Generated 15 synthetic spoken WAV files, exactly 120 seconds, with end markers. No AI calls.')
def trial(live):
 report_path=ROOT/'reviews'/('two-minute-live-2026-10-23.json' if live else 'two-minute-silence-2026-10-23.json')
 if live and report_path.exists():raise RuntimeError('Live trial already recorded; refusing an automatic second paid run')
 if live and any(not (AUDIO_DIR/f'{i:02}.wav').exists() for i in range(1,16)):raise RuntimeError('Generate synthetic audio first')
 service_keys=request(f'https://api.supabase.com/v1/projects/{REF}/api-keys',headers={'Authorization':'Bearer '+TOKEN})
 service=next(x['api_key'] for x in service_keys if x['name']=='service_role');SECRETS.append(service)
 def rest(table,body=None,query='',method=None):
  return request(f'https://{REF}.supabase.co/rest/v1/{table}'+('?' +query if query else ''),body,{'apikey':service,'Authorization':'Bearer '+service,'Prefer':'return=representation'},method)
 endpoint=f'https://{REF}.supabase.co/functions/v1/ten-second'
 def call(a,**kw):return request(endpoint,dict(action=a,**kw),timeout=35)
 cid=str(uuid.uuid4());qid=str(uuid.uuid4());tid=str(uuid.uuid4());owner=str(uuid.uuid4())+str(uuid.uuid4());code=uuid.uuid4().hex[:10].upper()
 report={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mode':'synthetic speech with Gemini' if live else 'silence, no Gemini','class_id':cid,'question_id':qid,'students':15,'seconds_each':120,'status':'preparing','samples':[]}
 report_path.write_text(json.dumps(report,indent=2))
 # The test workspace is separate from the owner's real classes.
 rest('ts_teachers',{'id':tid,'display_name':'Temporary two-minute trial','key_hash':hashlib.sha256(owner.encode()).hexdigest(),'active':True})
 rest('ts_classes',{'id':cid,'title':'Temporary 15-student two-minute trial','code':code,'status':'active','teacher_id':tid})
 rest('ts_questions',{'id':qid,'class_id':cid,'mode':'answer','prompt':'Explain how a teacher should verify an AI answer. Transcribe the full recording, including the ending.','feedback_enabled':False,'max_seconds':120,'status':'active'})
 tokens=[uuid.uuid4().hex+uuid.uuid4().hex for _ in range(15)]
 members=[];paths=[];started=time.monotonic()
 def one(i):
  token=tokens[i];call('join',code=code,token=token,name=f'Synthetic {i+1}',studentId=f'TRIAL-{i+1}')
  ticket=call('start',code=code,token=token,questionId=qid)
  signed=call('upload_ticket',code=code,token=token,questionId=qid)
  if live:audio=(AUDIO_DIR/f'{i+1:02}.wav').read_bytes()
  else:
   out=io.BytesIO()
   with wave.open(out,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0'*(120*32000))
   audio=out.getvalue()
  request(signed['signedUrl'],audio,{'Content-Type':'audio/wav'},method='PUT',timeout=60)
  return {'index':i+1,'response_id':ticket['id'],'sha256':hashlib.sha256(audio).hexdigest(),'upload_seconds':round(time.monotonic()-started,2)}
 try:
  with concurrent.futures.ThreadPoolExecutor(max_workers=15) as pool:members=list(pool.map(one,range(15)))
  report['uploads']=members;report['status']='uploaded'
  print('15 full-length recordings uploaded; starting confirmations together.',flush=True)
  def submit(i):return call('submit_saved',code=code,token=tokens[i],questionId=qid)
  with concurrent.futures.ThreadPoolExecutor(max_workers=15) as pool:list(pool.map(submit,range(15)))
  report['all_submitted_seconds']=round(time.monotonic()-started,2)
  deadline=time.monotonic()+650;seen={};peak=0
  while time.monotonic()<deadline:
   rows=rest('ts_responses',query=f'question_id=eq.{qid}&select=id,status,worker_claimed_at,submitted_at,result,debug_error,path')
   counts={status:sum(r['status']==status for r in rows) for status in ['queued','processing','done','failed']}
   peak=max(peak,counts['processing'])
   elapsed=round(time.monotonic()-started,2)
   for r in rows:
    if r['status'] in ('done','failed') and r['id'] not in seen:seen[r['id']]=elapsed
   report['samples'].append({'elapsed_seconds':elapsed,**counts})
   print(json.dumps(report['samples'][-1]),flush=True)
   if all(r['status'] in ('done','failed') for r in rows):break
   time.sleep(8)
  report['peak_processing_observed']=peak
  report['results']=[{'id':r['id'],'status':r['status'],'completed_observed_seconds':seen.get(r['id']),'transcript_words':len((r.get('result') or {}).get('transcript','').split()),'ending_present':'pineapple' in (r.get('result') or {}).get('transcript','').lower(),'error':r.get('debug_error')} for r in rows]
  report['storage']=sql(f"select count(*) as files,min((metadata->>'size')::bigint) as min_bytes,max((metadata->>'size')::bigint) as max_bytes from storage.objects where bucket_id='ten-second-audio' and name like {literal(cid+'/%')}")
  report['passed']=len(rows)==15 and all(r['status']=='done' for r in rows) and peak<=4 and (not live or all(r['ending_present'] for r in report['results']))
  report['status']='complete'
 finally:
  report['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
  report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  # Delete only this generated workspace, after all its workers settle.
  try:
   call('delete_class',owner=owner,classId=cid)
   rest('ts_teachers',query=f'id=eq.{tid}',method='DELETE')
   report['cleanup']='test class, audio and temporary teacher removed'
  except Exception as e:report['cleanup']='pending: '+str(e)
  report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print('Trial report:',str(report_path),'PASS' if report.get('passed') else 'NOT PASSED',flush=True)
 if not report.get('passed'):raise RuntimeError('Trial did not pass; no automatic paid rerun')
def main():
 global TOKEN
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['check','validate','migrate','generate','silence','live']);args=p.parse_args()
 if args.mode=='generate':generate_audio();return
 TOKEN=credential()
 if args.mode in ('silence','live'):trial(args.mode=='live');return
 if args.mode=='check':
  print(json.dumps(sql("select now() as checked_at,status,count(*) from public.ts_responses group by status")));return
 migration=(ROOT/'supabase/migrations/202610230001_two_minute_recordings.sql').read_text()
 if args.mode=='validate':
  # No persistent modifications; assert queue ordering and a four-worker bound.
  probe="""
  do $$
  declare cid uuid:=gen_random_uuid();qid uuid:=gen_random_uuid();mid uuid;r record;n integer;
  begin
   if exists(select 1 from public.ts_responses where status in ('queued','processing')) then raise exception 'Active work exists; defer isolated queue test'; end if;
   insert into public.ts_classes(id,title,code) values(cid,'ROLLBACK ONLY queue validation',replace(cid::text,'-',''));
   insert into public.ts_questions(id,class_id,mode,prompt,max_seconds) values(qid,cid,'answer','validation',120);
   for i in 1..15 loop
    mid:=gen_random_uuid();
    insert into public.ts_members(id,class_id,name,student_id,token_hash) values(mid,cid,'test',i::text,mid::text);
    insert into public.ts_responses(question_id,member_id,status,path,submitted_at) values(qid,mid,'queued','test.wav',now());
   end loop;
   for i in 1..15 loop perform * from public.ts_claim_long_response(); end loop;
   select count(*) into n from public.ts_responses where question_id=qid and status='processing';
   if n<>4 then raise exception 'Concurrency was %, expected 4',n; end if;
   select count(*) into n from public.ts_responses where question_id=qid and status='queued';
   if n<>11 then raise exception 'Queue was %, expected 11',n; end if;
   begin
    insert into public.ts_members(class_id,name,student_id,token_hash) values(cid,'overflow','16',gen_random_uuid()::text);
    raise exception '16th member was accepted';
   exception when others then
    if SQLERRM not like '本課堂已達15人上限%' then raise; end if;
   end;
   update public.ts_responses set status='done' where id=(select id from public.ts_responses where question_id=qid and status='processing' limit 1);
   perform * from public.ts_claim_long_response();
   select count(*) into n from public.ts_responses where question_id=qid and status='processing';
   if n<>4 then raise exception 'Queue did not refill';end if;
  end $$;
  rollback;
  """
  sql(migration.rsplit('commit;',1)[0]+probe)
  print('PASS: migration rollback; 15 queued; exactly 4 processing; queue refills; 16th member rejected. No data retained, no AI.');return
 sql(migration);print('Applied additive two-minute migration; existing answers preserved.')
if __name__=='__main__':
 try:main()
 except Exception as e:
  msg=str(e)
  for key in SECRETS:msg=msg.replace(key,'[redacted]')
  print(msg[:1000]);raise SystemExit(1)
