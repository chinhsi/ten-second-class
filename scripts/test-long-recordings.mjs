import assert from 'node:assert/strict';
import { validateWav, wavByteLimit, recordingSeconds } from '../supabase/functions/ten-second/recordingLimits.ts';
import { geminiWithRetry } from '../supabase/functions/ten-second/geminiRetry.ts';
function wav(seconds) {
 const bytes=new Uint8Array(44+seconds*32000);const v=new DataView(bytes.buffer);
 const ascii=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
 ascii(0,'RIFF');v.setUint32(4,bytes.length-8,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,bytes.length-44,true);return bytes;
}
assert.equal(recordingSeconds({}),10);assert.equal(recordingSeconds({max_seconds:120}),120);
assert.equal(wavByteLimit(120),3840044);
validateWav(wav(120),120);validateWav(wav(10),10);
assert.throws(()=>validateWav(wav(121),120));assert.throws(()=>validateWav(wav(120),10));
const corrupt=wav(120);new DataView(corrupt.buffer).setUint32(40,320000,true);assert.throws(()=>validateWav(corrupt,120));
let calls=0,clock=0;
const options={attemptTimeoutMs:45000,budgetMs:100000,attempts:2,now:()=>clock,random:()=>0,sleep:async ms=>{clock+=ms;}};
await assert.rejects(geminiWithRetry(['primary','fallback'],async()=>{calls++;clock+=45000;throw Error('timeout');},options));
assert.equal(calls,2);assert(clock<100000);
calls=0;clock=0;
await geminiWithRetry(['primary'],async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'120'}})},options);
assert.equal(calls,1);
console.log('PASS: full 120-second PCM, 121-second rejection, unchanged ten-second limit, corrupt WAV rejection, two-attempt long timeout budget, quota backoff. No AI calls.');
