"""30 concurrent silent WAV submissions; no Gemini calls. Deletes its test class."""
import json,urllib.request,urllib.error,ssl,subprocess,uuid,time,io,wave,base64,concurrent.futures,statistics
from pathlib import Path
from datetime import datetime
owner=subprocess.check_output(['security','find-generic-password','-s','supabase-interact-owner-key','-w'],text=True).strip()
ctx=ssl.create_default_context(cafile='/etc/ssl/cert.pem')
def call(a,**kw):
 req=urllib.request.Request('https://fdfhyekuehybjkfyatjn.supabase.co/functions/v1/ten-second',json.dumps(dict(action=a,**kw)).encode(),{'Content-Type':'application/json'})
 with urllib.request.urlopen(req,context=ctx,timeout=120)as s:return json.load(s)
c=call('create',owner=owner,title='30人併發驗證');q=call('save_question',owner=owner,classId=c['id'],mode='answer',prompt='靜音壓力測試',rubric='無聲不得評分',position=0)
try:
 tokens=[str(uuid.uuid4())+str(uuid.uuid4())for _ in range(30)]
 def join(pair):
  i,t=pair;return call('join',code=c['code'],token=t,name='Load test '+str(i),studentId='LOAD-'+str(i))
 with concurrent.futures.ThreadPoolExecutor(max_workers=10)as pool:list(pool.map(join,enumerate(tokens)))
 call('class_status',owner=owner,classId=c['id'],status='active');call('open_question',owner=owner,classId=c['id'],id=q['id'])
 with concurrent.futures.ThreadPoolExecutor(max_workers=30)as pool:list(pool.map(lambda t:call('start',code=c['code'],token=t,questionId=q['id']),tokens))
 o=io.BytesIO()
 with wave.open(o,'wb')as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*160000)
 audio=base64.b64encode(o.getvalue()).decode();began=time.monotonic()
 def submit(t):
  at=time.monotonic();r=call('submit',code=c['code'],token=t,questionId=q['id'],audio=audio);assert r.get('ok');return time.monotonic()-at
 with concurrent.futures.ThreadPoolExecutor(max_workers=30)as pool:latencies=list(pool.map(submit,tokens))
 for _ in range(30):
  d=call('dashboard',owner=owner,classId=c['id'])
  if len(d['responses'])==30 and all(r['status']=='done'for r in d['responses']):break
  time.sleep(2)
 assert len(d['responses'])==30 and all(r['status']=='done'and r['result']['level']=='unscorable'and r['result']['score']is None for r in d['responses'])
 result={'date':datetime.now().astimezone().isoformat(),'participants':30,'concurrency':30,'wav_seconds':10,'received':len(d['responses']),'completed':30,'ai_calls':0,'receipt_median_seconds':round(statistics.median(latencies),2),'receipt_p95_seconds':round(sorted(latencies)[28],2),'all_completed_seconds':round(time.monotonic()-began,2),'scope':'Concurrent HTTP, storage, status processing; silence gate, not Gemini capacity.'}
 print(json.dumps(result,indent=2),flush=True);Path('reviews/concurrency-latest.json').write_text(json.dumps(result,indent=2)+'\n')
finally:
 print('Cleanup',call('delete_class',owner=owner,classId=c['id']),flush=True)
