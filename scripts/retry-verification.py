import json,urllib.request,ssl,subprocess,time
from pathlib import Path
owner=subprocess.check_output(['security','find-generic-password','-s','supabase-interact-owner-key','-w'],text=True).strip()
c=json.loads(Path('/private/tmp/ten-second-test-class.json').read_text())
def call(a,**kw):
 r=urllib.request.Request('https://fdfhyekuehybjkfyatjn.supabase.co/functions/v1/ten-second',json.dumps(dict(action=a,owner=owner,**kw)).encode(),{'Content-Type':'application/json'})
 with urllib.request.urlopen(r,context=ssl.create_default_context(cafile='/etc/ssl/cert.pem'),timeout=90)as s:return json.load(s)
d=call('dashboard',classId=c['id'])
for r in d['responses']:
 if r['status']=='failed':print('Retry',r['id'],call('retry',id=r['id']),flush=True)
for _ in range(24):
 d=call('dashboard',classId=c['id'])
 if all(r['status']in('done','failed')for r in d['responses']):break
 time.sleep(3)
for r in d['responses']:print(r['status'],r.get('debug_error'),json.dumps(r['result'],ensure_ascii=False),flush=True)
assert all(r['status']=='done'for r in d['responses'])
silent=next(r for r in d['responses'] if r['member_id']==next(m['id'] for m in d['members'] if m['student_id']=='TEST-B'))
assert silent['result']['level']=='unscorable' and silent['result']['score'] is None
call('class_status',classId=c['id'],status='ended')
Path('/private/tmp/ten-second-verification.json').write_text(json.dumps(d,ensure_ascii=False))
