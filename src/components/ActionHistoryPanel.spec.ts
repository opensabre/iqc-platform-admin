import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,ref,type App} from 'vue';
import ActionHistoryPanel from './ActionHistoryPanel.vue';
import {listActionHistory,reconcileAction,recoverAction} from '@/api/action-history';
const state=vi.hoisted(()=>({permissions:[] as string[]}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>state.permissions.includes(code)})}));
vi.mock('@/api/action-history',()=>({listActionHistory:vi.fn(),requestActionDiscovery:vi.fn(),reconcileAction:vi.fn(),recoverAction:vi.fn()}));
let app:App,host:HTMLDivElement;
const observed={id:'action-1',version:3,actionId:'review',type:'CREATE_REVIEW',status:'REQUIRES_RECONCILIATION',outcome:'UNKNOWN',attemptCount:1,nextAttemptAtUtc:null,claimedAtUtc:null,settledAtUtc:null,evidenceReference:null,resultReference:null,errorCode:'WORKER_CONFIRMATION_LOST'};
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function button(text:string){return [...host.querySelectorAll('button')].find(b=>b.textContent===text)!;}
function mount(){
 const result=ref('result-1');host=document.createElement('div');document.body.append(host);
 app=createApp(defineComponent({setup:()=>()=>h(ActionHistoryPanel,{resultId:result.value})}));
 app.component('ASpace',defineComponent({setup:(_,ctx)=>()=>h('div',ctx.slots.default?.())}));
 app.component('AButton',defineComponent({setup:(_,ctx)=>()=>h('button',ctx.attrs,ctx.slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',String(p.message))}));
 app.component('ATable',defineComponent({props:['dataSource'],setup:(p,ctx)=>()=>h('div',(p.dataSource as typeof observed[]).map(record=>h('div',[h('span',record.status),ctx.slots.bodyCell?.({column:{key:'operation'},record})])))}));
 app.component('AModal',defineComponent({props:['open','confirmLoading','okText'],setup:(p,ctx)=>()=>p.open?h('section',[ctx.slots.default?.(),h('button',{disabled:!!p.confirmLoading,onClick:()=> (ctx.attrs.onOk as ()=>void)()},String(p.okText||'核对')),h('button',{onClick:()=> (ctx.attrs.onCancel as ()=>void)()},'取消')]):null}));
 app.component('ATextarea',defineComponent({props:['value','disabled'],setup:(p,ctx)=>()=>h('textarea',{value:p.value,disabled:!!p.disabled,onInput:(e:Event)=>(ctx.attrs['onUpdate:value'] as (s:string)=>void)((e.target as HTMLTextAreaElement).value)})}));
 app.mount(host);return result;
}
async function open(){button('核对实际产物').click();await settle();}
async function reason(){const input=host.querySelector('textarea')!;input.value='确认原始复核产物';input.dispatchEvent(new Event('input'));await settle();}
describe('manual action reconciliation',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.permissions=reactive(['iqc:action:history:view','iqc:action:reconcile']);vi.mocked(listActionHistory).mockResolvedValue([{...observed}]);});
 afterEach(()=>{app?.unmount();host?.remove();});
 it('requires history and operation permission',async()=>{state.permissions.splice(1);mount();await settle();expect(button('核对实际产物')).toBeUndefined();expect(listActionHistory).toHaveBeenCalledOnce();});
 it('does not load records without history permission',async()=>{state.permissions.splice(0,1);mount();await settle();expect(listActionHistory).not.toHaveBeenCalled();expect(reconcileAction).not.toHaveBeenCalled();});
 it('keeps old-backend records readable without offering an unversioned operation',async()=>{vi.mocked(listActionHistory).mockResolvedValue([{...observed,version:undefined}]);mount();await settle();expect(host.textContent).toContain('REQUIRES_RECONCILIATION');expect(button('核对实际产物')).toBeUndefined();});
 it('does not offer unsupported remote or unsafe numeric versions',async()=>{vi.mocked(listActionHistory).mockResolvedValue([{...observed,type:'WEBHOOK'},{...observed,id:'large-version',version:Number.MAX_SAFE_INTEGER+1}]);mount();await settle();expect(button('核对实际产物')).toBeUndefined();});
 it('requires an audit reason and sends only the observed version and reason once',async()=>{
  let finish!:(data:unknown)=>void;vi.mocked(reconcileAction).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}) as never);
  mount();await settle();await open();button('核对').click();await settle();expect(reconcileAction).not.toHaveBeenCalled();expect(host.textContent).toContain('请填写');
  await reason();button('核对').click();button('核对').click();await settle();
  expect(reconcileAction).toHaveBeenCalledExactlyOnceWith('result-1','action-1',3,'确认原始复核产物');
  finish({id:'action-1',state:'UNCONFIRMED'});await settle();expect(host.textContent).toContain('继续等待核对');expect(host.textContent).toContain('REQUIRES_RECONCILIATION');
 });
 it('refreshes actual history after confirmation rather than fabricating a completed row',async()=>{
  vi.mocked(reconcileAction).mockResolvedValue({id:'action-1',state:'CONFIRMED'});
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce([{...observed,status:'COMPLETE',outcome:'CONFIRMED_SUCCESS',version:4}]);
  mount();await settle();await open();await reason();button('核对').click();await settle();expect(host.textContent).toContain('动作已完成');expect(host.textContent).toContain('COMPLETE');expect(listActionHistory).toHaveBeenCalledTimes(2);
 });
 it('discards an old-result response after the result changes',async()=>{
  let finish!:(data:unknown)=>void;vi.mocked(reconcileAction).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}) as never);
  const result=mount();await settle();await open();await reason();button('核对').click();await settle();result.value='result-2';await settle();
  finish({id:'action-1',state:'CONFIRMED'});await settle();expect(host.textContent).not.toContain('动作已完成');expect(host.querySelector('textarea')).toBeNull();expect(listActionHistory).toHaveBeenCalledTimes(2);
 });
 it('closes and discards pending response when operation permission is revoked',async()=>{
  let finish!:(data:unknown)=>void;vi.mocked(reconcileAction).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}) as never);
  mount();await settle();await open();await reason();button('核对').click();await settle();state.permissions.splice(1);await settle();finish({id:'action-1',state:'CONFIRMED'});await settle();
  expect(button('核对实际产物')).toBeUndefined();expect(host.querySelector('textarea')).toBeNull();expect(host.textContent).not.toContain('动作已完成');
 });
 it('does not accept a receipt for another action',async()=>{
  vi.mocked(reconcileAction).mockResolvedValue({id:'foreign',state:'CONFIRMED'});mount();await settle();await open();await reason();button('核对').click();await settle();
  expect(host.textContent).toContain('核对请求未确认');expect(host.textContent).not.toContain('动作已完成');expect(host.querySelector('textarea')).not.toBeNull();
 });
});

