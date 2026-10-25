import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import GoldSampleEditor from './GoldSampleEditor.vue';
import {message} from 'ant-design-vue';
import {getGoldSample,annotateGold,reviewGold,type GoldSample,type GoldVersion} from '@/api/evaluation';
const access=vi.hoisted(()=>({denied:[] as string[]}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>!access.denied.includes(code)})}));
vi.mock('@/api/evaluation',()=>({getGoldSample:vi.fn(),annotateGold:vi.fn(),reviewGold:vi.fn(),listGoldVersions:vi.fn(),getGoldVersion:vi.fn()}));
vi.mock('ant-design-vue',()=>({message:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}}));
const pass=defineComponent({setup(_,{slots,attrs}){return()=>h('div',[attrs.message as string,slots.default?.()]);}});
let app:App|undefined,host:HTMLDivElement;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function sample(schemaVersion:string,value='true'):GoldSample {
 return {id:'sample',name:'待标注候选',sampleType:'UNCLASSIFIED',status:'CANDIDATE',contentSnapshot:null,goldDraftRevision:1,goldStatus:'PENDING_REVIEW',
  goldDraftJson:`{"schemaVersion":"${schemaVersion}","sourceSampleId":"sample","conversationId":"conversation","messages":[{"id":"message","role":"agent","content":"frozen text","sequence":1}],"findings":[{"code":"FACT","valueType":"${value==='true'?'BOOLEAN':'NUMBER'}","state":"KNOWN","value":${value},"evidenceMessageIds":["message"]}],"annotatorId":"annotator","source":"RESULT:result","tags":[],"difficulty":"BASIC"}`};
}
function mount(changed=vi.fn()){
 host=document.createElement('div');document.body.append(host);app=createApp(GoldSampleEditor,{sampleId:'sample',onChanged:changed});
 for(const name of ['ASpin','AAlert','ATag','ACollapse','ACollapsePanel','AForm','AFormItem','ASpace','ACard','AList','AListItem','APagination','ASelect','ASwitch'])app.component(name,pass);
 app.component('AButton',defineComponent({setup(_,{attrs,slots}){return()=>h('button',attrs,slots.default?.());}}));
 app.component('AInput',defineComponent({props:['value','disabled'],setup(props){return()=>h('input',{value:props.value,disabled:props.disabled});}}));
 app.component('ATextarea',defineComponent({props:['value'],emits:['update:value'],setup(props,{emit,attrs}){return()=>h('textarea',{...attrs,value:props.value,onInput:(e:Event)=>emit('update:value',(e.target as HTMLTextAreaElement).value)});}}));
 app.mount(host);
}
function saveButton(){return [...host.querySelectorAll('button')].find(b=>b.textContent==='保存标注');}
beforeEach(()=>{vi.resetAllMocks();access.denied=reactive<string[]>([]);});afterEach(()=>{app?.unmount();host?.remove();});
describe('Gold draft protocol compatibility',()=>{
 it.each(['iqc-gold-draft-v1','iqc-gold-draft-v2'])('loads %s frozen draft for annotation',async schema=>{
  vi.mocked(getGoldSample).mockResolvedValue(sample(schema));mount();await settle();
  expect(host.textContent).toContain('frozen text');expect(host.textContent).not.toContain('加载失败');
  expect(host.querySelector('input')?.value).toBe('FACT');expect(saveButton()?.disabled).toBe(false);
 });
 it('keeps unsafe exact numbers read only and displays the original JSON',async()=>{
  const row=sample('iqc-gold-draft-v2','9007199254740993');vi.mocked(getGoldSample).mockResolvedValue(row);mount();await settle();
  expect(host.textContent).toContain('本表单无法精确保留');expect(host.querySelector('.exact-snapshot')?.textContent).toBe(row.goldDraftJson);
  expect(saveButton()).toBeUndefined();expect(host.textContent).toContain('独立审核');
 });
 it('rejects unknown protocols rather than interpreting them as legacy drafts',async()=>{
  vi.mocked(getGoldSample).mockResolvedValue(sample('iqc-gold-draft-v99'));mount();await settle();
  expect(host.textContent).toContain('加载失败或协议无效');expect(host.textContent).not.toContain('frozen text');expect(saveButton()?.disabled).toBe(true);
 });
});

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function dispose(){app?.unmount();app=undefined;}
describe('Gold editor pending commands after unmount',()=>{
 it('does not emit changed or reload after a late saved annotation',async()=>{
  const row=sample('iqc-gold-draft-v2'),pending=deferred<GoldSample>(),changed=vi.fn();
  vi.mocked(getGoldSample).mockResolvedValue(row);vi.mocked(annotateGold).mockReturnValue(pending.promise);
  mount(changed);await settle();saveButton()!.click();await settle();expect(annotateGold).toHaveBeenCalledTimes(1);
  dispose();pending.resolve(row);await settle();
  expect(changed).not.toHaveBeenCalled();expect(getGoldSample).toHaveBeenCalledTimes(1);expect(message.success).not.toHaveBeenCalled();
 });
 it('does not show a global error for a failed annotation after leaving',async()=>{
  const pending=deferred<GoldSample>();vi.mocked(getGoldSample).mockResolvedValue(sample('iqc-gold-draft-v2'));vi.mocked(annotateGold).mockReturnValue(pending.promise);
  mount();await settle();saveButton()!.click();await settle();expect(annotateGold).toHaveBeenCalledTimes(1);
  dispose();pending.reject(new Error('late failure'));await settle();expect(message.error).not.toHaveBeenCalled();
 });
 it('does not emit changed or reload after a late independent review',async()=>{
  const pending=deferred<GoldVersion>(),changed=vi.fn();vi.mocked(getGoldSample).mockResolvedValue(sample('iqc-gold-draft-v2'));vi.mocked(reviewGold).mockReturnValue(pending.promise);
  mount(changed);await settle();const reason=host.querySelector<HTMLTextAreaElement>('textarea[placeholder="审核原因（必填）"]')!;
  reason.value='independently checked';reason.dispatchEvent(new Event('input'));await settle();
  [...host.querySelectorAll('button')].find(b=>b.textContent==='批准')!.click();await settle();expect(reviewGold).toHaveBeenCalledTimes(1);
  dispose();pending.resolve({id:'version',sampleId:'sample',versionNo:1,sourceDraftRevision:1,decision:'APPROVED',reviewerId:'reviewer',reason:'checked',contentHash:'hash'});await settle();
  expect(changed).not.toHaveBeenCalled();expect(getGoldSample).toHaveBeenCalledTimes(1);expect(message.success).not.toHaveBeenCalled();
 });
});

