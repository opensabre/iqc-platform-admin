import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, inject, nextTick, provide, reactive, type App } from 'vue';
import QualityOperations from './index.vue';
import { listSamples, listFeedbacks, listReviews, getQualityReport } from '@/api/quality';
const state=vi.hoisted(()=>({permissions:null as null|Record<string,boolean>}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>state.permissions?.[code]??false})}));
vi.mock('ant-design-vue',()=>({message:{error:vi.fn(),success:vi.fn()},Modal:{confirm:vi.fn()}}));
vi.mock('@/api/quality',()=>({decideReview:vi.fn(),getQualityReport:vi.fn(),listFeedbacks:vi.fn(),listReviews:vi.fn(),listSamples:vi.fn()}));
vi.mock('@/components/BusinessReviewQueue.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/LabelReviewQueue.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/BusinessQualityReport.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
vi.mock('@/components/GoldSampleEditor.vue',()=>({default:defineComponent({setup:()=>()=>h('div')})}));
let app:App,host:HTMLDivElement;
const full='iqc:sensitive:conversation:read',pii='iqc:sensitive:pii:read',view='iqc:sample:view';
const pass=defineComponent({setup(_, {slots,attrs}){return()=>h('div',[attrs.message as string,slots.default?.()]);}});
function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(QualityOperations);
 for(const name of ['AAlert','ACard','AForm','AFormItem','ASelect','ASelectOption','AInputNumber','ATextarea','AStatistic','ACol','ARow','ATag'])app.component(name,pass);
 for(const name of ['AModal','ADrawer'])app.component(name,defineComponent({setup:()=>()=>h('div')}));
 app.component('AButton',defineComponent({setup(_, {slots,attrs}){return()=>h('button',attrs,slots.default?.());}}));
 app.component('ATabs',defineComponent({emits:['update:activeKey','change'],setup(_, {emit,slots}){
  provide('select',(key:string)=>{emit('update:activeKey',key);emit('change',key);});return()=>h('div',slots.default?.());
 }}));
 app.component('ATabPane',defineComponent({props:['tab'],setup(props,{slots}){const select=inject<(key:string)=>void>('select')!;
  return()=>h('div',[h('button',{onClick:()=>select(({'样本库':'samples','人工复核':'reviews','误判/漏判':'feedback'} as Record<string,string>)[props.tab]??'business')},props.tab),slots.default?.()]);
 }}));
 app.component('ATable',defineComponent({props:['dataSource'],setup(props,{slots}){provide('rows',()=>props.dataSource??[]);return()=>h('div',slots.default?.());}}));
 app.component('ATableColumn',defineComponent({props:['dataIndex'],setup(props,{slots}){const rows=inject<()=>Record<string,unknown>[]>('rows')!;
  return()=>h('div',rows().map(record=>h('span',slots.default?.({record,text:record[props.dataIndex]})??String(record[props.dataIndex]??''))));
 }}));app.mount(host);
}
async function flush(){for(let i=0;i<6;i++){await Promise.resolve();await nextTick();}}
async function selectSamples(){[...host.querySelectorAll('button')].find(button=>button.textContent==='样本库')!.click();await flush();}
function sample(expected:Record<string,unknown>={}){return {id:'sample',name:'candidate',sampleType:'UNCLASSIFIED',status:'CANDIDATE',goldStatus:'APPROVED',contentSnapshot:'frozen private text',expectedJson:JSON.stringify({schemaVersion:'iqc-ai-mined-candidate-v1',miningStrategy:'FUSED_UNCERTAINTY',miningVersion:1,reasonCodes:['LOW_CONFIDENCE'],...expected}),privacy:{policyVersion:'iqc-gold-read-v1',candidateContentVisible:true,canReadFull:true,canReadPii:true}};}
function reply(rows:unknown[]){vi.mocked(listSamples).mockResolvedValueOnce(rows as never);}
beforeEach(()=>{vi.resetAllMocks();state.permissions=reactive({[view]:true,[full]:true,[pii]:true});});
afterEach(()=>{app?.unmount();host?.remove();});
describe('candidate pool frozen provenance and permission boundaries',()=>{
 it('shows bounded reasons as pending verification while preserving actual Gold state',async()=>{
  reply([sample()]);mount();await selectSamples();expect(host.textContent).toContain('待核实：置信度低于阈值');
  expect(host.textContent).toContain('未分类（挖掘来源）');expect(host.textContent).toContain('APPROVED');expect(host.textContent).toContain('frozen private text');
 });
 it('never requests samples without sample:view',async()=>{state.permissions![view]=false;mount();await selectSamples();expect(listSamples).not.toHaveBeenCalled();});
 it('clears loaded data on revoke and reads fresh authorization after explicit refresh',async()=>{
  reply([sample()]);mount();await selectSamples();state.permissions![view]=false;await flush();expect(host.textContent).not.toContain('frozen private text');
  reply([{...sample(),contentSnapshot:'fresh authorized text'}]);state.permissions![view]=true;await flush();await refresh();
  expect(listSamples).toHaveBeenCalledTimes(2);expect(host.textContent).toContain('fresh authorized text');
 });
 it('discards a pending response after read permission is revoked',async()=>{
  let resolve!:(rows:never)=>void;vi.mocked(listSamples).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  mount();await selectSamples();state.permissions![view]=false;await flush();resolve([sample()] as never);await flush();
  expect(host.textContent).not.toContain('frozen private text');expect(host.textContent).not.toContain('待核实：置信度低于阈值');
 });
 it.each([full,pii])('clears cached data and refuses reason disclosure after %s revoke',async(permission)=>{
  reply([sample()]);mount();await selectSamples();reply([{...sample(),contentSnapshot:null,privacy:{...sample().privacy,candidateContentVisible:false}}]);
  state.permissions![permission]=false;await flush();expect(host.textContent).not.toContain('frozen private text');await refresh();expect(listSamples).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain('frozen private text');expect(host.textContent).not.toContain('待核实：置信度低于阈值');expect(host.textContent).toContain('筛选依据受权限限制');
 });
 it.each([{schemaVersion:'unknown'},{miningVersion:2},{reasonCodes:['UNTRUSTED_SECRET']},{reasonCodes:['LOW_CONFIDENCE','LOW_CONFIDENCE']}])('rejects unsupported lineage %j',async(lineage)=>{
  reply([sample(lineage)]);mount();await selectSamples();expect(host.textContent).toContain('筛选依据不可用');expect(host.textContent).not.toContain('UNTRUSTED_SECRET');
 });
 it('rejects oversized source JSON',async()=>{reply([{...sample(),expectedJson:' '.repeat(16385)}]);mount();await selectSamples();expect(host.textContent).toContain('筛选依据不可用');});
});

