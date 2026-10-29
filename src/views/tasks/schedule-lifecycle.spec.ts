import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createApp, defineComponent, h, nextTick, reactive, type App} from 'vue';
import Schedules from './schedules.vue';
import Subscriptions from './subscriptions.vue';

const mocks = vi.hoisted(() => ({
 pipelineList:vi.fn(),pipelineVersions:vi.fn(),list:vi.fn(), get:vi.fn(), create:vi.fn(), update:vi.fn(), publish:vi.fn(), availability:vi.fn(),
 versions:vi.fn(), instances:vi.fn(), preview:vi.fn(), success:vi.fn(), warning:vi.fn(), error:vi.fn(), confirm:vi.fn(),
}));
vi.mock('ant-design-vue',()=>({message:{success:mocks.success,warning:mocks.warning,error:mocks.error},Modal:{confirm:mocks.confirm}}));
const access=reactive({denied:[] as string[],pipelineAllowed:false});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(key:string)=>!access.denied.includes(key)&&(access.pipelineAllowed||!key.startsWith('iqc:pipeline:'))&&!key.includes('attempt')})}));
vi.mock('@/api/pipeline-policies',async original=>({...await original<any>(),listPipelines:mocks.pipelineList,listPipelineVersions:mocks.pipelineVersions}));
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
beforeEach(()=>{access.pipelineAllowed=false;access.denied=[];vi.resetAllMocks();mocks.pipelineList.mockResolvedValue({records:[],total:0});mocks.pipelineVersions.mockResolvedValue([]);mocks.list.mockResolvedValue({records:[],total:0});mocks.versions.mockResolvedValue([]);mocks.instances.mockResolvedValue({records:[],total:0});});
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
  it('directory revoke and restore clears loaded rows and discards a late response',async()=>{await mount();expect(vm().rows).toHaveLength(1);const slow=deferred();mocks.list.mockReturnValueOnce(slow.promise);const request=vm().refresh();access.denied=[`${prefix}:view`];expect(vm().rows).toEqual([]);expect(vm().total).toBe(0);access.denied=[];slow.resolve({records:[row],total:1});await request;expect(vm().rows).toEqual([]);expect(vm().loading).toBe(false);});
  it('history revoke and restore discards its late private snapshots',async()=>{await mount();const slow=deferred();mocks.versions.mockReturnValueOnce(slow.promise);const request=vm().details();access.denied=[`${prefix}:versions:view`];access.denied=[];slow.resolve([{snapshotJson:'private'}]);await request;expect(vm().history).toEqual([]);expect(mocks.instances).not.toHaveBeenCalled();});
  it('instances revoke and restore discards its late response and count',async()=>{await mount();const slow=deferred();mocks.instances.mockReturnValueOnce(slow.promise);const request=vm().details();await settle();access.denied=[`${prefix}:instances:view`];access.denied=[];slow.resolve({records:[{id:'private-task'}],total:1});await request;expect(vm().instances).toEqual([]);expect(vm().instanceTotal).toBe(0);});
  it('revoking instance access clears already loaded history and instances',async()=>{await mount();mocks.versions.mockResolvedValue([{snapshotJson:'private'}]);mocks.instances.mockResolvedValue({records:[{id:'task'}],total:1});await vm().details();access.denied=[`${prefix}:instances:view`];expect(vm().history).toEqual([]);expect(vm().instances).toEqual([]);expect(vm().instanceTotal).toBe(0);});
  it('history receipt cannot populate another selected asset or request its instances',async()=>{await mount();const slow=deferred();mocks.versions.mockReturnValueOnce(slow.promise);const request=vm().details();vm().selected={...row,id:'other'};slow.resolve([{snapshotJson:'private'}]);await request;expect(vm().history).toEqual([]);expect(mocks.instances).not.toHaveBeenCalled();});
  it('pipeline catalog revoke and restore discards its old response',async()=>{await mount();access.pipelineAllowed=true;const slow=deferred();mocks.pipelineList.mockReturnValueOnce(slow.promise);const request=vm().catalogs();access.denied=['iqc:pipeline:view'];access.denied=[];slow.resolve({records:[{id:'p1',status:'ACTIVE'}],total:1});await request;expect(vm().pipelines).toEqual([]);expect(vm().pipelineTotal).toBe(0);expect(vm().pipelineLoading).toBe(false);});
  it('pipeline version revoke and restore discards its late snapshot',async()=>{await mount();access.pipelineAllowed=true;const slow=deferred();mocks.pipelineVersions.mockReturnValueOnce(slow.promise);const request=vm().versionsForPipeline('p1');access.denied=['iqc:pipeline:versions:view'];access.denied=[];slow.resolve([{versionNo:1,snapshotJson:'private'}]);await request;expect(vm().pipelineVersions).toEqual([]);});
  it('sensitive revocation clears read lists while retaining the original frozen references',async()=>{await mount();vm().history=[{snapshotJson:'private'}];vm().instances=[{id:'task'}];vm().pipelines=[{id:'p1'}];vm().pipelineVersions=[{versionNo:1}];const before=JSON.stringify(vm().definition);access.denied=['iqc:sensitive:prompt:read'];expect(vm().history).toEqual([]);expect(vm().instances).toEqual([]);expect(vm().pipelines).toEqual([]);expect(vm().pipelineVersions).toEqual([]);expect(JSON.stringify(vm().definition)).toBe(before);});
  it('an unrelated grant update preserves unsaved edits and loaded read lists',async()=>{await mount();vm().name='Unsaved';vm().history=[{id:'v1'}];const before=JSON.stringify(vm().definition);access.denied=['unrelated:grant'];await settle();expect(vm().name).toBe('Unsaved');expect(vm().history).toEqual([{id:'v1'}]);expect(JSON.stringify(vm().definition)).toBe(before);});
  it('history and instance grants remain independent',async()=>{await mount();access.denied=[`${prefix}:instances:view`];mocks.versions.mockResolvedValue([{id:'v1'}]);await vm().details();expect(vm().history).toEqual([{id:'v1'}]);expect(mocks.instances).not.toHaveBeenCalled();mocks.versions.mockClear();access.denied=[`${prefix}:versions:view`];mocks.instances.mockResolvedValue({records:[{id:'task'}],total:1});await vm().details();expect(mocks.versions).not.toHaveBeenCalled();expect(vm().instances).toEqual([{id:'task'}]);});
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
