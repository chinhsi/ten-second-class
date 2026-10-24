// Run the real Recorder component with React's test renderer, no browser/audio/AI.
import React, {useState,useEffect,useRef} from 'react';
import {create,act} from 'react-test-renderer';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {audioDigest} from '../src/audioDigest.ts';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.sessionStorage={removeItem(){}};
let rec, wavSize=1, failures=0, deleted=0, received=0, restored;
class MediaRecorder {
  static isTypeSupported(){return true}
  constructor(){rec=this;this.state='inactive';this.mimeType='audio/webm'}
  start(){this.state='recording'}
  stop(){this.state='inactive';return this.onstop?.()}
}
globalThis.MediaRecorder=MediaRecorder;
globalThis.window={MediaRecorder};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}}});
const source=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function Recorder('),source.indexOf('createRoot(document'));
const compiled=ts.transpileModule(body,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const dependencies={React,useState,useEffect,useRef,tx:(lang,en,zh)=>zh,savedRecording:()=>null,pendingKey:id=>id,
  loadRecording:async()=>restored,saveRecording:async()=>{},deleteRecording:async()=>{deleted++},audioDigest,
  recordingToWav:async()=>new Blob([new Uint8Array(wavSize)])};
const Recorder=new Function(...Object.keys(dependencies),compiled+';return Recorder;')(...Object.values(dependencies));
const q={id:'q',mode:'answer',max_seconds:10,prompt:'test'};
const ticket={id:'r',recording_version:crypto.randomUUID(),started_at:new Date().toISOString()};
const props={q,scope:'student',lang:'zh',call:async()=>ticket,onRecording(){},onCaptureFailed(){failures++},onSubmitted:async()=>{received++},onDiscard:async()=>{}};
let view;
await act(async()=>{view=create(React.createElement(Recorder,props))});
await act(async()=>{await view.root.findAllByType('button')[0].props.onClick()});
await act(async()=>{await rec.stop()});
assert.equal(failures,1,'Too-short capture must release pinned question');
await act(async()=>{await view.root.findAllByType('button')[0].props.onClick()});
await act(async()=>{rec.onerror();await rec.stop()});
assert.equal(failures,2,'Microphone failure must release question and ignore later stop event');
assert.equal(received,0);
await act(async()=>view.unmount());
restored={blob:new Blob(['second take']),version:ticket.recording_version,responseId:'r'};
restored.digest=await audioDigest(restored.blob);
let sentDigest;
await act(async()=>{view=create(React.createElement(Recorder,{...props,q:{...q,max_seconds:120},response:{status:'done'},call:async(action,b)=>{
  assert.equal(action,'upload_ticket');sentDigest=b.digest;throw Error('Different recording was already received');
}}))});
const retry=()=>view.root.findAllByType('button').find(b=>b.children.join('').includes('重新上傳'));
assert.ok(retry(),'Pending local content remains reachable despite server done');
await act(async()=>{await retry().props.onClick()});
assert.equal(sentDigest,restored.digest);assert.equal(deleted,0);assert.equal(received,0);assert.ok(retry());
await act(async()=>view.unmount());
await act(async()=>{view=create(React.createElement(Recorder,{...props,q:{...q,max_seconds:120},call:async()=>({received:true}),onSubmitted:async()=>{throw Error('offline refresh')}}))});
await act(async()=>{await retry().props.onClick()});
assert.equal(deleted,1,'Accepted recording is removed once');
assert.equal(retry(),undefined,'Failed refresh must not expose a retry with no recording');
assert.ok(JSON.stringify(view.toJSON()).includes('已收到你的錄音'));
await act(async()=>view.unmount());
console.log('PASS: capture failure release; conflicting content preserved; accepted recording stays received after refresh failure. No browser.');
