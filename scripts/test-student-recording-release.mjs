// Exercise the real Student callbacks and question selector; stub only child/audio/network.
import React, {useState,useEffect,useRef} from 'react';
import {create,act} from 'react-test-renderer';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {selectRecordingQuestion} from '../src/recordingSelection.ts';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.localStorage={getItem:k=>k.startsWith('ts-joined-')?'yes':'token',setItem(){},removeItem(){}};
const source=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('function Student('),source.indexOf('function Recorder('));
const compiled=ts.transpileModule(body,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
let poll, offline=false, state, pending=[];
function Recorder(){return null}
const deps={React,useState,useEffect,useRef,Recorder,selectRecordingQuestion,
 tx:(lang,en,zh)=>zh,statusLabel:x=>x,savedRecording:()=>null,pendingRecordings:async()=>pending,
 api:async(action)=>{if(action==='peek')return {title:'test'};if(offline)throw Error('offline');return state},
 startVisiblePolling:refresh=>{poll=refresh;return ()=>{}},studentPollDelay:()=>3000};
const Student=new Function(...Object.keys(deps),compiled+';return Student;')(...Object.values(deps));
const old={id:'old',prompt:'old',status:'active',max_seconds:120};
const next={id:'next',prompt:'next',status:'active',max_seconds:120};
for(const callback of ['onSubmitted','onDiscard']) {
 for(const fail of [true,false]) {
  for(const pollBeforeCompletion of [true,false]) {
  offline=false;pending=[];state={class:{title:'test',status:'active'},member:{name:'student'},questions:[old],responses:[]};
  let view;await act(async()=>{view=create(React.createElement(Student,{code:'class',lang:'zh'}))});
  await act(async()=>{await poll()});
  const recorder=()=>view.root.findByType(Recorder);
  await act(async()=>{recorder().props.onRecording()});
  state={...state,questions:[{...old,status:'closed'},next]};
  if(pollBeforeCompletion) await act(async()=>{await poll()});
  assert.equal(recorder().props.q.id,'old','Active capture stays pinned even after teacher changes question');
  offline=fail;
  await act(async()=>{
   if(callback==='onSubmitted' && fail) await assert.rejects(recorder().props[callback](),/offline/);
   else await recorder().props[callback]();
  });
  if(pollBeforeCompletion || !fail) assert.equal(recorder().props.q.id,'next',`${callback}: completed action releases old question even if refresh fails`);
  offline=false;await act(async()=>{await poll()});
  assert.equal(recorder().props.q.id,'next','Later successful polling must not return to pinned old question');
  await act(async()=>view.unmount());
  }
 }
}
console.log('PASS: real Student submit/discard callbacks release pinned question on refresh success and failure; polling recovers.');