async function selectTab(label:string){[...host.querySelectorAll('button')].find(button=>button.textContent===label)!.click();await flush();}
async function refresh(){await selectTab('刷新');}
const cases=[
 {label:'人工复核',permission:'iqc:review:view',api:listReviews,field:'resultId'},
 {label:'误判/漏判',permission:'iqc:result:feedback:view',api:listFeedbacks,field:'comment'},
 {label:'样本库',permission:view,api:listSamples,field:'name'},
];
function deferred(){let resolve!:(value:never)=>void;const promise=new Promise<never>(done=>{resolve=done;});return {promise,resolve};}
describe('quality operations exact read grants and response ownership',()=>{
 it('feedback read permission alone reads feedback without result permission',async()=>{
  state.permissions=reactive({'iqc:result:feedback:view':true});vi.mocked(listFeedbacks).mockResolvedValueOnce([{id:'f',comment:'authorized feedback'}] as never);
  mount();await selectTab('误判/漏判');expect(listFeedbacks).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('authorized feedback');expect(getQualityReport).not.toHaveBeenCalled();
 });
 it('result read permission alone cannot read feedback',async()=>{
  state.permissions=reactive({'iqc:result:view':true});mount();await selectTab('误判/漏判');expect(listFeedbacks).not.toHaveBeenCalled();
 });
 for(const {label,permission,api,field} of cases){
  it(`${label}: rejects a late response after revoke and restore until a new read`,async()=>{
   state.permissions![permission]=true;const old=deferred();vi.mocked(api).mockReturnValueOnce(old.promise);mount();await selectTab(label);
   state.permissions![permission]=false;state.permissions![permission]=true;await flush();old.resolve([{id:'old',[field]:'obsolete private row'}] as never);await flush();
   expect(host.textContent).not.toContain('obsolete private row');expect(api).toHaveBeenCalledTimes(1);
   vi.mocked(api).mockResolvedValueOnce([{id:'fresh',[field]:'fresh permitted row'}] as never);await refresh();expect(host.textContent).toContain('fresh permitted row');expect(api).toHaveBeenCalledTimes(2);
  });
  it(`${label}: clears existing rows on related revoke but preserves them on unrelated changes`,async()=>{
   state.permissions![permission]=true;vi.mocked(api).mockResolvedValueOnce([{id:'r',[field]:'loaded private row'}] as never);mount();await selectTab(label);
   expect(host.textContent).toContain('loaded private row');state.permissions!['unrelated:write']=true;await flush();expect(host.textContent).toContain('loaded private row');expect(api).toHaveBeenCalledTimes(1);
   state.permissions![permission]=false;await flush();expect(host.textContent).not.toContain('loaded private row');expect(api).toHaveBeenCalledTimes(1);
  });
  it(`${label}: report permission cannot substitute for list permission`,async()=>{
   state.permissions=reactive({'iqc:report:view':true});vi.mocked(getQualityReport).mockResolvedValueOnce({pendingReviewCount:7} as never);mount();await selectTab(label);
   expect(api).not.toHaveBeenCalled();expect(getQualityReport).toHaveBeenCalledTimes(1);expect((app as any)._instance.setupState.report.pendingReviewCount).toBe(7);
  });
 }
 it.each([full,pii,'iqc:report:view'])('invalidates a pending report after %s changes',async(permission)=>{
  state.permissions!['iqc:report:view']=true;reply([]);const pending=deferred();vi.mocked(getQualityReport).mockReturnValueOnce(pending.promise);mount();await selectSamples();
  expect(getQualityReport).toHaveBeenCalledTimes(1);state.permissions![permission]=false;state.permissions![permission]=true;pending.resolve({pendingReviewCount:99} as never);await flush();
  expect((app as any)._instance.setupState.report).toBeUndefined();expect(getQualityReport).toHaveBeenCalledTimes(1);
 });
 it('rejects list data after switching tabs and after unmount',async()=>{
  state.permissions!['iqc:result:feedback:view']=true;const pending=deferred();vi.mocked(listFeedbacks).mockReturnValueOnce(pending.promise);mount();await selectTab('误判/漏判');reply([]);await selectSamples();
  pending.resolve([{id:'f',comment:'wrong tab data'}] as never);await flush();expect(host.textContent).not.toContain('wrong tab data');
  const next=deferred();vi.mocked(listFeedbacks).mockReturnValueOnce(next.promise);await selectTab('误判/漏判');const vm=(app as any)._instance.setupState;app.unmount();next.resolve([{id:'f',comment:'unmounted data'}] as never);await flush();expect(vm.feedbacks).toEqual([]);
 });
});
