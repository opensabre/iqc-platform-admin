import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createApp, defineComponent, h, nextTick, reactive, type App} from 'vue';
import Schedules from './schedules.vue';
import Subscriptions from './subscriptions.vue';

const mocks = vi.hoisted(() => ({
 list:vi.fn(), get:vi.fn(), create:vi.fn(), update:vi.fn(), publish:vi.fn(), availability:vi.fn(),
 versions:vi.fn(), instances:vi.fn(), preview:vi.fn(), success:vi.fn(), warning:vi.fn(), error:vi.fn(), confirm:vi.fn(),
}));
vi.mock('ant-design-vue',()=>({message:{success:mocks.success,warning:mocks.warning,error:mocks.error},Modal:{confirm:mocks.confirm}}));
const access=reactive({denied:[] as string[]});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(key:string)=>!access.denied.includes(key)&&!key.startsWith('iqc:pipeline:')&&!key.includes('attempt')})}));
vi.mock('@/api/periodic-schedules',()=>({listSchedules:mocks.list,getSchedule:mocks.get,createSchedule:mocks.create,updateSchedule:mocks.update,publishSchedule:mocks.publish,availabilitySchedule:mocks.availability,scheduleVersions:mocks.versions,scheduleInstances:mocks.instances,previewSchedule:mocks.preview}));
vi.mock('@/api/event-subscriptions',()=>({listSchedules:mocks.list,getSchedule:mocks.get,createSchedule:mocks.create,updateSchedule:mocks.update,publishSchedule:mocks.publish,availabilitySchedule:mocks.availability,scheduleVersions:mocks.versions,scheduleInstances:mocks.instances}));
vi.mock('@/components/AutomaticRetryPolicyEditor.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/SelectorAssetLibrary.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/TriggerAttemptHistory.vue',()=>({default:{render:()=>null}}));
const pass=defineComponent({setup(_, {slots}){return()=>h('div',slots.default?.());}});
let app:App|undefined,host:HTMLDivElement;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function deferred(){let resolve!:(value:any)=>void,reject!:(error:Error)=>void;const promise=new Promise<any>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function click(label:string){const b=[...host.querySelectorAll('button')].find(x=>x.textContent===label);expect(b,label).toBeDefined();b!.click();await settle();}
function unmount(){app?.unmount();app=undefined;}
function resetEffects(){for(const key of ['get','list','versions','instances','success','warning','error'] as const)mocks[key].mockClear();}
beforeEach(()=>{access.denied=[];vi.resetAllMocks();mocks.list.mockResolvedValue({records:[],total:0});mocks.versions.mockResolvedValue([]);mocks.instances.mockResolvedValue({records:[],total:0});});
afterEach(()=>{unmount();host?.remove();});

for(const kind of ['periodic','subscription'] as const){
 describe(`${kind} asynchronous lifecycle`,()=>{
  let row:any;
  async function mount(){
   const definition=kind==='periodic'?{schemaVersion:'iqc-periodic-definition-v1',cron:'0 0 2 * * *',zoneId:'Asia/Shanghai',effectiveFrom:'2026-10-19T00:00:00Z',effectiveUntil:null,misfirePolicy:'FIRE_LATEST',maximumCatchUp:1,concurrency:1,pipeline:{pipelineId:'p1',versionNo:1},selector:{selectorId:'s1',versionNo:1}}:{schemaVersion:'iqc-event-subscription-v1',eventType:'ConversationCompleted',effectiveFrom:'2026-10-19T00:00:00Z',effectiveUntil:null,waitSeconds:30,concurrency:1,pipeline:{pipelineId:'p1',versionNo:1},selector:null};
   row={id:'a1',code:'DAILY',name:'会话质检',draftRevision:1,draftConfigJson:JSON.stringify(definition),activeRevisionId:'v1',status:'DISABLED'};
   mocks.list.mockResolvedValue({records:[row],total:1});mocks.get.mockResolvedValue(row);
   host=document.createElement('div');document.body.append(host);app=createApp(kind==='periodic'?Schedules:Subscriptions);
   for(const name of ['ASpace','AForm','AFormItem','AList','AListItem','APagination','ASelect','AInputNumber','ASwitch','ACollapse','ACollapsePanel','RouterLink'])app.component(name,pass);
   app.component('AButton',defineComponent({setup(_, {slots,attrs}){return()=>h('button',attrs,slots.default?.());}}));
   app.component('AInput',defineComponent({props:['value'],setup(p){return()=>h('input',{value:p.value});}}));
   app.component('AAlert',defineComponent({props:['message'],setup(p){return()=>h('p',p.message);}}));
   app.component('ADrawer',defineComponent({props:['open'],setup(p,{slots}){return()=>p.open?h('section',slots.default?.()):null;}}));
   app.component('ATable',defineComponent({props:['dataSource','columns'],setup(p,{slots}){return()=>h('div',p.dataSource.flatMap((record:any)=>p.columns.map((column:any)=>slots.bodyCell?.({record,column}))));}}));
   app.mount(host);await settle();await click('会话质检');resetEffects();
  }
  const prefix=kind==='periodic'?'iqc:schedule':'iqc:subscription';
  function vm(){return (app as any)._instance.setupState;}
  it('detail revoke and restore cannot adopt the old private response',async()=>{await mount();const slow=deferred();mocks.get.mockReturnValueOnce(slow.promise);const request=vm().load(row);access.denied=[`${prefix}:detail:view`];access.denied=[];slow.resolve({...row,name:'Late private'});await request;expect(vm().name).toBe('');expect(vm().selected.draftConfigJson).toBeNull();expect(vm().busy).toBe(false);});
  for(const sensitive of ['iqc:sensitive:conversation:read','iqc:sensitive:pii:read','iqc:sensitive:prompt:read'])it(`${sensitive} revocation clears private draft copies`,async()=>{await mount();vm().selected.lastError='private error';access.denied=[sensitive];await settle();expect(vm().name).toBe('');expect(vm().selected.name).toBe('');expect(vm().selected.draftConfigJson).toBeNull();expect(vm().selected.lastError).toBeNull();expect(vm().definition.pipeline.pipelineId).toBe('');expect(vm().open).toBe(false);});
  it('an old detail finally cannot unlock a new authorized detail request',async()=>{await mount();const old=deferred(),fresh=deferred();mocks.get.mockReturnValueOnce(old.promise);const first=vm().load(row);access.denied=[`${prefix}:detail:view`];expect(vm().busy).toBe(false);access.denied=[];mocks.get.mockReturnValueOnce(fresh.promise);const second=vm().load(row);old.resolve(row);await first;expect(vm().busy).toBe(true);fresh.resolve({...row,name:'Fresh'});await second;expect(vm().name).toBe('Fresh');expect(vm().busy).toBe(false);});
  it('revoked and restored update ignores its old receipt and follow-up reads',async()=>{await mount();const slow=deferred();mocks.update.mockReturnValueOnce(slow.promise);const request=vm().save();access.denied=[`${prefix}:update`];access.denied=[];slow.resolve({...row,draftRevision:2});await request;expect(vm().selected.draftRevision).toBe(1);expect(mocks.get).not.toHaveBeenCalled();expect(mocks.success).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();expect(vm().busy).toBe(false);});
  it('a sensitive revoke prevents a pending save from restoring its private receipt',async()=>{await mount();const slow=deferred();mocks.update.mockReturnValueOnce(slow.promise);const request=vm().save();access.denied=['iqc:sensitive:prompt:read'];slow.resolve({...row,draftRevision:2});await request;expect(vm().name).toBe('');expect(vm().selected.draftConfigJson).toBeNull();expect(mocks.get).not.toHaveBeenCalled();expect(mocks.success).not.toHaveBeenCalled();});
  it('a successful new draft without detail permission never performs a private reread',async()=>{await mount();access.denied=[`${prefix}:detail:view`];await settle();vm().create();vm().name=row.name;vm().code='NEW_TRIGGER';vm().definition=JSON.parse(row.draftConfigJson);mocks.create.mockResolvedValue({...row,id:'new'});await vm().save();expect(mocks.create).toHaveBeenCalledOnce();expect(mocks.get).not.toHaveBeenCalled();expect(vm().selected.draftConfigJson).toBeNull();expect(vm().name).toBe('');expect(vm().restricted).toBe(true);});
  it('confirmed save reread failure retains only metadata and requires an explicit read',async()=>{await mount();mocks.update.mockResolvedValue({...row,draftRevision:2});mocks.get.mockRejectedValueOnce(Error('read failed'));await vm().save();expect(vm().selected.draftRevision).toBe(2);expect(vm().selected.draftConfigJson).toBeNull();expect(vm().name).toBe('');expect(vm().restricted).toBe(true);expect(mocks.warning).toHaveBeenCalled();});
  it('normal save retains the original id revision name and frozen target',async()=>{await mount();mocks.update.mockResolvedValue({...row,draftRevision:2});mocks.get.mockResolvedValue({...row,draftRevision:2});await vm().save();expect(mocks.update).toHaveBeenCalledExactlyOnceWith('a1',1,'会话质检',expect.objectContaining({pipeline:{pipelineId:'p1',versionNo:1}}));expect(vm().selected.draftRevision).toBe(2);});
  for(const operation of ['publish','availability'] as const)it(`revoked ${operation} ignores the old receipt without follow-up reads`,async()=>{await mount();const slow=deferred();mocks[operation].mockReturnValueOnce(slow.promise);let request:Promise<any>;if(operation==='publish'){vm().publish();request=mocks.confirm.mock.calls[0][0].onOk();}else request=vm().availability(row);access.denied=[`${prefix}:${operation}`];access.denied=[];slow.resolve(row);await request;expect(mocks.success).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();});
  it('old save finally cannot unlock a new read after write grant restoration',async()=>{await mount();const old=deferred(),fresh=deferred();mocks.update.mockReturnValueOnce(old.promise);const first=vm().save();access.denied=[`${prefix}:update`];access.denied=[];mocks.get.mockReturnValueOnce(fresh.promise);const second=vm().load(row);old.resolve({...row,draftRevision:2});await first;expect(vm().busy).toBe(true);expect(mocks.list).not.toHaveBeenCalled();fresh.resolve(row);await second;expect(vm().busy).toBe(false);});
  it('an unrelated permission update preserves private unsaved edits',async()=>{await mount();vm().name='Unsaved';const definition=JSON.stringify(vm().definition);access.denied=['unrelated:grant'];await settle();expect(vm().name).toBe('Unsaved');expect(JSON.stringify(vm().definition)).toBe(definition);expect(vm().selected.draftConfigJson).toBe(row.draftConfigJson);});
  if(kind==='periodic')it('revoked preview cannot restore late planned times',async()=>{await mount();const slow=deferred();mocks.preview.mockReturnValueOnce(slow.promise);const request=vm().preview();access.denied=['iqc:schedule:preview'];access.denied=[];slow.resolve(['2026-10-30T00:00:00Z']);await request;expect(vm().times).toEqual([]);expect(vm().busy).toBe(false);});
  it('keeps normal save confirmation and reloads the confirmed revision',async()=>{
   await mount();const receipt={...row,draftRevision:2};mocks.update.mockResolvedValue(receipt);mocks.get.mockResolvedValue(receipt);
   await click('保存草稿');expect(mocks.update).toHaveBeenCalledTimes(1);expect(mocks.success).toHaveBeenCalledWith('草稿已保存');
   expect(mocks.get).toHaveBeenCalledWith('a1');expect(mocks.list).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('草稿修订 2');
  });
  it('keeps a confirmed save distinct from a failed reread',async()=>{
   await mount();mocks.update.mockResolvedValue({...row,draftRevision:2,draftConfigJson:null,privacy:{policyVersion:'iqc-schedule-read-v1',canonicalPayloadVisible:false}});mocks.get.mockRejectedValue(Error('read failed'));
   await click('保存草稿');expect(mocks.update).toHaveBeenCalledTimes(1);expect(mocks.success).toHaveBeenCalledWith('草稿已保存');
   expect(mocks.warning).toHaveBeenCalledWith('草稿已保存，但重新读取失败。请重新加载，勿重复提交。');expect(mocks.error).not.toHaveBeenCalled();expect(host.querySelectorAll('input')).toHaveLength(0);
  });
  it('ignores a publish confirmation accepted after navigation',async()=>{
   await mount();await click('发布修订');const confirmation=mocks.confirm.mock.calls[0][0];unmount();await confirmation.onOk();
   expect(mocks.publish).not.toHaveBeenCalled();
  });
  for(const outcome of ['resolve','reject'] as const){
   it(`discards the post-save reread ${outcome} after navigation`,async()=>{
    await mount();mocks.update.mockResolvedValue({...row,draftRevision:2,draftConfigJson:null,privacy:{policyVersion:'iqc-schedule-read-v1',canonicalPayloadVisible:false}});
    const pending=deferred();mocks.get.mockReturnValueOnce(pending.promise);await click('保存草稿');expect(mocks.get).toHaveBeenCalledTimes(1);
    unmount();resetEffects();if(outcome==='resolve')pending.resolve(row);else pending.reject(Error('late read failure'));await settle();
    expect(mocks.warning).not.toHaveBeenCalled();expect(mocks.error).not.toHaveBeenCalled();expect(mocks.versions).not.toHaveBeenCalled();expect(mocks.instances).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();
   });
  }
  for(const operation of ['save','publish','availability',...(kind==='periodic'?['preview']:[])] as const){
   for(const outcome of ['resolve','reject'] as const){
    it(`discards ${operation} ${outcome} after unmount without notification or follow-up reads`,async()=>{
     await mount();const pending=deferred();const api=operation==='save'?mocks.update:operation==='publish'?mocks.publish:operation==='availability'?mocks.availability:mocks.preview;
     api.mockReturnValueOnce(pending.promise);
     if(operation==='publish'){await click('发布修订');void mocks.confirm.mock.calls[0][0].onOk();await settle();}
     else await click(operation==='save'?'保存草稿':operation==='availability'?'启用':'预览计划 UTC');
     expect(api).toHaveBeenCalledTimes(1);unmount();
     if(outcome==='resolve')pending.resolve(operation==='preview'?['2026-10-20T00:00:00Z']:{...row,draftRevision:2});else pending.reject(Error('late failure'));
     await settle();
     expect(mocks.success).not.toHaveBeenCalled();expect(mocks.warning).not.toHaveBeenCalled();expect(mocks.error).not.toHaveBeenCalled();
     expect(mocks.get).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();expect(mocks.versions).not.toHaveBeenCalled();expect(mocks.instances).not.toHaveBeenCalled();
    });
   }
  }
 });
}