function journalEvent(version:string,previousVersion:string|null){
 const state={status:'COMPLETE',attemptCount:2,claimedAtUtc:null,settledAtUtc:null,nextAttemptAtUtc:null,outcome:'CONFIRMED_SUCCESS',evidenceReference:'actual proof',resultReference:'artifact',errorCode:null};
 return {version,previousVersion,previousState:previousVersion===null?null:{...state,status:'WAITING_RETRY',outcome:'CONFIRMED_RETRYABLE_FAILURE'},state,actor:'alice',recordedAtUtc:'2026-10-11T01:00:00',reconciliationReason:null as string|null|undefined};
}
function journalPage(events:ReturnType<typeof journalEvent>[],nextBeforeVersion:string|null=null,earlierHistoryUnavailable=false){return [{...observed,history:{events,nextBeforeVersion,earlierHistoryUnavailable}}];}
describe('durable action history',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.permissions=reactive(['iqc:action:history:view']);vi.mocked(listActionHistory).mockResolvedValue([{...observed}]);});
 afterEach(()=>{app?.unmount();host?.remove();});
 it('reads history with the existing view permission and shows actual references and an upgrade gap',async()=>{
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce(journalPage([journalEvent('3','2')],null,true));
  mount();await settle();button('查看历史').click();await settle();
  expect(listActionHistory).toHaveBeenLastCalledWith('result-1',{actionExecutionId:'action-1',includeHistory:true});
  expect(host.textContent).toContain('actual proof');expect(host.textContent).toContain('较早的动作历史未保留');expect(button('核对实际产物')).toBeUndefined();
 });
 it('uses the exact string cursor once and appends earlier events',async()=>{
  const events=Array.from({length:50},(_,i)=>journalEvent((9223372036854775806n-BigInt(i)).toString(),(9223372036854775805n-BigInt(i)).toString()));
  let finish!:(data:unknown)=>void;
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce(journalPage(events,events.at(-1)!.version)).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  mount();await settle();button('查看历史').click();await settle();button('加载更早记录').click();button('加载更早记录').click();await settle();
  expect(listActionHistory).toHaveBeenCalledTimes(3);expect(listActionHistory).toHaveBeenLastCalledWith('result-1',{actionExecutionId:'action-1',includeHistory:true,beforeVersion:events.at(-1)!.version});
  finish(journalPage([journalEvent('0',null)]));await settle();expect(host.querySelectorAll('.journal-events li')).toHaveLength(51);expect(button('加载更早记录')).toBeUndefined();
 });
 it('discards pending old-result and revoked-permission history responses',async()=>{
  let finish!:(data:unknown)=>void;
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  const result=mount();await settle();button('查看历史').click();await settle();result.value='result-2';await settle();
  finish(journalPage([journalEvent('3','2')]));await settle();expect(host.querySelector('.journal-events')).toBeNull();expect(host.textContent).not.toContain('actual proof');
  vi.mocked(listActionHistory).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  button('查看历史').click();await settle();state.permissions.splice(0);await settle();finish(journalPage([journalEvent('3','2')]));await settle();expect(host.textContent).not.toContain('actual proof');
 });
 it('rejects another action or an invalid pagination boundary',async()=>{
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce([{...journalPage([journalEvent('3','2')])[0],id:'foreign'}]);
  mount();await settle();button('查看历史').click();await settle();expect(host.textContent).toContain('动作历史加载失败');expect(host.textContent).not.toContain('actual proof');
  vi.mocked(listActionHistory).mockResolvedValueOnce(journalPage([journalEvent('3','2')],'4'));
  button('重试加载').click();await settle();expect(host.querySelectorAll('.journal-events li')).toHaveLength(0);
 });
 it('renders evidence as text and does not fabricate history for an older backend',async()=>{
  const event=journalEvent('0',null);event.state.evidenceReference='<img src=x onerror=alert(1)>';event.reconciliationReason='<b>人工核对</b>';
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce(journalPage([event]));
  mount();await settle();button('查看历史').click();await settle();expect(host.textContent).toContain('<img src=x onerror=alert(1)>');expect(host.querySelector('img')).toBeNull();expect(host.textContent).toContain('核对原因：<b>人工核对</b>');expect(host.querySelector('.journal-events b')).toBeNull();
  button('关闭历史').click();await settle();button('查看历史').click();await settle();expect(host.textContent).toContain('动作历史加载失败');expect(host.querySelectorAll('.journal-events li')).toHaveLength(0);
 });
});

