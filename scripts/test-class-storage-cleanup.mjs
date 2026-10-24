import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=readFileSync(new URL('../supabase/functions/ten-second/index.ts',import.meta.url),'utf8');
const start=source.indexOf('if (action === "delete_class")');
const body=source.slice(start,source.indexOf('if (action === "classes")',start));
const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const run=new Function('db','check','str','reply','action','b',`return (async()=>{${js}})()`);
let files=Array.from({length:101},(_,i)=>String(i).padStart(3,'0'));
let shifted=false,deleted=false;
const bucket={async list(prefix,{offset,limit,sortBy}){
  assert.equal(sortBy.column,'name');
  if(offset===100&&!shifted){files.shift();shifted=true;}
  return {data:files.slice(offset,offset+limit).map(name=>({id:name,name}))};
},async remove(paths){files=files.filter(f=>!paths.some(p=>p.endsWith('/'+f)));return {data:[]}}};
const db={storage:{from:()=>bucket},rpc:async()=>({data:null}),from:()=>({delete:()=>({eq:async()=>{assert.equal(files.length,0);deleted=true;return {data:[]}}})})};
await run(db,r=>{if(r.error)throw r.error;return r.data},s=>s,x=>x,'delete_class',{classId:'11111111-1111-1111-1111-111111111111'});
assert.ok(shifted&&deleted);
console.log('PASS: concurrent deletion shifts 101-item page; re-scan removes skipped file before metadata deletion.');
