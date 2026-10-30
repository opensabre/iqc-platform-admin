import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import GoldSampleEditor from './GoldSampleEditor.vue';
import {message} from 'ant-design-vue';
import {getGoldSample,annotateGold,reviewGold,listGoldVersions,getGoldVersion,type GoldSample,type GoldVersion} from '@/api/evaluation';
const access=vi.hoisted(()=>({denied:[] as string[],refresh:null as null|{value:number}}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>{void access.refresh?.value;return !access.denied.includes(code);}})}));
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
beforeEach(()=>{vi.resetAllMocks();access.denied=reactive<string[]>([]);access.refresh=reactive({value:0});});afterEach(()=>{app?.unmount();host?.remove();});
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

function vm(){return (app as any)._instance.setupState;}
function revoke(code:string){access.denied.push(code);}
function restore(code:string){access.denied.splice(access.denied.indexOf(code),1);}
const version={id:'v1',sampleId:'sample',versionNo:1,sourceDraftRevision:1,decision:'APPROVED',reviewerId:'independent',reason:'checked',contentHash:'hash'} as GoldVersion;
async function loaded(changed=vi.fn()){vi.mocked(getGoldSample).mockResolvedValue(sample('iqc-gold-draft-v2'));mount(changed);await settle();return vm();}
describe('Gold exact operation permissions and request ownership',()=>{
 it.each([
  ['iqc:gold:review','review'],['iqc:gold:versions:view','history'],['iqc:gold:version:view','version'],
 ])('does not execute %s through another grant',async(permission,operation)=>{
  const editor=await loaded();revoke(permission);await settle();editor.reason='independently checked';
  if(operation==='review')await editor.review(true);else if(operation==='history')await editor.history();else await editor.view(version);
  expect(reviewGold).not.toHaveBeenCalled();expect(listGoldVersions).not.toHaveBeenCalled();expect(getGoldVersion).not.toHaveBeenCalled();
 });
 it('keeps annotation inputs when the effective permission values are unchanged',async()=>{
  const editor=await loaded();editor.context='{"retained":"unsaved context"}';editor.reason='unsaved reason';
  revoke('unrelated:grant');await settle();expect(getGoldSample).toHaveBeenCalledTimes(1);expect(editor.context).toContain('unsaved context');expect(editor.reason).toBe('unsaved reason');
  access.refresh!.value++;await settle();expect(getGoldSample).toHaveBeenCalledTimes(1);expect(editor.context).toContain('unsaved context');
 });
 it.each(['iqc:sensitive:conversation:read','iqc:sensitive:pii:read'])('clears sensitive copies and rejects old loads after %s changes',async(permission)=>{
  const old=deferred<GoldSample>(),fresh=deferred<GoldSample>();vi.mocked(getGoldSample).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);mount();await settle();
  revoke(permission);await settle();expect(getGoldSample).toHaveBeenCalledTimes(2);old.resolve(sample('iqc-gold-draft-v2'));await settle();expect(host.textContent).not.toContain('frozen text');expect(vm().sample).toBeUndefined();
  fresh.resolve({...sample('iqc-gold-draft-v2'),privacy:{policyVersion:'iqc-gold-read-v1',canonicalPayloadVisible:false,canReadFull:false,canReadPii:false} as GoldSample['privacy'],goldDraftJson:null});await settle();expect(host.textContent).not.toContain('frozen text');expect(vm().context).toBe('{}');
 });
 for(const operation of ['history','version']){
  const permission=operation==='history'?'iqc:gold:versions:view':'iqc:gold:version:view';
  it(`${operation}: rejects late success after revoke and restore, and permits a new exact read`,async()=>{
   const editor=await loaded();const old=deferred<any>();
   if(operation==='history')vi.mocked(listGoldVersions).mockReturnValueOnce(old.promise);else vi.mocked(getGoldVersion).mockReturnValueOnce(old.promise);
   const read=operation==='history'?editor.history(2):editor.view(version);revoke(permission);restore(permission);await settle();
   old.resolve(operation==='history'?{records:[version],total:19}:{...version,snapshotJson:'{"secret":"old snapshot"}'});await read;
   expect(editor.versions).toEqual([]);expect(editor.snapshot).toBe('');expect(editor.historyTotal).toBe(0);
   if(operation==='history'){vi.mocked(listGoldVersions).mockResolvedValueOnce({records:[version],total:1} as never);await editor.history(3);expect(listGoldVersions).toHaveBeenLastCalledWith('sample',3);expect(editor.versions).toHaveLength(1);}
   else{vi.mocked(getGoldVersion).mockResolvedValueOnce({...version,snapshotJson:'{"fresh":true}'});await editor.view(version);expect(getGoldVersion).toHaveBeenLastCalledWith('sample',1);expect(editor.snapshot).toContain('fresh');}
  });
  it(`${operation}: ignores late failures when its permission is withdrawn`,async()=>{
   const editor=await loaded();const old=deferred<any>();if(operation==='history')vi.mocked(listGoldVersions).mockReturnValueOnce(old.promise);else vi.mocked(getGoldVersion).mockReturnValueOnce(old.promise);
   const read=operation==='history'?editor.history():editor.view(version);revoke(permission);old.reject(new Error('late forbidden failure'));await read;expect(message.error).not.toHaveBeenCalled();
  });
 }
 for(const operation of ['annotate','review'])for(const outcome of ['success','failure']){
  const permission=`iqc:gold:${operation}`;
  it(`${operation}: old ${outcome} cannot overwrite or unlock a newer command after reauthorization`,async()=>{
   const changed=vi.fn(),editor=await loaded(changed),old=deferred<any>(),fresh=deferred<any>();editor.reason='checked independently';
   const api=operation==='annotate'?annotateGold:reviewGold;vi.mocked(api).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
   const oldSave=operation==='annotate'?editor.save():editor.review(true);revoke(permission);restore(permission);await settle();
   const freshSave=operation==='annotate'?editor.save():editor.review(true);expect(api).toHaveBeenCalledTimes(2);
   if(outcome==='success')old.resolve(operation==='annotate'?sample('iqc-gold-draft-v2'):version);else old.reject(new Error('old command failed'));await oldSave;
   expect(editor.busy).toBe(true);expect(changed).not.toHaveBeenCalled();expect(getGoldSample).toHaveBeenCalledTimes(1);expect(message.success).not.toHaveBeenCalled();expect(message.error).not.toHaveBeenCalled();
   fresh.resolve(operation==='annotate'?sample('iqc-gold-draft-v2'):version);await freshSave;expect(changed).toHaveBeenCalledTimes(1);expect(editor.busy).toBe(false);expect(getGoldSample).toHaveBeenCalledTimes(2);
  });
 }
 it('submits independent review using the original revision and reason',async()=>{
  const editor=await loaded();editor.reason='evidence checked';vi.mocked(reviewGold).mockResolvedValueOnce(version);await editor.review(false);
  expect(reviewGold).toHaveBeenCalledExactlyOnceWith('sample',{expectedRevision:1,approve:false,reason:'evidence checked'});expect(message.success).toHaveBeenCalledWith('审核决定已保存');
 });
});