function observation(id:string,state='STARTED') {
 return {id,observedVersion:'9223372036854775806',actor:'alice',reason:'<b>核对原因</b>',state,
  startedAtUtc:'2026-10-11T00:00:00',finishedAtUtc:state==='STARTED'?null:'2026-10-11T00:01:00',
  confirmedVersion:state==='CONFIRMED'?'9223372036854775807':null};
}
function observationPage(attempts:ReturnType<typeof observation>[],nextBeforeAttempt:string|null=null) {
 return [{...observed,attempts:{attempts,nextBeforeAttempt}}] as never;
}
describe('manual observation history',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.permissions=reactive(['iqc:action:history:view']);vi.mocked(listActionHistory).mockResolvedValue([{...observed}]);});
 afterEach(()=>{app?.unmount();host?.remove();});
 it('shows unresolved observations and escaped reasons with view permission only',async()=>{
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce(observationPage([observation('a'.repeat(32))]));
  mount();await settle();button('查看核对尝试').click();await settle();
  expect(listActionHistory).toHaveBeenLastCalledWith('result-1',{actionExecutionId:'action-1',includeAttempts:true});
  expect(host.textContent).toContain('核对结果尚未持久确认');expect(host.textContent).toContain('<b>核对原因</b>');
  expect(host.querySelector('.observation-events b')).toBeNull();expect(host.textContent).toContain('9223372036854775806');
 });
 it('paginates repeated observations at one timestamp without duplicate requests',async()=>{
  const attempts=Array.from({length:50},(_,i)=>observation((100-i).toString(16).padStart(32,'0'),'UNCONFIRMED'));
  const cursor='2026-10-11T00:00:00.000~'+attempts.at(-1)!.id;
  let finish!:(data:unknown)=>void;
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce(observationPage(attempts,cursor)).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  mount();await settle();button('查看核对尝试').click();await settle();button('加载更早核对').click();button('加载更早核对').click();await settle();
  expect(listActionHistory).toHaveBeenCalledTimes(3);expect(listActionHistory).toHaveBeenLastCalledWith('result-1',{actionExecutionId:'action-1',includeAttempts:true,beforeAttempt:cursor});
  finish(observationPage([observation('0'.repeat(31)+'1','CONFIRMED')]));await settle();
  expect(host.querySelectorAll('.observation-events li')).toHaveLength(51);expect(button('加载更早核对')).toBeUndefined();
  expect(host.textContent).toContain('确认版本：9223372036854775807');
 });
 it('discards old-result and closed observation responses',async()=>{
  let finish!:(data:unknown)=>void;
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  const result=mount();await settle();button('查看核对尝试').click();await settle();result.value='result-2';await settle();
  finish(observationPage([observation('a'.repeat(32))]));await settle();expect(host.querySelectorAll('.observation-events li')).toHaveLength(0);
 });
 it('discards pending observations when history permission is revoked',async()=>{
  let finish!:(data:unknown)=>void;
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}) as never);
  mount();await settle();button('查看核对尝试').click();await settle();state.permissions.splice(0);await settle();
  finish(observationPage([observation('a'.repeat(32))]));await settle();expect(host.textContent).not.toContain('<b>核对原因</b>');
 });
 it('rejects invalid terminal metadata and missing old-backend pages',async()=>{
  const invalid=observation('a'.repeat(32));invalid.confirmedVersion='4';
  vi.mocked(listActionHistory).mockResolvedValueOnce([{...observed}]).mockResolvedValueOnce(observationPage([invalid])).mockResolvedValueOnce([{...observed}]);
  mount();await settle();button('查看核对尝试').click();await settle();expect(host.textContent).toContain('核对尝试加载失败');
  expect(host.querySelectorAll('.observation-events li')).toHaveLength(0);button('重试核对记录').click();await settle();expect(host.textContent).toContain('核对尝试加载失败');
 });
});

