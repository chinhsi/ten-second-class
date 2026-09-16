import json, urllib.request, urllib.error, ssl, subprocess, uuid, time, io, wave, base64
from pathlib import Path
owner=subprocess.check_output(['security','find-generic-password','-s','supabase-interact-owner-key','-w'],text=True).strip()
def call(a,**kw):
 req=urllib.request.Request('https://fdfhyekuehybjkfyatjn.supabase.co/functions/v1/ten-second',json.dumps(dict(action=a,**kw)).encode(),{'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,context=ssl.create_default_context(cafile='/etc/ssl/cert.pem'),timeout=90)as s:return json.load(s)
 except urllib.error.HTTPError as e:return json.load(e)
def ok(c,m):assert c,m;print('PASS',m,flush=True)
c=call('create',owner=owner,title='復原與刪除驗證');q=call('save_question',owner=owner,classId=c['id'],mode='answer',prompt='測試',rubric='測試',position=0)
token=str(uuid.uuid4())+str(uuid.uuid4());call('join',code=c['code'],token=token,name='TEST',studentId='TEST');call('class_status',owner=owner,classId=c['id'],status='active');call('open_question',owner=owner,classId=c['id'],id=q['id']);r=call('start',code=c['code'],token=token,questionId=q['id'])
sql=f"update public.ts_responses set started_at=now()-interval '3 minutes' where id='{r['id']}'; insert into public.ts_members(class_id,name,student_id,token_hash) select '{c['id']}', 'synthetic', 'CAP-'||i, md5(random()::text||i) from generate_series(1,149)i;"
subprocess.run(['supabase','db','query','--linked','--project-ref','fdfhyekuehybjkfyatjn',sql],check=True,stdout=subprocess.DEVNULL)
r2=call('start',code=c['code'],token=token,questionId=q['id']);ok(r2.get('started_at')!=r['started_at'] and r2.get('id')==r['id'],'expired unsubmitted ticket renews in active question')
ok('error'in call('join',code=c['code'],token=str(uuid.uuid4())+str(uuid.uuid4()),name='overflow',studentId='overflow'),'151st participant rejected')
call('close_question',owner=owner,id=q['id'])
o=io.BytesIO()
with wave.open(o,'wb')as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*16000)
ok(call('submit',code=c['code'],token=token,questionId=q['id'],audio=base64.b64encode(o.getvalue()).decode()).get('ok'),'recording started before closure is accepted afterward')
for _ in range(10):
 d=call('dashboard',owner=owner,classId=c['id']);result=d['responses'][0]
 if result['status']=='done':break
 time.sleep(1)
ok(result['result']['level']=='unscorable' and result['result']['score']is None,'silence bypasses AI and produces no fabricated transcript')
ok(call('delete_class',owner=owner,classId=c['id']).get('ok'),'teacher can delete class and recordings')
ok('error'in call('peek',code=c['code']),'deleted class cannot be joined')
Path('/private/tmp/ten-second-deleted-id.txt').write_text(c['id'])
