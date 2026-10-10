import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,ref,type App} from 'vue';
import ActionHistoryPanel from './ActionHistoryPanel.vue';
import {listActionHistory,reconcileAction} from '@/api/action-history';
const state=vi.hoisted(()=>({permissions:[] as string[]}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>state.permissions.includes(code)})}));
vi.mock('@/api/action-history',()=>({listActionHistory:vi.fn(),requestActionDiscovery:vi.fn(),reconcileAction:vi.fn()}));
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
 app.component('AModal',defineComponent({props:['open','confirmLoading'],setup:(p,ctx)=>()=>p.open?h('section',[ctx.slots.default?.(),h('button',{disabled:!!p.confirmLoading,onClick:()=> (ctx.attrs.onOk as ()=>void)()},'核对'),h('button',{onClick:()=> (ctx.attrs.onCancel as ()=>void)()},'取消')]):null}));
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
