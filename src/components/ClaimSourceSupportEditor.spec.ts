import {afterEach, expect, it, vi} from 'vitest';
import {createApp, defineComponent, h, nextTick, reactive, type App} from 'vue';
import type {HumanFindingContext, HumanFindingDecision} from '@/api/quality';
const api=vi.hoisted(()=>({context:vi.fn()}));
vi.mock('@/api/quality',()=>({getHumanFindingContext:api.context}));
import Editor from './HumanFindingReviewEditor.vue';

let app:App, host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();});
async function settle(){await Promise.resolve();await nextTick();await Promise.resolve();await nextTick();}
function context(id='result'):HumanFindingContext {
 return {sourceResultId:id,sourceHash:'source',available:true,findings:[{code:'AMOUNT',valueType:'OBJECT',state:'KNOWN',
  valueJson:'{"amount":99.999999999999999999}',severity:'LOW',expectedFindingHash:'frozen-hash',allowedValues:[],
  allowedEvidenceTypes:['CONVERSATION'],evidenceRequired:false,evidence:[],retainedEvidenceIds:[],addedMessageIds:[],
  modelClaims:[{rawFindingId:'claim',valueType:'OBJECT',valueJson:'{"amount":99.999999999999999999}',reason:'original model reason',
   nodeId:'model',engineVersion:'v1',runIndex:1,inputHash:'input',evidence:[{id:'e1',type:'CONVERSATION',reference:'m1'}]}]}],
  messages:[{id:'m1',sequenceNo:1,speakerRole:'agent',content:'frozen source'}]};
}
function mount(props:{resultId:string;disabled:boolean;refreshToken?:string},save:(decision:HumanFindingDecision)=>void) {
 host=document.createElement('div');document.body.append(host);
 app=createApp(defineComponent({setup:()=>()=>h(Editor,{...props,onSave:save})}));
 for(const name of ['ACard','AForm','AFormItem','ACollapse','ACollapsePanel','ADivider'])
  app.component(name,defineComponent({props:['label'],setup:(p,{slots})=>()=>h('section',{'data-label':p.label},slots.default?.())}));
 app.component('AButton',defineComponent({props:['disabled'],setup:(p,{slots,attrs})=>()=>h('button',{...attrs,disabled:p.disabled},slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 app.component('ASelect',defineComponent({props:['value','options','mode'],emits:['update:value'],setup:(p,{emit})=>()=>h('select',{
  multiple:p.mode==='multiple',value:p.value??'',onChange:(event:Event)=>{const select=event.target as HTMLSelectElement;
   emit('update:value',p.mode==='multiple'?[...select.selectedOptions].map(option=>option.value):select.value);}},
  [...(p.mode==='multiple'?[]:[h('option',{value:''},'')]),...(p.options||[]).map((option:{value:string;label:string})=>h('option',{value:option.value},option.label))])}));
 app.component('ATextarea',defineComponent({props:['value'],emits:['update:value'],setup:(p,{emit})=>()=>h('textarea',{
  value:p.value,onInput:(event:Event)=>emit('update:value',(event.target as HTMLTextAreaElement).value)})}));
 app.component('ACheckbox',defineComponent({props:['checked'],emits:['update:checked'],setup:(p,{emit,slots})=>()=>h('label',[
  h('input',{type:'checkbox',checked:p.checked,onChange:(event:Event)=>emit('update:checked',(event.target as HTMLInputElement).checked)}),slots.default?.()])}));
 app.mount(host);
}
function field(label:string){return host.querySelector(`[data-label="${label}"]`)!;}
async function choose(label:string,value:string){const select=field(label).querySelector('select')!;
 select.value=value;select.dispatchEvent(new Event('change'));await settle();}
async function text(label:string,value:string){const input=field(label).querySelector('textarea')!;
 input.value=value;input.dispatchEvent(new Event('input'));await settle();}
async function enable(value=true){const checkbox=host.querySelector<HTMLInputElement>('input[type=checkbox]')!;
 checkbox.checked=value;checkbox.dispatchEvent(new Event('change'));await settle();}
async function save(){[...host.querySelectorAll('button')].find(button=>button.textContent?.includes('保存'))!.click();await settle();}
async function begin(save:ReturnType<typeof vi.fn>,data=context(),props={resultId:'result',disabled:false}) {
 api.context.mockResolvedValue(data);mount(props,save);await settle();await choose('事实','AMOUNT');await text('本次复核原因','human review');
}

it.each(['SUPPORTED','CONTRADICTED','INSUFFICIENT_SOURCE'] as const)('submits explicit %s with exact values and an independent source snapshot',async verdict=>{
 const data=context(),emit=vi.fn();await begin(emit,data);await enable();
 expect(field('来源支持结论').querySelector('select')!.value).toBe('');
 await choose('来源支持结论',verdict);await text('来源标注原因',' checked source ');
 if(verdict!=='INSUFFICIENT_SOURCE')await choose('该模型事实的原证据','e1');
 await save();expect(emit).toHaveBeenCalledTimes(1);
 const decision=emit.mock.calls[0][0] as HumanFindingDecision;
 expect(decision.valueJson).toBe('{"amount":99.999999999999999999}');expect(decision).not.toHaveProperty('value');
 expect(decision.sourceSupport).toEqual([{rawFindingId:'claim',verdict,evidenceIds:verdict==='INSUFFICIENT_SOURCE'?[]:['e1'],messageIds:[],reason:'checked source'}]);
 await choose('来源支持结论','INSUFFICIENT_SOURCE');await text('来源标注原因','later edit');await enable(false);
 expect(decision.sourceSupport?.[0].reason).toBe('checked source');
 expect(data.findings[0].sourceSupport).toBeUndefined();
});

it('requires verdict reason and a source for support or contradiction while allowing frozen messages',async()=>{
 const emit=vi.fn();await begin(emit);await enable();await save();expect(emit).not.toHaveBeenCalled();
 await choose('来源支持结论','SUPPORTED');await save();expect(emit).not.toHaveBeenCalled();
 await text('来源标注原因','source checked');await save();expect(emit).not.toHaveBeenCalled();
 expect(host.textContent).toContain('必须引用来源');
 await choose('冻结会话来源','m1');await save();
 expect(emit.mock.calls[0][0].sourceSupport[0].messageIds).toEqual(['m1']);
});

it.each(['该模型事实的原证据','冻结会话来源'])('rejects a foreign reference in %s before emitting',async label=>{
 const emit=vi.fn();await begin(emit);await enable();await choose('来源支持结论','SUPPORTED');await text('来源标注原因','why');
 const select=field(label).querySelector('select')!;
 const foreign=document.createElement('option');foreign.value='foreign';foreign.textContent='stale foreign source';
 select.append(foreign);select.value='foreign';select.dispatchEvent(new Event('change'));await settle();
 await save();expect(emit).not.toHaveBeenCalled();expect(host.textContent).toContain('该模型事实的证据或冻结会话消息');
});

it('restores persisted annotations and omits an explicitly unchecked annotation',async()=>{
 const data=context(),emit=vi.fn();data.findings[0].sourceSupport=[{rawFindingId:'claim',verdict:'CONTRADICTED',evidenceIds:['e1'],messageIds:[],reason:'saved reason'}];
 await begin(emit,data);
 expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(true);
 expect(field('来源支持结论').querySelector('select')!.value).toBe('CONTRADICTED');
 expect(field('来源标注原因').querySelector('textarea')!.value).toBe('saved reason');
 await enable(false);await save();expect(emit.mock.calls[0][0]).not.toHaveProperty('sourceSupport');
 expect(data.findings[0].sourceSupport[0].reason).toBe('saved reason');
});

it('keeps legacy contexts usable without inventing model assessments',async()=>{
 const data=context(),emit=vi.fn();delete data.findings[0].modelClaims;await begin(emit,data);
 expect(host.querySelector('input[type=checkbox]')).toBeNull();await save();
 expect(emit.mock.calls[0][0]).not.toHaveProperty('sourceSupport');
});

it('clears private drafts on authorization refresh and ignores a late earlier response',async()=>{
 const emit=vi.fn(),props=reactive({resultId:'result',disabled:false,refreshToken:'allowed'});
 await begin(emit,context(),props);await enable();await text('来源标注原因','private draft');
 let late!:(value:HumanFindingContext)=>void;api.context.mockReturnValueOnce(new Promise(resolve=>{late=resolve;}));
 props.refreshToken='refresh-before-revoke';await settle();
 api.context.mockResolvedValueOnce({...context(),privacy:{policyVersion:'iqc-finding-review-context-read-v1',canonicalPayloadVisible:false,canReadFull:false,canReadPii:false,canReadPrompt:false,withheldFields:['findings','messages']}});
 props.refreshToken='revoked';await settle();late(context());await settle();
 expect(host.querySelector('select')).toBeNull();expect(host.textContent).not.toContain('private draft');expect(emit).not.toHaveBeenCalled();
 api.context.mockResolvedValueOnce(context());props.refreshToken='restored';await settle();await choose('事实','AMOUNT');
 expect(host.querySelector<HTMLInputElement>('input[type=checkbox]')!.checked).toBe(false);
});
