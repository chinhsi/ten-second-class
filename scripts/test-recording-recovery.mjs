import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { saveRecording,loadRecording,deleteRecording,pendingRecordings } from '../src/recordingStore.ts';
import { selectRecordingQuestion } from '../src/recordingSelection.ts';
import { recordingVersion,recordingFile } from '../supabase/functions/ten-second/recordingVersion.ts';
const scope='class-A/student-A', other='class-A/student-B';
const A={blob:new Blob(['old']),version:crypto.randomUUID(),responseId:'response-1'};
const B={blob:new Blob(['new']),version:crypto.randomUUID(),responseId:'response-1'};
await saveRecording(scope,'old-question',A);
// No sessionStorage at all: new tab still discovers a closed question from IDB.
const state={class:{status:'active'},questions:[{id:'old-question',status:'closed',max_seconds:120},{id:'new-question',status:'active',max_seconds:10}],responses:[{question_id:'old-question',status:'recording'}]};
assert.equal(selectRecordingQuestion(state,null,await pendingRecordings(scope),()=>null).id,'old-question');
assert.equal(selectRecordingQuestion({...state,class:{status:'ended'}},null,await pendingRecordings(scope),()=>null).id,'old-question');
assert.deepEqual(await pendingRecordings(other),[]);
assert.equal(await loadRecording(other,'old-question'),undefined);
assert.equal(selectRecordingQuestion(state,null,await pendingRecordings(other),()=>null).id,'new-question');
const intent={...A,nextVersion:B.version};await saveRecording(scope,'old-question',intent);
assert.equal((await loadRecording(scope,'old-question',A.version)).nextVersion,B.version);
// New tab writes B; a slow old tab finishes save/delete of A. B must survive.
await saveRecording(scope,'old-question',B);await saveRecording(scope,'old-question',intent);
assert.equal(await (await loadRecording(scope,'old-question',B.version)).blob.text(),'new');
await deleteRecording(scope,'old-question',A);
assert.equal(await (await loadRecording(scope,'old-question',B.version)).blob.text(),'new');
await deleteRecording(other,'old-question',B);
assert.equal(await (await loadRecording(scope,'old-question',B.version)).blob.text(),'new');
assert.equal(selectRecordingQuestion({...state,responses:[{question_id:'old-question',status:'done'}]},null,await pendingRecordings(scope),()=>null).id,'old-question'); // Pending content needs explicit hash reconciliation even after server receipt.
await deleteRecording(scope,'old-question',B);assert.deepEqual(await pendingRecordings(scope),[]);
assert.notEqual(recordingFile('r',A.version),recordingFile('r',B.version));
assert.equal(recordingFile('r',null),'r.wav');assert.equal(recordingVersion(null),null);
assert.throws(()=>recordingVersion(undefined));assert.throws(()=>recordingVersion('../path'));
console.log('PASS: new-tab/closed-question/ended-class recovery; student isolation; persisted discard intent; late old save/delete cannot overwrite B; pending content reconciled after receipt; versioned/legacy paths. No browser or AI.');

const {audioDigest}=await import('../src/audioDigest.ts');
const sameVersionA={...A,digest:await audioDigest(A.blob)};
const sameVersionB={...A,blob:B.blob,digest:await audioDigest(B.blob)};
assert.notEqual(sameVersionA.digest,sameVersionB.digest);
await saveRecording(scope,'same-version',sameVersionA);
await saveRecording(scope,'same-version',sameVersionB);
await deleteRecording(scope,'same-version',sameVersionA);
assert.equal(await (await loadRecording(scope,'same-version',A.version)).blob.text(),'new');
await deleteRecording(scope,'same-version',sameVersionB);
console.log('PASS: different content in same server version survives another tab deletion.');
