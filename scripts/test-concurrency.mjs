import assert from 'node:assert/strict';
import { geminiWithRetry } from '../supabase/functions/ten-second/geminiRetry.ts';
import { retryConcurrent } from '../src/concurrency.ts';
const models = ['primary', 'fallback'];
const delays = [];
const options = { sleep: async ms => { delays.push(ms); }, random: () => 0 };
let calls = [];
let r = await geminiWithRetry(models, async model => {
  calls.push(model);
  if (calls.length === 1) throw new DOMException('timed out', 'TimeoutError');
  return new Response('ok');
}, options);
assert.equal(r.status, 200); assert.deepEqual(calls, models);
assert.deepEqual(delays, [1000]);
calls = []; delays.length = 0;
r = await geminiWithRetry(models, async model => {
  calls.push(model);
  return calls.length < 3 ? new Response('{}', { status: 503 }) : new Response('ok');
}, options);
assert.equal(r.status, 200); assert.deepEqual(calls, ['primary','fallback','primary']);
assert.deepEqual(delays, [1000,2000]);
let count = 0;
await geminiWithRetry(models, async () => { count++; return new Response('{}',{status:400}); }, options);
assert.equal(count,1);
count = 0;
r = await geminiWithRetry(models, async () => { count++; return new Response('{}',{status:429,headers:{'retry-after':'120'}}); }, options);
assert.equal(count,1); assert.equal(r.status,429);
count = 0; delays.length = 0;
await geminiWithRetry(models, async () => {
  count++;
  return count === 1 ? Response.json({error:{details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'5s'}]}},{status:429}) : new Response('ok');
}, options);
assert.deepEqual(delays,[5000]);
count = 0;
await assert.rejects(geminiWithRetry(models, async () => { count++; throw Error('offline'); }, options), /offline/);
assert.equal(count,3);
let active=0, peak=0; const seen=[];
const failed = await retryConcurrent(Array.from({length:30},(_,i)=>i), async i => {
  active++; peak=Math.max(peak,active); seen.push(i);
  await new Promise(resolve => setTimeout(resolve,2));
  active--;
  if(i===1 || i===8) throw Error('one student failure');
});
assert.equal(peak,4); assert.equal(failed,2); assert.equal(new Set(seen).size,30);
// Independent students overlap while another waits for backoff.
let release; const blocked = new Promise(resolve=>{release=resolve;}); let attempts=0;
const first=geminiWithRetry(models, async()=> ++attempts===1 ? new Response('{}',{status:503}) : new Response('ok'), {sleep:()=>blocked});
const second=await geminiWithRetry(models,async()=>new Response('ok'));
assert.equal(second.status,200); release(); await first;
console.log('Passed: timeout fallback, 503 backoff, permanent errors, quota retry delays, retry bounds, 30-item/4-worker batch, failure isolation, independent student requests. No live AI calls.');
