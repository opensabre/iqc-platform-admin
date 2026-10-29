import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import Tasks from './index.vue';
const api=vi.hoisted(()=>({list:vi.fn(),get:vi.fn(),configuration:vi.fn(),run:vi.fn(),pause:vi.fn(),resume:vi.fn(),priority:vi.fn(),cancel:vi.fn(),remove:vi.fn(),agents:vi.fn(),rules:vi.fn(),sets:vi.fn(),conversations:vi.fn(),tree:vi.fn(),collections:vi.fn(),summary:vi.fn(),labels:vi.fn(),insights:vi.fn(),export:vi.fn(),confirm:vi.fn(),success:vi.fn()}));
vi.mock('ant-design-vue',()=>({message:{info:vi.fn(),success:api.success,error:vi.fn(),warning:vi.fn()},Modal:{confirm:api.confirm}}));
vi.mock('vue-router',()=>({useRouter:()=>({currentRoute:{value:{query:{}}},push:vi.fn()})}));
const access=reactive({codes:[] as string[]});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>access.codes.includes(code)})}));
vi.mock('@/api/tasks',async original=>({...await original<typeof import('@/api/tasks')>(),listTasks:api.list,getTask:api.get,getTaskConfiguration:api.configuration,runTask:api.run,pauseTask:api.pause,resumeTask:api.resume,changeTaskPriority:api.priority,cancelTask:api.cancel,deleteTask:api.remove}));
vi.mock('@/api/config',()=>({listAgents:api.agents,listRules:api.rules,listRuleSets:api.sets}));
vi.mock('@/api/conversations',()=>({listConversations:api.conversations}));
vi.mock('@/api/labels',async original=>({...await original<typeof import('@/api/labels')>(),getLabelTree:api.tree,listLabelCollections:api.collections}));
vi.mock('@/api/results',async original=>({...await original<typeof import('@/api/results')>(),getBatchResultSummary:api.summary,getTaskLabelResults:api.labels,getTaskLabelInsights:api.insights,exportTaskLabelResults:api.export}));
vi.mock('@/api/dictionaries',()=>({getCachedDictionaries:vi.fn().mockResolvedValue({})}));
let app:App|undefined,host:HTMLDivElement,vm:any;
const task={id:'task',taskType:'BATCH',status:'RUNNING',queuePriority:4};
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function pending(){let resolve!:(value:any)=>void;const promise=new Promise<any>(done=>resolve=done);return {promise,resolve};}
async function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(Tasks);app.config.warnHandler=()=>{};
 const pass=defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())});
 for(const name of ['AButton','AAlert','ASpace','AInput','ASelect','ASelectOption','APagination','ACard','AForm','AFormItem','ATag','RouterLink'])app.component(name,pass);
 for(const name of ['ATable','AModal','ADrawer'])app.component(name,defineComponent({render:()=>null}));
 app.mount(host);vm=(app as any)._instance.setupState;await settle();
}
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();access.codes=['iqc:task:view'];api.list.mockResolvedValue({records:[task],total:1});api.agents.mockResolvedValue([]);api.rules.mockResolvedValue([]);api.sets.mockResolvedValue([]);api.conversations.mockResolvedValue({records:[],total:0});api.tree.mockResolvedValue({categories:[],groups:[],labels:[]});api.collections.mockResolvedValue([]);api.get.mockResolvedValue(task);api.summary.mockResolvedValue({taskId:'task',conversationResults:[]});api.labels.mockResolvedValue([]);api.insights.mockResolvedValue(undefined);});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();vi.useRealTimers();vi.unstubAllGlobals();});
describe('task exact operation permissions and polling',()=>{
 it('task view alone does not request unrelated creation assets',async()=>{
  await mount();expect(api.list).toHaveBeenCalledOnce();for(const call of [api.agents,api.rules,api.sets,api.conversations,api.tree,api.collections])expect(call).not.toHaveBeenCalled();expect(vm.tasks).toEqual([task]);
 });
 it('rule view cannot substitute rule set view in optional reads',async()=>{
  access.codes.push('iqc:rule:view');await mount();expect(api.rules).toHaveBeenCalledOnce();expect(api.sets).not.toHaveBeenCalled();
 });
 it('execute does not authorize detail, pause, resume or priority',async()=>{
  access.codes.push('iqc:task:execute');await mount();await vm.showDetail('task');await vm.pause('task');await vm.resume('task');await vm.reprioritize(task,1);
  for(const call of [api.get,api.pause,api.resume,api.priority])expect(call).not.toHaveBeenCalled();await vm.run('task');expect(api.run).toHaveBeenCalledExactlyOnceWith('task');
 });
 it('ordinary resume uses its own permission without execute',async()=>{
  access.codes.push('iqc:task:resume');await mount();await vm.resume('task');expect(api.resume).toHaveBeenCalledExactlyOnceWith('task');expect(api.run).not.toHaveBeenCalled();
 });
 it('bulk resume additionally requires execute and pipeline task create',async()=>{
  access.codes.push('iqc:task:resume');api.list.mockResolvedValue({records:[{...task,taskType:'PIPELINE_BULK'}],total:1});await mount();await vm.resume('task');expect(api.resume).not.toHaveBeenCalled();
  access.codes.push('iqc:task:execute');await settle();await vm.resume('task');expect(api.resume).not.toHaveBeenCalled();access.codes.push('iqc:pipeline:task:create');await settle();await vm.resume('task');expect(api.resume).toHaveBeenCalledExactlyOnceWith('task');
 });
 for(const operation of ['cancel','delete'] as const){
  it(`rechecks ${operation} when an existing confirmation is accepted`,async()=>{
   access.codes.push(`iqc:task:${operation}`);await mount();if(operation==='cancel')vm.cancel('task');else vm.removeTask(task);expect(api.confirm).toHaveBeenCalledOnce();access.codes=['iqc:task:view'];await settle();await api.confirm.mock.calls[0][0].onOk();expect(operation==='cancel'?api.cancel:api.remove).not.toHaveBeenCalled();
  });
 }
 it('slow interval polling remains single flight and can continue after completion',async()=>{
  await mount();const slow=pending();api.list.mockReturnValueOnce(slow.promise);vi.advanceTimersByTime(3000);await settle();expect(api.list).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(9000);await settle();expect(api.list).toHaveBeenCalledTimes(2);slow.resolve({records:[{...task,queuePriority:9}],total:1});await settle();expect(vm.tasks[0].queuePriority).toBe(9);
  vi.advanceTimersByTime(3000);await settle();expect(api.list).toHaveBeenCalledTimes(3);
 });
 it('revoking view invalidates an in-flight poll and prevents further intervals',async()=>{
  await mount();const slow=pending();api.list.mockReturnValueOnce(slow.promise);vi.advanceTimersByTime(3000);await settle();access.codes=[];await settle();slow.resolve({records:[task],total:1});await settle();expect(vm.tasks).toEqual([]);
  vi.advanceTimersByTime(9000);await settle();expect(api.list).toHaveBeenCalledTimes(2);
 });
 it('refresh supersedes an older poll without resurrecting its rows',async()=>{
  await mount();const slow=pending();api.list.mockReturnValueOnce(slow.promise);vi.advanceTimersByTime(3000);await settle();api.list.mockResolvedValue({records:[{...task,queuePriority:7}],total:1});await vm.refresh();slow.resolve({records:[{...task,queuePriority:1}],total:1});await settle();expect(vm.tasks[0].queuePriority).toBe(7);
 });
 it('revoked detail permission discards a delayed task response',async()=>{
  access.codes.push('iqc:task:detail:view');await mount();const slow=pending();api.get.mockReturnValueOnce(slow.promise);const request=vm.showDetail('task');access.codes=['iqc:task:view'];await settle();slow.resolve(task);await request;expect(vm.detail).toBeUndefined();expect(vm.detailOpen).toBe(false);
 });
 it('summary alone does not request labels or insights or activate a labels deep link',async()=>{
  access.codes.push('iqc:result:summary:view');await mount();await vm.showResults('task',undefined,true);expect(api.summary).toHaveBeenCalledExactlyOnceWith('task');expect(api.labels).not.toHaveBeenCalled();expect(api.insights).not.toHaveBeenCalled();expect(vm.resultTab).toBe('inspection');expect(vm.resultOpen).toBe(true);
 });
 it('revoked result read discards a delayed summary response',async()=>{
  access.codes.push('iqc:result:summary:view');await mount();const slow=pending();api.summary.mockReturnValueOnce(slow.promise);const request=vm.showResults('task');access.codes=['iqc:task:view'];await settle();slow.resolve({taskId:'task',conversationResults:[]});await request;expect(vm.batchResult).toBeUndefined();expect(vm.resultOpen).toBe(false);
 });
 it('old result export does not authorize label export',async()=>{
  access.codes.push('iqc:result:summary:view','iqc:result:export');await mount();await vm.showResults('task');await vm.exportLabels();expect(api.export).not.toHaveBeenCalled();
 });
 for(const capability of ['labels','label-insights'] as const){
  it(`${capability} reads only its own optional result projection`,async()=>{
   access.codes.push('iqc:result:summary:view',`iqc:result:${capability}:view`);await mount();await vm.showResults('task');
   expect(capability==='labels'?api.labels:api.insights).toHaveBeenCalledExactlyOnceWith('task');expect(capability==='labels'?api.insights:api.labels).not.toHaveBeenCalled();
  });
 }
 it('frozen configuration requires Prompt permission and cannot return after its revocation',async()=>{
  access.codes.push('iqc:task:detail:view');await mount();await vm.showDetail('task');await vm.readConfiguration();expect(api.configuration).not.toHaveBeenCalled();
  access.codes.push('iqc:sensitive:prompt:read');await settle();await vm.showDetail('task');const slow=pending();api.configuration.mockReturnValueOnce(slow.promise);const request=vm.readConfiguration();expect(api.configuration).toHaveBeenCalledExactlyOnceWith('task');
  access.codes=['iqc:task:view','iqc:task:detail:view'];await settle();slow.resolve({...task,agentSnapshotJson:'private Prompt'});await request;expect(vm.detail).toBeUndefined();expect(vm.detailOpen).toBe(false);
 });
 it('label export revoked in flight cannot create a downloadable Blob URL',async()=>{
  const create=vi.fn();vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:create,revokeObjectURL:vi.fn()}));
  access.codes.push('iqc:result:summary:view','iqc:result:labels:export','iqc:sensitive:conversation:read','iqc:sensitive:pii:read');await mount();await vm.showResults('task');const slow=pending();api.export.mockReturnValueOnce(slow.promise);const request=vm.exportLabels();expect(api.export).toHaveBeenCalledExactlyOnceWith('task');
  access.codes=['iqc:task:view','iqc:result:summary:view'];await settle();slow.resolve({data:new Blob(['private labels'])});await request;expect(create).not.toHaveBeenCalled();
 });
 for(const missing of ['iqc:sensitive:conversation:read','iqc:sensitive:pii:read']){
  it(`label export requires ${missing} as well as its operation grant`,async()=>{
   access.codes.push(...['iqc:result:summary:view','iqc:result:labels:export','iqc:sensitive:conversation:read','iqc:sensitive:pii:read'].filter(code=>code!==missing));
   await mount();await vm.showResults('task');await vm.exportLabels();expect(api.export).not.toHaveBeenCalled();
  });
 }
 it('unmount discards a pending poll and clears its interval',async()=>{
  await mount();const slow=pending();api.list.mockReturnValueOnce(slow.promise);vi.advanceTimersByTime(3000);await settle();app!.unmount();app=undefined;
  slow.resolve({records:[{...task,queuePriority:99}],total:1});await settle();expect(vm.tasks[0].queuePriority).toBe(4);vi.advanceTimersByTime(9000);await settle();expect(api.list).toHaveBeenCalledTimes(2);
 });

});
