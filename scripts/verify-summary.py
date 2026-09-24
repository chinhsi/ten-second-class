"""Creates only synthetic transcripts, checks live summaries (at most two AI jobs), then deletes test data."""
import json, subprocess, uuid, urllib.request, urllib.error, ssl, os
from pathlib import Path
ref='fdfhyekuehybjkfyatjn'
endpoint=f'https://{ref}.supabase.co/functions/v1/ten-second'
owner=os.environ.get('INTERACT_OWNER_KEY') or subprocess.check_output(['security','find-generic-password','-s','supabase-interact-owner-key','-w'],text=True).strip()
def call(action,**data):
 req=urllib.request.Request(endpoint,json.dumps({'owner':owner,**data,'action':action}).encode(),{'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,context=ssl.create_default_context(cafile='/etc/ssl/cert.pem'),timeout=100) as r:return json.load(r)
 except urllib.error.HTTPError as e:return json.load(e)
def sql(query):
 r=subprocess.run(['supabase','db','query','--linked','--project-ref',ref,query],capture_output=True,text=True)
 if r.returncode: raise RuntimeError('Database verification command failed')
 return r.stdout
c=call('create',title='Summary verification · synthetic data');assert 'id' in c, 'Teacher credential unavailable'
try:
 q=call('save_question',classId=c['id'],mode='answer',prompt='Why should we verify AI answers?',rubric='AI may invent plausible but false claims; check a reliable source.',feedbackEnabled=True,position=0)
 q2=call('save_question',classId=c['id'],mode='answer',prompt='How would you use AI in your studies?',rubric='Open discussion',feedbackEnabled=False,position=1)
 ids=[]
 for i in range(3):
  member=call('join',code=c['code'],token=str(uuid.uuid4())+str(uuid.uuid4()),name=f'Synthetic {i}',studentId=f'SYN-{i}')
  ids.append(member['id'])
 statements=['AI can invent false facts, so I check a trusted source.','We should check because it can be wrong.','It is useful.']
 for question,scored in [(q,True),(q2,False)]:
  for i,mid in enumerate(ids):
   result={'transcript':statements[i], 'level':(['understood','partial','not_yet'][i] if scored else 'transcribed'),'score':([5,3,1][i] if scored else None),'feedback':('Explain the reason and an example.' if scored else ''),'issue':('Needs an example' if scored else '')}
   literal=json.dumps(result).replace("'","''")
   sql(f"insert into public.ts_responses(question_id,member_id,status,result) values ('{question['id']}','{mid}','done','{literal}'::jsonb)")
  result=call('summarize',id=question['id'],language='zh' if scored else 'en')
  assert result.get('status')=='done',result
  assert len(result['result']['response_ids'])==3
  cached=call('summarize',id=question['id'],language='zh' if scored else 'en')
  assert result['started_at']==cached['started_at'] and result['fingerprint']==cached['fingerprint'],'Cache miss'
  print('PASS', 'Scored Chinese summary' if scored else 'Unscored English summary',json.dumps(result['result']['overview'],ensure_ascii=False),flush=True)
  print('PASS repeated request uses cached result',flush=True)
 dashboard=call('dashboard',classId=c['id']);assert len(dashboard['summaries'])==2
 print('PASS teacher dashboard returns both summaries',flush=True)
 denied=call('summarize',owner='wrong',id=q['id']);assert 'error' in denied
 print('PASS summary rejects invalid teacher key',flush=True)
finally:
 sql(f"delete from public.ts_classes where id='{c['id']}'")
 print('PASS synthetic class and summaries cleaned up',flush=True)
