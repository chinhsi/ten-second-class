"""Live isolation smoke test. Temporary test records only; no audio, AI, or emails."""
import hashlib, json, secrets, subprocess, tempfile, urllib.request, urllib.error, uuid
import ssl, certifi
TLS = ssl.create_default_context(cafile=certifi.where())
ENDPOINT = 'https://fdfhyekuehybjkfyatjn.supabase.co/functions/v1/ten-second'
REF = 'fdfhyekuehybjkfyatjn'

def sql(query):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql') as f:
        f.write(query); f.flush()
        result = subprocess.run(['supabase','db','query','--linked','--project-ref',REF,'--file',f.name],capture_output=True,text=True)
        if result.returncode:
            raise RuntimeError('Database test setup/cleanup failed: '+result.stderr[:250])

def api(action, owner=None, **data):
    body = {'action':action, **data}
    if owner is not None: body['owner'] = owner
    req = urllib.request.Request(ENDPOINT,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30, context=TLS) as r: return r.status,json.load(r)
    except urllib.error.HTTPError as e: return e.code,json.load(e)

def ok(action, key, **data):
    status,result = api(action,key,**data)
    assert status == 200, f'{action} returned {status}'
    return result

ids = [str(uuid.uuid4()),str(uuid.uuid4())]
keys = [secrets.token_hex(32),secrets.token_hex(32)]
legacy = str(uuid.uuid4()); classes=[]; checks=0
try:
    sql('BEGIN;'+''.join(f"INSERT INTO public.ts_teachers(id,display_name,key_hash) VALUES ('{i}','TEST isolation {n}','{hashlib.sha256(k.encode()).hexdigest()}');" for n,(i,k) in enumerate(zip(ids,keys)))+f"INSERT INTO public.ts_classes(id,code,title) VALUES ('{legacy}','{secrets.token_hex(5).upper()}','TEST legacy isolation');COMMIT;")
    questions=[]
    for key in keys:
        cls=ok('create',key,title='TEST teacher isolation'); classes.append(cls)
        q=ok('save_question',key,classId=cls['id'],mode='answer',prompt='Test draft',feedbackEnabled=False); questions.append(q)
        assert len(ok('classes',key)) == 1; checks+=1
        assert ok('teacher_profile',key)['admin'] is False; checks+=1
        assert ok('dashboard',key,classId=cls['id'])['questions'][0]['id'] == q['id']; checks+=1
    response = str(uuid.uuid4()); member = str(uuid.uuid4())
    sql(f"INSERT INTO public.ts_members(id,class_id,name,student_id,token_hash) VALUES ('{member}','{classes[1]['id']}','TEST','TEST','{secrets.token_hex(32)}'); INSERT INTO public.ts_responses(id,question_id,member_id,status) VALUES ('{response}','{questions[1]['id']}','{member}','failed');")
    forbidden = [
      ('dashboard',dict(classId=classes[1]['id'])),('dashboard',dict(classId=legacy)),
      ('class_status',dict(classId=classes[1]['id'],status='ended')),
      ('delete_class',dict(classId=classes[1]['id'])),
      ('save_question',dict(classId=classes[1]['id'],mode='answer',prompt='forbidden')),
      ('save_question',dict(id=questions[1]['id'],classId=classes[0]['id'],mode='answer',prompt='forbidden')),
      ('open_question',dict(id=questions[1]['id'],classId=classes[0]['id'])),
      ('close_question',dict(id=questions[1]['id'])),('delete_question',dict(id=questions[1]['id'])),
      ('summarize',dict(id=questions[1]['id'])),('audio',dict(id=response)),('retry',dict(id=response)),
      ('teachers',{}),('create_teacher',dict(name='forbidden')),
      ('teacher_status',dict(id=ids[1],active=False)),('reset_teacher_key',dict(id=ids[1])),
    ]
    for action,data in forbidden:
        status,_=api(action,keys[0],**data); assert status==403, f'{action} isolation returned {status}'; checks+=1
    for action in ['classes','teacher_profile']:
        status,_=api(action,'invalid-test-code'); assert status==401; checks+=1
    # Student public state still works and never exposes teacher identifiers.
    code=classes[0]['code']; token=secrets.token_hex(32)
    ok('join',None,code=code,token=token,name='TEST student',studentId='TEST-1')
    state=ok('state',None,code=code,token=token)
    assert 'teacher_id' not in state['class']; checks+=1
    # Disabling credentials denies further requests even in an existing browser session.
    sql(f"UPDATE public.ts_teachers SET active=false WHERE id='{ids[0]}';")
    status,_=api('classes',keys[0]); assert status==401; checks+=1
    assert ok('classes',keys[1])[0]['id']==classes[1]['id']; checks+=1
    # Own deletion still works.
    ok('delete_class',keys[1],classId=classes[1]['id']); checks+=1
    print(f'{checks} live teacher checks passed; no AI calls or emails.')
finally:
    # Delete only UUIDs created by this run; student/response/question rows cascade.
    sql(f"DELETE FROM public.ts_classes WHERE teacher_id IN ('{ids[0]}','{ids[1]}') OR id='{legacy}'; DELETE FROM public.ts_teachers WHERE id IN ('{ids[0]}','{ids[1]}');")
    print('Temporary teacher accounts and classes removed.')