const blocked={...observed,status:'BLOCKED_ADAPTER',outcome:null,attemptCount:0,version:0};
describe('blocked action recovery',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.permissions=reactive(['iqc:action:history:view','iqc:action:recover']);vi.mocked(listActionHistory).mockResolvedValue([{...blocked}]);});
 afterEach(()=>{app?.unmount();host?.remove();});
 it('requires the dedicated grant and excludes unknown or unsafe versions',async()=>{
  vi.mocked(listActionHistory).mockResolvedValue([{...blocked,outcome:'UNKNOWN',attemptCount:1},{...blocked,id:'unsafe',version:Number.MAX_SAFE_INTEGER+1}]);mount();await settle();expect(button('恢复阻塞动作')).toBeUndefined();expect(recoverAction).not.toHaveBeenCalled();
 });
 it('validates the reason and submits the observed version once then reads actual state',async()=>{
  let finish!:(data:unknown)=>void;vi.mocked(recoverAction).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}) as never);
  mount();await settle();button('恢复阻塞动作').click();await settle();button('恢复').click();await settle();expect(recoverAction).not.toHaveBeenCalled();await reason();button('恢复').click();button('恢复').click();await settle();
  expect(recoverAction).toHaveBeenCalledExactlyOnceWith('result-1','action-1',0,'确认原始复核产物');
  vi.mocked(listActionHistory).mockResolvedValue([{...blocked,status:'PENDING',version:1}]);finish({id:'action-1',state:'RECOVERED'});await settle();expect(host.textContent).toContain('已恢复等待检查');expect(host.textContent).toContain('PENDING');expect(reconcileAction).not.toHaveBeenCalled();
 });
 it('discards pending success when recovery permission is revoked',async()=>{
  let finish!:(data:unknown)=>void;vi.mocked(recoverAction).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}) as never);
  mount();await settle();button('恢复阻塞动作').click();await settle();await reason();button('恢复').click();await settle();state.permissions.splice(1);await settle();finish({id:'action-1',state:'RECOVERED'});await settle();expect(host.querySelector('textarea')).toBeNull();expect(host.textContent).not.toContain('已恢复等待检查');
 });
 it('refresh invalidates an open observation before it can be submitted',async()=>{
  mount();await settle();button('恢复阻塞动作').click();await settle();button('刷新').click();await settle();expect(host.querySelector('textarea')).toBeNull();expect(recoverAction).not.toHaveBeenCalled();
 });
 it('does not accept a response for another action',async()=>{
  vi.mocked(recoverAction).mockResolvedValue({id:'foreign',state:'RECOVERED'});mount();await settle();button('恢复阻塞动作').click();await settle();await reason();button('恢复').click();await settle();expect(host.textContent).toContain('恢复请求未确认');expect(host.textContent).not.toContain('已恢复等待检查');
 });
});
