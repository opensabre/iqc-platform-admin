import {afterEach,it,expect,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
const api=vi.hoisted(()=>({compare:vi.fn()}));
vi.mock('@/api/evaluation',()=>({getModelConsistency:api.compare}));
import Panel from './ModelConsistencyPanel.vue';
import type {ModelConsistencyReport} from '@/api/evaluation';
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();});
async function settle(){await Promise.resolve();await nextTick();await Promise.resolve();await nextTick();}
function mount(props={taskId:'task',executionId:'execution',allowed:true}){
 host=document.createElement('div');document.body.append(host);app=createApp(defineComponent({setup:()=>()=>h(Panel,{...props})}));
 for(const name of ['ACard','AForm','AFormItem','ADescriptions','ADescriptionsItem'])app.component(name,defineComponent({setup:(_,{slots,attrs})=>()=>h('section',[attrs.label as string,slots.default?.()])}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 app.component('AButton',defineComponent({props:['disabled'],setup:(p,{slots,attrs})=>()=>h('button',{...attrs,disabled:p.disabled},slots.default?.())}));
 app.component('AInput',defineComponent({props:['value','disabled'],emits:['update:value'],setup:(p,{emit})=>()=>h('input',{value:p.value,disabled:p.disabled,onInput:(e:Event)=>emit('update:value',(e.target as HTMLInputElement).value)})}));
 app.mount(host);
}
async function fill(){const inputs=host.querySelectorAll('input');inputs[0].value='reference';inputs[0].dispatchEvent(new Event('input'));inputs[1].value='reference-execution';inputs[1].dispatchEvent(new Event('input'));await settle();host.querySelector('button')!.click();await settle();}
const report:ModelConsistencyReport={schemaVersion:'iqc-model-consistency-v1',scope:'test',expectedPairs:2,comparablePairs:0,agreeingPairs:0,comparisonCoverage:0,agreementRate:null,excludedReasons:{MISSING_ARTIFACT:2}};
it('submits explicit identities and renders unmeasured agreement without a perfect score',async()=>{
 api.compare.mockResolvedValue(report);mount();await fill();
 expect(api.compare).toHaveBeenCalledWith('task','execution','reference','reference-execution');
 expect(host.textContent).toContain('未测量');expect(host.textContent).not.toContain('100.00%');
});
it('does not request comparison after permission is revoked',async()=>{
 const props=reactive({taskId:'task',executionId:'execution',allowed:true});mount(props);props.allowed=false;await settle();await fill();
 expect(api.compare).not.toHaveBeenCalled();expect(host.querySelector('button')?.disabled).toBe(true);
});
it('ignores a late response after the selected execution changes',async()=>{
 let resolve!:(value:typeof report)=>void;api.compare.mockReturnValue(new Promise(r=>{resolve=r;}));
 const props=reactive({taskId:'task',executionId:'execution',allowed:true});mount(props);await fill();
 props.executionId='new-execution';await settle();resolve({...report,agreementRate:1,comparablePairs:2,agreeingPairs:2});await settle();
 expect(host.textContent).not.toContain('100.00%');expect(host.textContent).not.toContain('2 / 2');
});

it('distinguishes deployment-aware reports from legacy reports',async()=>{
 api.compare.mockResolvedValue({...report,schemaVersion:'iqc-model-consistency-v2',excludedReasons:{UNMEASURED_DEPLOYMENT:1,DIFFERENT_MODEL_DEPLOYMENT_OR_INPUT:1}});
 mount();await fill();
 expect(host.textContent).toContain('部署版本未测量');
 expect(host.textContent).toContain('模型、部署或输入不同');
 expect(host.textContent).not.toContain('旧版报告仅比较');
 api.compare.mockResolvedValue(report);host.querySelector('button')!.click();await settle();
 expect(host.textContent).toContain('旧版报告仅比较');
});
it('clears loaded results when permission changes and requires another comparison after restoration',async()=>{
 api.compare.mockResolvedValue({...report,agreementRate:1,comparablePairs:2,agreeingPairs:2});
 const props=reactive({taskId:'task',executionId:'execution',allowed:true});mount(props);await fill();
 expect(host.textContent).toContain('100.00%');
 props.allowed=false;await settle();expect(host.textContent).not.toContain('100.00%');
 props.allowed=true;await settle();expect(host.textContent).not.toContain('100.00%');
 expect(api.compare).toHaveBeenCalledTimes(1);
 host.querySelector('button')!.click();await settle();expect(api.compare).toHaveBeenCalledTimes(2);
 expect(host.textContent).toContain('100.00%');
});
it.each(['permission','reference'])('discards a pending response after %s changes',async(change)=>{
 let resolve!:(value:typeof report)=>void;api.compare.mockReturnValue(new Promise(r=>{resolve=r;}));
 const props=reactive({taskId:'task',executionId:'execution',allowed:true});mount(props);await fill();
 if(change==='permission'){props.allowed=false;await settle();props.allowed=true;}
 else{const input=host.querySelector('input')!;input.value='another-reference';input.dispatchEvent(new Event('input'));}
 await settle();resolve({...report,agreementRate:1,comparablePairs:2,agreeingPairs:2});await settle();
 expect(host.textContent).not.toContain('100.00%');expect(host.textContent).not.toContain('2 / 2');
});
it('rejects unknown report protocols without showing their scores',async()=>{
 api.compare.mockResolvedValue({...report,schemaVersion:'future',agreementRate:1});mount();await fill();
 expect(host.textContent).toContain('一致性比较失败');expect(host.textContent).not.toContain('100.00%');
});
