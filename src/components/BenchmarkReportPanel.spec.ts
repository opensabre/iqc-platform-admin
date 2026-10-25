import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import Panel from './BenchmarkReportPanel.vue';
import {getBenchmark,getBenchmarkReport,type BenchmarkPair,type BenchmarkReport} from '@/api/benchmarks';
import type {EvaluationReport} from '@/api/evaluation';
import {listTaskExecutions} from '@/api/tasks';
const state=vi.hoisted(()=>({permissions:{usage:true,report:true}}));
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>code==='iqc:task:model-calls:view'?state.permissions.usage:state.permissions.report})}));
vi.mock('vue-router',()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock('@/api/benchmarks',()=>({getBenchmark:vi.fn(),getBenchmarkReport:vi.fn()}));
vi.mock('@/api/tasks',()=>({listTaskExecutions:vi.fn()}));
const pair={schemaVersion:'pair',experimentId:'experiment',name:'pair',datasetId:'d',datasetVersion:1,datasetHash:'hash',selection:{dimension:'MODEL'},comparison:{},
 baseline:{id:'b',name:'baseline',status:'SUCCEEDED',currentExecutionId:'e1'},candidate:{id:'c',name:'candidate',status:'SUCCEEDED',currentExecutionId:'e1'}} as BenchmarkPair;
function report():BenchmarkReport {
 const metrics:EvaluationReport={taskId:'task',executionId:'e1',datasetHash:'hash',expectedSamples:2,availableSamples:1,successfulSamples:1,complete:false,missingSampleIds:['missing'],sourceExecutionIds:{sample:'e1'},findingMetrics:{aggregate:{counts:{},precision:null,recall:null,f1:null,coverage:null,valueAccuracy:null,stateAccuracy:null,evidenceAccuracy:null},byCode:{},unlabelledOutputs:0},businessMetrics:{},latencyMetrics:{scope:'samples',measuredSamples:0,p50Ms:null,p95Ms:null,p99Ms:null,executionFailureRate:null}};
 const side={expectedSamples:2,boundSamples:1,unboundSamples:1,recorded:{costs:{callCount:'8',knownCount:'0',unknownCount:'8',currencies:[]},latency:{callCount:'8',measuredCount:'0',unknownCount:'8',averageMillis:null},
 tokens:{callCount:'8',input:{knownCount:'3',unknownCount:'5',knownSubtotal:'18446744073709551615'},output:{knownCount:'1',unknownCount:'7',knownSubtotal:'0'},total:{knownCount:'0',unknownCount:'8',knownSubtotal:null}}}};
 return {schemaVersion:'report',experiment:pair,baseline:metrics,candidate:metrics,complete:false,deltas:{},modelUsage:{schemaVersion:'iqc-benchmark-model-usage-v1',scope:'RECORDED_CALLS_OF_VALIDATED_SAMPLE_SOURCE_RUNS',baseline:side,candidate:side}};
}
let app:App,host:HTMLDivElement;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
function button(text:string){return [...host.querySelectorAll('button')].find(value=>value.textContent===text)!;}
async function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(Panel,{baselineTaskId:'b'});
 const pass=defineComponent({setup(_,{slots,attrs}){return()=>h('div',[attrs.message as string,slots.default?.()]);}});
 for(const name of ['ACard','AAlert','ARow','ACol','ADescriptions','ADescriptionsItem','ATableColumn'])app.component(name,pass);
 app.component('AButton',defineComponent({setup(_,{slots,attrs}){return()=>h('button',attrs,slots.default?.());}}));
 app.component('ASelect',defineComponent({props:['value','options'],emits:['update:value','change'],setup(props,{emit}){return()=>h('select',{value:props.value,onChange:(event:Event)=>{const value=(event.target as HTMLSelectElement).value;emit('update:value',value);emit('change',value);}},props.options.map((option:{value:string})=>h('option',{value:option.value},option.value)));}}));
 app.component('ACheckbox',defineComponent({props:['checked'],emits:['update:checked','change'],setup(props,{emit,slots}){return()=>h('label',[h('input',{type:'checkbox',checked:props.checked,onChange:(event:Event)=>{emit('update:checked',(event.target as HTMLInputElement).checked);emit('change');}}),slots.default?.()]);}}));
 app.component('ATable',defineComponent({props:['dataSource'],setup(props){return()=>h('div',{class:'table-data'},JSON.stringify(props.dataSource));}}));
 app.mount(host);await settle();
}
async function enableUsage(){const input=host.querySelector<HTMLInputElement>('input')!;input.checked=true;input.dispatchEvent(new Event('change'));await settle();}
beforeEach(()=>{vi.clearAllMocks();state.permissions=reactive({usage:true,report:true});vi.mocked(getBenchmark).mockResolvedValue(pair);vi.mocked(listTaskExecutions).mockResolvedValue([{id:'e1'},{id:'e2'}] as never);vi.mocked(getBenchmarkReport).mockResolvedValue(report());});
afterEach(()=>{app?.unmount();host?.remove();});
it('preserves large token strings and clears usage when changing execution rounds',async()=>{
 await mount();await enableUsage();button('比较所选轮次').click();await settle();
 expect(getBenchmarkReport).toHaveBeenLastCalledWith('b','e1','e1',true);
 expect(host.querySelectorAll('.table-data')[2]?.textContent).toContain('18446744073709551615');
 expect(host.textContent).toContain('供应商已报告 Token');
 const select=host.querySelector('select')!;select.value='e2';select.dispatchEvent(new Event('change'));await settle();
 expect(host.textContent).not.toContain('18446744073709551615');
});
it('ignores late usage responses after model usage permission is revoked',async()=>{
 let resolve!:(value:BenchmarkReport)=>void;vi.mocked(getBenchmarkReport).mockReturnValue(new Promise(done=>{resolve=done;}));
 await mount();await enableUsage();button('比较所选轮次').click();await settle();state.permissions.usage=false;await settle();resolve(report());await settle();
 expect(host.textContent).not.toContain('18446744073709551615');expect(host.querySelector('input')).toBeNull();
});
it('removes loaded report details when report permission is revoked',async()=>{
 await mount();await enableUsage();button('比较所选轮次').click();await settle();expect(host.textContent).toContain('18446744073709551615');
 state.permissions.report=false;await settle();expect(host.textContent).not.toContain('18446744073709551615');
 expect(button('比较所选轮次')).toBeUndefined();
});

it('ignores late report responses after report permission is revoked',async()=>{
 let resolve!:(value:BenchmarkReport)=>void;vi.mocked(getBenchmarkReport).mockReturnValue(new Promise(done=>{resolve=done;}));
 await mount();await enableUsage();button('比较所选轮次').click();await settle();state.permissions.report=false;await settle();resolve(report());await settle();
 expect(host.textContent).not.toContain('18446744073709551615');
 expect(host.textContent).not.toContain('双侧完整报告、缺失样本与原执行来源');
});
