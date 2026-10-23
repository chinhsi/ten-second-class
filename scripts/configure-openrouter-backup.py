#!/usr/bin/env python3
"""Install the explicitly authorized new OpenRouter credential; never print it."""
import hashlib, importlib.util, json, re
from pathlib import Path
spec=importlib.util.spec_from_file_location('trial',Path(__file__).with_name('two-minute-trial.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source=Path.home()/'.config/autoresearch/secrets/openrouter-claude.env'
match=re.search(r'''^(?:export\s+)?OPENROUTER_CLAUDE_API_KEY\s*=\s*["']?([^\s"']+)''',source.read_text(),re.M)
if not match:raise RuntimeError('New OpenRouter key unavailable')
key=match[1];m.SECRETS.append(key)
token=m.credential();headers={'Authorization':'Bearer '+token}
url=f'https://api.supabase.com/v1/projects/{m.REF}/secrets'
values={'TEN_SECOND_OPENROUTER_API_KEY':key,'TEN_SECOND_OPENROUTER_MODEL':'google/gemini-3.8-flash'}
m.request(url,[{'name':k,'value':v} for k,v in values.items()],headers,method='POST')
installed=m.request(url,headers=headers)
for name,value in values.items():
 row=next(x for x in installed if x['name']==name)
 assert row['value']==hashlib.sha256(value.encode()).hexdigest(),f'{name} digest mismatch'
print('OpenRouter backup secrets installed and digests verified; no key printed.')