describe('Gold view permission revocation',()=>{
 it('does not read a gold sample when view access is absent',async()=>{
  access.denied.push('iqc:gold:view');mount();await settle();expect(getGoldSample).not.toHaveBeenCalled();
 });
 it('clears loaded text and requires a fresh response after access returns',async()=>{
  const row=sample('iqc-gold-draft-v2'),fresh=deferred<GoldSample>();vi.mocked(getGoldSample).mockResolvedValueOnce(row).mockReturnValueOnce(fresh.promise);
  mount();await settle();expect(host.textContent).toContain('frozen text');
  access.denied.push('iqc:gold:view');await settle();expect(host.textContent).not.toContain('frozen text');
  access.denied.splice(0);await settle();expect(getGoldSample).toHaveBeenCalledTimes(2);expect(host.textContent).not.toContain('frozen text');
  fresh.resolve({...row,goldDraftJson:row.goldDraftJson!.replace('frozen text','fresh text')});await settle();expect(host.textContent).toContain('fresh text');
 });
 it('does not revive an in-flight sample after access is revoked',async()=>{
  const pending=deferred<GoldSample>();vi.mocked(getGoldSample).mockReturnValue(pending.promise);mount();await settle();
  access.denied.push('iqc:gold:view');await settle();pending.resolve(sample('iqc-gold-draft-v2'));await settle();expect(host.textContent).not.toContain('frozen text');
 });
 it('ignores a saved annotation response after view access is revoked',async()=>{
  const row=sample('iqc-gold-draft-v2'),pending=deferred<GoldSample>(),changed=vi.fn();vi.mocked(getGoldSample).mockResolvedValue(row);vi.mocked(annotateGold).mockReturnValue(pending.promise);
  mount(changed);await settle();saveButton()!.click();await settle();expect(annotateGold).toHaveBeenCalledTimes(1);
  access.denied.push('iqc:gold:view');await settle();pending.resolve(row);await settle();
  expect(host.textContent).not.toContain('frozen text');expect(changed).not.toHaveBeenCalled();expect(getGoldSample).toHaveBeenCalledTimes(1);expect(message.success).not.toHaveBeenCalled();
 });
});
