import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,type App} from 'vue';
import Pipelines from './index.vue';
const mocks=vi.hoisted(()=>({create:vi.fn(),rollout:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn()}));
vi.mock('ant-design-vue',()=>({message:{success:mocks.success,error:mocks.error,warning:mocks.warning},Modal:{confirm:vi.fn()}}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:()=>true})}));
vi.mock('@/api/pipelines',async importOriginal=>({...await importOriginal<typeof import('@/api/pipelines')>(),listPipelines:vi.fn().mockResolvedValue({records:[],total:0}),createPipelineTask:mocks.create,createPipelineRolloutTask:mocks.rollout}));
vi.mock('@/components/PipelineRolloutPreview.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/PipelineReleaseEditor.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/ConversationPicker.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/SelectorEditor.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/SelectorAssetLibrary.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/ReviewTaskSelector.vue',()=>({default:{render:()=>null}}));
let app:App|undefined,host:HTMLDivElement;
async function settle(){for(let i=0;i<8;i++){await Promise.resolve();await nextTick();}}
function deferred(){let resolve!:(value:unknown)=>void,reject!:(error:Error)=>void;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function unmount(){app?.unmount();app=undefined;}
beforeEach(()=>vi.resetAllMocks());
afterEach(()=>{unmount();host?.remove();});
async function mount(kind:'ROLLOUT'|'PUBLISHED'){
 host=document.createElement('div');document.body.append(host);app=createApp(Pipelines);
 app.config.warnHandler=()=>{};
 const pass=defineComponent({setup:(_, {slots})=>()=>h('div',slots.default?.())});
 for(const name of ['AButton','AAlert','ATableColumn','APagination','ASpace','ADrawer','AForm','AFormItem','AInput','AInputNumber','ASelect','ACollapse','ACollapsePanel','ACard','ACheckbox','RouterLink'])app.component(name,pass);
 app.component('ATable',defineComponent({render:()=>null}));
 const vm=app.mount(host);await settle();
 // Drive the mounted component's command boundary; browser fixture covers real form controls.
 const state=(vm.$ as any).setupState;
 state.selected={id:'pipeline',draftRevision:1,status:'ACTIVE'};state.taskKind=kind;state.version=2;
 state.taskName='处理后会话';state.conversations=['conversation'];state.concurrency=2;
 return state;
}
for(const kind of ['ROLLOUT','PUBLISHED'] as const){
 for(const outcome of ['resolve','reject'] as const){
  it(`${kind} discards a ${outcome} after navigation`,async()=>{
   const state=await mount(kind),pending=deferred(),api=kind==='ROLLOUT'?mocks.rollout:mocks.create;
   api.mockReturnValueOnce(pending.promise);state.createTask();await settle();expect(api).toHaveBeenCalledTimes(1);
   unmount();if(outcome==='resolve')pending.resolve({id:'task',status:'SUCCEEDED'});else pending.reject(Error('late response'));await settle();
   expect(mocks.success).not.toHaveBeenCalled();expect(mocks.error).not.toHaveBeenCalled();
   expect(state.createdTask).toBeUndefined();expect(state.taskError).toBe('');
   await state.executeCommand();expect(api).toHaveBeenCalledTimes(1);
  });
 }
 it(`${kind} retries the frozen request and preserves the returned state`,async()=>{
  const state=await mount(kind),api=kind==='ROLLOUT'?mocks.rollout:mocks.create;
  api.mockRejectedValueOnce(Error('unconfirmed')).mockResolvedValueOnce({id:'original',status:'SUCCEEDED'});
  state.createTask();await settle();expect(state.taskError).toContain('原请求重试');
  const first=JSON.stringify(api.mock.calls[0]);state.taskName='changed';state.conversations=['other'];state.concurrency=7;
  await state.executeCommand();expect(JSON.stringify(api.mock.calls[1])).toBe(first);
  expect(state.createdTask.status).toBe('SUCCEEDED');expect(mocks.success).toHaveBeenCalledWith('已找到原任务，保留原执行状态');
 });
}
