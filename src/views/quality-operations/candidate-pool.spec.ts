import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, inject, nextTick, provide, reactive, type App } from 'vue';
import QualityOperations from './index.vue';
import { listSamples } from '@/api/quality';
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
  return()=>h('div',[h('button',{onClick:()=>select(props.tab==='样本库'?'samples':'business')},props.tab),slots.default?.()]);
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
 it('clears loaded data on revoke and fetches fresh authorization on restore',async()=>{
  reply([sample()]);mount();await selectSamples();state.permissions![view]=false;await flush();expect(host.textContent).not.toContain('frozen private text');
  reply([{...sample(),contentSnapshot:'fresh authorized text'}]);state.permissions![view]=true;await flush();
  expect(listSamples).toHaveBeenCalledTimes(2);expect(host.textContent).toContain('fresh authorized text');
 });
 it('discards a pending response after read permission is revoked',async()=>{
  let resolve!:(rows:never)=>void;vi.mocked(listSamples).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  mount();await selectSamples();state.permissions![view]=false;await flush();resolve([sample()] as never);await flush();
  expect(host.textContent).not.toContain('frozen private text');expect(host.textContent).not.toContain('待核实：置信度低于阈值');
 });
 it.each([full,pii])('clears cached data and refuses reason disclosure after %s revoke',async(permission)=>{
  reply([sample()]);mount();await selectSamples();reply([{...sample(),contentSnapshot:null,privacy:{...sample().privacy,candidateContentVisible:false}}]);
  state.permissions![permission]=false;await flush();expect(listSamples).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain('frozen private text');expect(host.textContent).not.toContain('待核实：置信度低于阈值');expect(host.textContent).toContain('筛选依据受权限限制');
 });
 it.each([{schemaVersion:'unknown'},{miningVersion:2},{reasonCodes:['UNTRUSTED_SECRET']},{reasonCodes:['LOW_CONFIDENCE','LOW_CONFIDENCE']}])('rejects unsupported lineage %j',async(lineage)=>{
  reply([sample(lineage)]);mount();await selectSamples();expect(host.textContent).toContain('筛选依据不可用');expect(host.textContent).not.toContain('UNTRUSTED_SECRET');
 });
 it('rejects oversized source JSON',async()=>{reply([{...sample(),expectedJson:' '.repeat(16385)}]);mount();await selectSamples();expect(host.textContent).toContain('筛选依据不可用');});
});
