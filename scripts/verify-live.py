"""Live integration checks; reads owner from macOS Keychain, never prints it.
Creates an isolated test class, evaluates two synthetic clips and silence.
"""
import ssl
import json, urllib.request, urllib.error, subprocess, uuid, base64, wave, io, time
from pathlib import Path
URL='https://fdfhyekuehybjkfyatjn.supabase.co/functions/v1/ten-second'
owner=subprocess.check_output(['security','find-generic-password','-s','supabase-interact-owner-key','-w'],text=True).strip()
def call(action,**kw):
 req=urllib.request.Request(URL,json.dumps(dict(action=action,**kw)).encode(),{'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=90,context=ssl.create_default_context(cafile='/etc/ssl/cert.pem')) as r:return json.load(r)
 except urllib.error.HTTPError as e:return json.load(e)
def ok(cond,msg):
 assert cond,msg
 print('PASS',msg,flush=True)
c=call('create',owner=owner,title='驗證用課堂 · '+str(uuid.uuid4())[:6]);assert 'id'in c,c
Path('/private/tmp/ten-second-test-class.json').write_text(json.dumps(c))
q=call('save_question',owner=owner,classId=c['id'],mode='answer',prompt='Why should we check AI answers?',rubric='AI can generate plausible but incorrect information.',position=0)
q2=call('save_question',owner=owner,classId=c['id'],mode='pronunciation',prompt='Please check the facts before you trust the answer.',rubric='English; assess intelligibility and missing words, accept regional accents.',position=1)
a=str(uuid.uuid4())+str(uuid.uuid4());b=str(uuid.uuid4())+str(uuid.uuid4())
ok('error'in call('classes',owner='wrong'),'teacher login rejects wrong key')
call('join',code=c['code'],token=a,name='測試學生甲',studentId='TEST-A')
call('join',code=c['code'],token=b,name='測試學生乙',studentId='TEST-B')
ok('error'in call('start',code=c['code'],token=a,questionId=q['id']),'draft class blocks recording')
call('class_status',owner=owner,classId=c['id'],status='active')
call('open_question',owner=owner,classId=c['id'],id=q['id'])
st=call('state',code=c['code'],token=a)
ok(len(st['questions'])==1 and 'rubric'not in st['questions'][0],'student cannot see future question or answer rubric')
ok('error'in call('state',code=c['code'],token='unknown'*8),'unknown student token denied')
call('start',code=c['code'],token=a,questionId=q['id'])
def wav(text=None,seconds=1):
 if text:
  subprocess.run(['say','-v','Samantha','-r','170','-o','/private/tmp/ts-speech.aiff',text],check=True)
  subprocess.run(['ffmpeg','-loglevel','error','-y','-i','/private/tmp/ts-speech.aiff','-ar','16000','-ac','1','-t','10','-c:a','pcm_s16le','/private/tmp/ts-speech.wav'],check=True)
  with wave.open('/private/tmp/ts-speech.wav','rb') as f:frames=f.readframes(f.getnframes())
 else:frames=b'\0\0'*16000*seconds
 o=io.BytesIO()
 with wave.open(o,'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(16000);f.writeframes(frames)
 return base64.b64encode(o.getvalue()).decode()
ok('error'in call('submit',code=c['code'],token=a,questionId=q['id'],audio=wav(seconds=11)),'server rejects audio longer than ten seconds')
audio=wav('AI can generate plausible but incorrect information, so we should check reliable sources.')
ok(call('submit',code=c['code'],token=a,questionId=q['id'],audio=audio).get('ok'),'answer recording accepted')
ok(call('submit',code=c['code'],token=a,questionId=q['id'],audio=audio).get('ok'),'repeated submission is idempotent')
ok(len(call('state',code=c['code'],token=b)['responses'])==0,'student B cannot see student A response')
call('start',code=c['code'],token=b,questionId=q['id'])
call('submit',code=c['code'],token=b,questionId=q['id'],audio=wav())
call('open_question',owner=owner,classId=c['id'],id=q2['id'])
ok('error'in call('start',code=c['code'],token=b,questionId=q['id']),'closed question blocks new recording')
call('start',code=c['code'],token=a,questionId=q2['id'])
call('submit',code=c['code'],token=a,questionId=q2['id'],audio=wav('Please check the facts before you trust the answer.'))
for _ in range(24):
 d=call('dashboard',owner=owner,classId=c['id'])
 if all(r['status']in('done','failed')for r in d['responses']):break
 time.sleep(3)
for r in d['responses']:print('RESULT',r['status'],json.dumps(r['result'],ensure_ascii=False),flush=True)
ok(len(d['responses'])==3,'exactly three submitted responses')
ok(all(r['status']=='done'for r in d['responses']),'all three AI analyses completed')
silent=next(r for r in d['responses']if r['member_id']!=next(x['id']for x in d['members']if x['student_id']=='TEST-A'))
ok(silent['result']['level']=='unscorable' and silent['result']['score']is None,'silence is unscorable, never a wrong answer')
call('class_status',owner=owner,classId=c['id'],status='ended')
print('CLASS',c['id'],flush=True)
