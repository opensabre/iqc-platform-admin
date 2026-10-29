import { afterEach, expect, it } from 'vitest';
import { createApp, h, nextTick, reactive, ref, type App, type Component } from 'vue';
import Editor from './PipelineReleaseEditor.vue';
import type { PipelineRelease, CalibrationReference } from '@/api/pipelines';

// Exercise the production setup/watch and exposed save function without rendering unrelated asset selectors.
const HeadlessEditor={...Editor,render:()=>null} as Component;
let app:App,host:HTMLDivElement;
const reference:CalibrationReference={taskId:'task',executionId:'execution',nodeId:'model',contentHash:'a'.repeat(64)};
function initial():PipelineRelease {
 return {schemaVersion:'iqc-pipeline-release-v1',pipeline:{schemaVersion:'iqc-pipeline-v1',nodes:[{nodeId:'model',type:'LLM',name:'Model',version:'1',dependsOn:[],inputMapping:{},config:{ruleReference:{id:'rule',versionNo:1},findingReference:{id:'finding',versionNo:1},agentReference:{id:'agent',versionNo:1}},condition:null,timeoutMs:1000,retries:0,onError:'FAIL_PIPELINE',fallbackNodeId:null,outputSchema:null,enabled:true}]},fusion:{id:'fusion',version:1,method:'CONFIDENCE',nodePriority:{},overrideNodeByCode:{},confidenceCalibrationId:'calibration',calibratedNodeIds:['model'],calibrationReferences:[{...reference}]},scoring:{version:'iqc-score-v2',mode:'DEDUCTION',baseScore:100,passingScore:60,items:[]},items:[]};
}
function mount(value:PipelineRelease) {
 const props=reactive({initial:value});const editor=ref<{release:()=>PipelineRelease}>();
 host=document.createElement('div');document.body.append(host);
 app=createApp({render:()=>h(HeadlessEditor,{initial:props.initial,ref:editor})});app.mount(host);
 return {props,save:()=>editor.value!.release()};
}
afterEach(()=>{app?.unmount();host?.remove();});
it('saves only the exact reference without mutating the input release',()=>{
 const source=initial(),before=JSON.stringify(source);const {save}=mount(source);
 expect(save().fusion.calibrationReferences).toEqual([reference]);expect(JSON.stringify(source)).toBe(before);
});
it.each([
 ['extra coefficient',{...reference,coefficient:0.9},'仅允许'],
 ['uppercase hash',{...reference,contentHash:'A'.repeat(64)},'摘要无效'],
 ['missing node',{...reference,nodeId:'absent'},'现有模型节点'],
 ['malformed identity',{...reference,executionId:'bad/id'},'身份'],
])('rejects %s at the save boundary',(_,value,message)=>{
 const source=initial();source.fusion.calibrationReferences=[value];const {save}=mount(source);expect(save).toThrow(message);
});
it('rejects duplicate nodes, coverage gaps and non-model targets',async()=>{
 const {props,save}=mount(initial());
 const duplicate=initial();duplicate.fusion.calibrationReferences=[reference,reference];props.initial=duplicate;await nextTick();expect(save).toThrow('不同的现有模型节点');
 const missing=initial();missing.fusion.calibratedNodeIds.push('other');props.initial=missing;await nextTick();expect(save).toThrow('覆盖全部');
 const rule=initial();rule.pipeline.nodes[0]!.type='RULE';props.initial=rule;await nextTick();expect(save).toThrow('现有模型节点');
});
it('reloads references for a different object and preserves legacy omission after clearing',async()=>{
 const {props,save}=mount(initial());
 const next=initial();next.fusion.calibrationReferences=[{...reference,taskId:'new-task'}];props.initial=next;await nextTick();expect(save().fusion.calibrationReferences?.[0]?.taskId).toBe('new-task');
 const legacy=initial();delete legacy.fusion.calibrationReferences;legacy.fusion.method='PRIORITY';legacy.fusion.calibratedNodeIds=[];legacy.fusion.confidenceCalibrationId=null;
 props.initial=legacy;await nextTick();expect(save().fusion).not.toHaveProperty('calibrationReferences');
});
