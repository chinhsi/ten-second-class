import assert from 'node:assert/strict';
import { validateWav, wavByteLimit, recordingSeconds } from '../supabase/functions/ten-second/recordingLimits.ts';

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
assert.equal(recordingSeconds({max_seconds:20}),20);
validateWav(wav(20),20);assert.throws(()=>validateWav(wav(21),20));assert.throws(()=>validateWav(wav(20),10));
console.log('PASS: 10/20/120-second PCM limits, rejection of overlong and corrupt WAV. Retry routing covered by test-assessment-fallback.mjs.');
