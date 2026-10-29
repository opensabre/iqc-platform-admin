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
  function confirmation(action:'close'|'reload'){vm().name='Edited';vm()[action]();return mocks.confirm.mock.calls.at(-1)![0];}
  for(const action of ['close','reload'] as const){
   for(const field of ['name','code','definition'] as const)it(`old ${action} confirmation cannot discard later ${field} edits`,async()=>{await mount();const captured=confirmation(action);if(field==='definition')vm().definition.concurrency=3;else vm()[field]='Later';await captured.onOk();expect(vm().open).toBe(true);expect(vm().selected.id).toBe('a1');expect(mocks.get).not.toHaveBeenCalled();if(field==='definition')expect(vm().definition.concurrency).toBe(3);else expect(vm()[field]).toBe('Later');});
   it(`old ${action} confirmation remains invalid when edited value is restored`,async()=>{await mount();const captured=confirmation(action);vm().name='Temporary';vm().name='Edited';await captured.onOk();expect(vm().open).toBe(true);expect(vm().name).toBe('Edited');expect(mocks.get).not.toHaveBeenCalled();});
   it(`old ${action} confirmation cannot act on a new editor`,async()=>{await mount();const captured=confirmation(action);vm().create();vm().name='New editor';await captured.onOk();expect(vm().open).toBe(true);expect(vm().selected).toBeUndefined();expect(vm().name).toBe('New editor');expect(mocks.get).not.toHaveBeenCalled();});
   it(`old ${action} confirmation remains invalid after detail revoke and restore`,async()=>{await mount();const captured=confirmation(action);access.denied=[`${prefix}:detail:view`];access.denied=[];await vm().load(row);vm().name='Newly authorized edit';mocks.get.mockClear();await captured.onOk();expect(vm().open).toBe(true);expect(vm().name).toBe('Newly authorized edit');expect(mocks.get).not.toHaveBeenCalled();});
   it(`a valid ${action} confirmation retains its normal behavior`,async()=>{await mount();const captured=confirmation(action);await captured.onOk();if(action==='close'){expect(vm().open).toBe(false);expect(vm().selected).toBeUndefined();expect(mocks.get).not.toHaveBeenCalled();}else{expect(mocks.get).toHaveBeenCalledExactlyOnceWith('a1');expect(vm().name).toBe('会话质检');expect(vm().open).toBe(true);}});
  }
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
