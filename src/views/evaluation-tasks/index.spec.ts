import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import type {EvaluationReport,InputCompletenessSummary} from '@/api/evaluation';
const api=vi.hoisted(()=>({report:vi.fn(),task:vi.fn(),rounds:vi.fn(),tasks:vi.fn()}));
const route=reactive({query:{taskId:'first' as string|undefined}}),grants=reactive({report:true,detail:true});
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('@/api/tasks',()=>({getTask:api.task,listTaskExecutions:api.rounds,listTasks:api.tasks}));
vi.mock('@/api/evaluation',()=>({getEvaluationReport:api.report,listDatasets:vi.fn(),listDatasetVersions:vi.fn(),createEvaluationTask:vi.fn(),listEvaluationResults:vi.fn(),getEvaluationResult:vi.fn()}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(key:string)=>(key==='iqc:evaluation:report:view'&&grants.report)||(key==='iqc:task:detail:view'&&grants.detail)})}));
vi.mock('ant-design-vue',()=>({message:{success:vi.fn(),error:vi.fn(),warning:vi.fn()},Modal:{confirm:vi.fn()}}));
vi.mock('@/components/BenchmarkReportPanel.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/ModelConsistencyPanel.vue',()=>({default:{render:()=>null}}));
vi.mock('@/components/CitationGroundingPanel.vue',()=>({default:{render:()=>null}}));
import View from './index.vue';
let app:App,host:HTMLDivElement;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
const measured:InputCompletenessSummary={schemaVersion:'iqc-input-completeness-report-v1',scope:'frozen',expectedSamples:3,measuredSamples:2,unmeasuredSamples:1,invalidManifestSamples:1,completeSamples:0,deficientSamples:1,excessSamples:1,expectedMessages:4,observedMessages:4,missingMessages:1,extraMessages:1,measurementCoverage:0.666667,completeConversationRate:0,declaredMessageCoverage:0.75};
function report(metrics:InputCompletenessSummary|null|undefined=measured):EvaluationReport{return {taskId:route.query.taskId??'first',executionId:'run',datasetHash:'hash',expectedSamples:3,availableSamples:0,successfulSamples:0,complete:false,missingSampleIds:[],sourceExecutionIds:{},findingMetrics:{aggregate:{counts:{},precision:null,recall:null,f1:null,coverage:null,valueAccuracy:null,stateAccuracy:null,evidenceAccuracy:null},byCode:{},unlabelledOutputs:0},businessMetrics:{},latencyMetrics:{scope:'compute',measuredSamples:0,p50Ms:null,p95Ms:null,p99Ms:null,executionFailureRate:null},inputCompletenessMetrics:metrics};}
function mount(){host=document.createElement('div');document.body.append(host);app=createApp(View);
 for(const name of ['ASpace','ASpin','ADescriptions'])app.component(name,defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())}));
 app.component('ACard',defineComponent({props:['title'],setup:(p,{slots})=>()=>h('section',{'data-title':p.title},slots.default?.())}));
 app.component('ADescriptionsItem',defineComponent({props:['label'],setup:(p,{slots})=>()=>h('div',{'data-label':p.label},slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 app.component('AButton',defineComponent({setup:(_,{slots,attrs})=>()=>h('button',attrs,slots.default?.())}));
 for(const name of ['ATable','ATableColumn','APagination','ASelect','AModal','ATag','AInput','AFormItem','ARadio','ARadioGroup','AInputNumber','AForm'])app.component(name,defineComponent({setup:()=>()=>null}));
 app.mount(host);}
function card(){return host.querySelector('[data-title="上游声明消息完整率"]');}
function value(label:string){return card()?.querySelector(`[data-label="${label}"]`)?.textContent;}
beforeEach(()=>{route.query.taskId='first';grants.report=true;grants.detail=true;api.tasks.mockResolvedValue({records:[],total:0});api.task.mockImplementation(async(id:string)=>({id,taskType:'PIPELINE_EVALUATION',currentExecutionId:'run'}));api.rounds.mockResolvedValue([]);api.report.mockResolvedValue(report());});
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();});
it('shows frozen input coverage even without execution artifacts and preserves excess counters',async()=>{mount();await settle();expect(api.report).toHaveBeenCalledWith('first','run');expect(value('测量覆盖')).toContain('66.67%');expect(value('声明消息覆盖')).toBe('75.00%');expect(value('已测量样本预期 / 冻结消息')).toBe('4 / 4');expect(value('不足会话 / 缺少消息')).toBe('1 / 1');expect(value('超出会话 / 多余消息')).toBe('1 / 1');});
it('uses unmeasured for null denominators and omits unsupported historical metrics',async()=>{api.report.mockResolvedValue(report({...measured,measuredSamples:0,measurementCoverage:0,completeConversationRate:null,declaredMessageCoverage:null}));mount();await settle();expect(value('测量覆盖')).toContain('0.00%');expect(value('声明消息覆盖')).toBe('未测量');expect(value('数量完整会话率')).toContain('未测量');api.report.mockResolvedValue(report(null));route.query.taskId='legacy';await settle();expect(card()).toBeNull();});
it('clears the old card while switching task and ignores its late response',async()=>{let resolve!:(r:EvaluationReport)=>void;api.report.mockReturnValueOnce(new Promise(r=>{resolve=r;}));mount();await settle();api.report.mockResolvedValue(report({...measured,declaredMessageCoverage:0.25}));route.query.taskId='second';await settle();expect(value('声明消息覆盖')).toBe('25.00%');resolve(report());await settle();expect(value('声明消息覆盖')).toBe('25.00%');});
it('does not restore an in-flight report after permission is revoked then granted',async()=>{let resolve!:(r:EvaluationReport)=>void;api.report.mockReturnValueOnce(new Promise(r=>{resolve=r;}));mount();await settle();grants.report=false;await settle();grants.report=true;await settle();resolve(report());await settle();expect(card()).toBeNull();});
it('clears an already displayed report on revocation and requires an authorized refresh after regrant',async()=>{mount();await settle();expect(card()).not.toBeNull();grants.report=false;await settle();expect(card()).toBeNull();grants.report=true;await settle();expect(card()).toBeNull();expect(api.report).toHaveBeenCalledTimes(1);});

it('report permission alone cannot read task details or issue a report request',async()=>{grants.detail=false;mount();await settle();expect(api.task).not.toHaveBeenCalled();expect(api.report).not.toHaveBeenCalled();expect(card()).toBeNull();});
it('current execution report does not require execution history permission',async()=>{mount();await settle();expect(api.task).toHaveBeenCalledWith('first');expect(api.rounds).not.toHaveBeenCalled();expect(api.report).toHaveBeenCalledWith('first','run');});
