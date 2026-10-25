import {afterEach,describe,expect,it} from 'vitest';
import {createApp,defineComponent,h,nextTick,ref,type App} from 'vue';
import Editor from './ActionPolicyEditor.vue';
import type {ActionPolicy} from '@/api/pipelines';
let app:App,host:HTMLDivElement;
function mount(version:number|undefined=1,disabled=false){
 const model=ref<ActionPolicy>({schemaVersion:'iqc-action-policy-v1',actions:[{actionId:'mine',type:'ADD_TO_EVALUATION_CANDIDATE',adapterVersion:version,condition:{kind:'RISK_AT_LEAST',code:null,value:'HIGH',children:[]},idempotency:'PRODUCTION_SOURCE_V1',retry:null,failureHandling:'RECORD_ONLY',configuration:version===2?{findingCodes:['RISK'],threshold:'0.500000000000000001',name:'keep',tags:['tag']}:{sampleType:'FALSE_POSITIVE',reviewRevision:3,name:'keep',tags:['tag']}}]});
 host=document.createElement('div');document.body.append(host);
 app=createApp(defineComponent({setup:()=>()=>h(Editor,{modelValue:model.value,findingCodes:['RISK'],itemCodes:[],disabled,'onUpdate:modelValue':value=>model.value=value})}));
 const pass=defineComponent({setup(_, {slots}){return()=>h('div',slots.default?.());}});
 for(const name of ['ASpace','ACard','AForm','AFormItem','AAlert','AInputNumber'])app.component(name,pass);
 app.component('AButton',defineComponent({setup:()=>()=>h('span')}));
 app.component('AInput',defineComponent({props:['value','disabled'],emits:['update:value'],setup(props,{emit}){return()=>h('input',{value:props.value,disabled:props.disabled,onInput:(event:Event)=>emit('update:value',(event.target as HTMLInputElement).value)});}}));
 app.component('ASelect',defineComponent({props:['options','disabled'],emits:['change'],setup(props,{emit}){return()=>h('div',(props.options??[]).map((option:{value:unknown;label:string})=>h('button',{disabled:props.disabled,onClick:()=>emit('change',option.value)},option.label)));}}));
 app.mount(host);return model;
}
async function click(label:string){[...host.querySelectorAll('button')].find(button=>button.textContent===label)!.click();await nextTick();}
afterEach(()=>{app?.unmount();host?.remove();});
describe('candidate action mode interactions',()=>{
 it('switches both ways while preserving metadata and condition',async()=>{
  const model=mount();const original=JSON.parse(JSON.stringify(model.value.actions[0].condition));
  await click('自动挖掘待标注候选（v2）');expect(model.value.actions[0].adapterVersion).toBe(2);
  expect(model.value.actions[0].configuration).toEqual({findingCodes:[],threshold:'0.8',name:'keep',tags:['tag']});
  expect(model.value.actions[0].condition).toEqual(original);
  await click('业务复核完成后沉淀（v1）');expect(model.value.actions[0].configuration).toEqual({sampleType:'POSITIVE',reviewRevision:1,name:'keep',tags:['tag']});
  expect(model.value.actions[0].condition).toEqual(original);
 });
 it('keeps omitted v1 unchanged when selecting its current mode',async()=>{const model=mount();delete model.value.actions[0].adapterVersion;await nextTick();await click('业务复核完成后沉淀（v1）');expect(model.value.actions[0].configuration.reviewRevision).toBe(3);expect(model.value.actions[0].adapterVersion).toBeUndefined();});
 it('preserves exact threshold text entered in the actual input',async()=>{const model=mount(2);const input=[...host.querySelectorAll('input')].find(input=>input.value==='0.500000000000000001')!;input.value='0.999999999999999999';input.dispatchEvent(new Event('input'));await nextTick();expect(model.value.actions[0].configuration.threshold).toBe('0.999999999999999999');});
 it('does not mutate disabled configuration',async()=>{const model=mount(1,true);await click('自动挖掘待标注候选（v2）');expect(model.value.actions[0].adapterVersion).toBe(1);});
 it('keeps unknown versions read-only',()=>{mount(7);expect(host.textContent).toContain('原配置保持只读');expect(host.textContent).not.toContain('自动挖掘待标注候选（v2）');});
});
