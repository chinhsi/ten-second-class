import { assessmentRequest } from '../supabase/functions/ten-second/assessmentRequest.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assessmentWithFallback } from '../supabase/functions/ten-second/assessmentProviders.ts';
const policyRequest=assessmentRequest({mode:'answer',prompt:'Learning',feedback_enabled:false},new Uint8Array([0,1]));
assert.match(policyRequest.systemInstruction.parts[0].text,/code-switch/);
assert.match(policyRequest.systemInstruction.parts[0].text,/Do not translate/);
assert.match(policyRequest.systemInstruction.parts[0].text,/\[聽不清\]/);
const result={transcript:'Test pineapple',score:null,level:'transcribed',feedback:'',issue:''};
const schema={type:'object',properties:{transcript:{type:'string'},score:{type:['integer','null']},level:{type:'string',enum:['transcribed']},feedback:{type:'string'},issue:{type:'string'}},required:Object.keys(result)};
let body={systemInstruction:{parts:[{text:'Transcribe the complete recording verbatim. Return JSON with level transcribed, score null, empty feedback and issue.'}]},contents:[{parts:[{text:'Include the ending of the recording.'},{inlineData:{mimeType:'audio/wav',data:'AA=='}}]}],generationConfig:{responseFormat:{text:{schema}}}};
const ok=()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]});
const backup=()=>Response.json({id:'test',choices:[{message:{content:JSON.stringify(result)}}]});
const base={googleKey:'private-primary',googleModel:'test',openrouterKey:'private-backup',body};
let calls=0;
await assessmentWithFallback({...base,fetcher:async()=>{calls++;return ok();}});assert.equal(calls,1);
for(const failure of [429,503,401,'invalid','network','timeout','bodytimeout']){
 calls=0;
 const out=await assessmentWithFallback({...base,timeoutMs:15,fetcher:async(url,init)=>{
  calls++;
  if(calls===1){
   if(failure==='timeout')return new Promise(()=>{});
   if(failure==='bodytimeout')return new Response(new ReadableStream({start(){}}));
   if(failure==='network')throw Error('private-primary private-backup');
   if(failure==='invalid')return Response.json({});
   return new Response('',{status:failure});
  }
  const request=JSON.parse(init.body);assert.equal(request.messages[1].content[1].type,'input_audio');assert.equal(request.model,'google/gemini-3.8-flash');
  return backup();
 }});
 assert.equal(calls,2);assert.equal(out.result.transcript,result.transcript);assert.equal(out.attempts[1].channel,'openrouter');
}
calls=0;
await assert.rejects(assessmentWithFallback({...base,fetcher:async()=>{calls++;throw Error('private-primary private-backup');}}),e=>!e.message.includes('private-'));assert.equal(calls,2);
console.log('Fallback checks passed: direct success, HTTP failures, network, malformed JSON, header/body timeouts, bounded attempts, redaction.');
if(process.argv.includes('--live') || process.argv.includes('--live-mixed')){
 const mixed=process.argv.includes('--live-mixed');
 const report=mixed?'reviews/openrouter-mixed-2026-10-24.json':'reviews/openrouter-fallback-2026-10-23.json';
 if(fs.existsSync(report))throw Error('Refusing automatic repeat of paid test');
 const env=fs.readFileSync('/Users/chinhsi/.config/autoresearch/secrets/openrouter-claude.env','utf8');
 const match=env.match(/^(?:export\s+)?OPENROUTER_CLAUDE_API_KEY\s*=\s*["']?([^\s"']+)/m);assert.ok(match,'New key missing');
 if(mixed) body=assessmentRequest({mode:'answer',prompt:'Share your thoughts about learning.',feedback_enabled:false,response_language:'auto'},fs.readFileSync('/private/tmp/ten-second-classroom-trial/01.wav'));
 else body.contents[0].parts[1].inlineData.data=fs.readFileSync('/private/tmp/ten-second-two-minute-trial/01.wav').toString('base64');
 fs.writeFileSync(report,JSON.stringify({status:'started',scope:'Local production routing module; simulated Google 503; one real OpenRouter call; synthetic 120-second audio'}));
 const out=await assessmentWithFallback({...base,body,openrouterKey:match[1],fetcher:async(url,init)=>url.includes('generativelanguage')?new Response('',{status:503}):fetch(url,init)});
 const record={status:'done',scope:'Local production routing module; simulated Google 503; one real OpenRouter call; synthetic 120-second audio',attempts:out.attempts,words:out.result.transcript.split(/\s+/).length,ending_present:/pineapple/i.test(out.result.transcript),transcript:out.result.transcript};
 fs.writeFileSync(report,JSON.stringify(record,null,2));console.log(JSON.stringify({...record,transcript:undefined}));assert.ok(record.ending_present);
}
