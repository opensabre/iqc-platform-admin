import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import type {ModelMonitoringHistory} from '@/api/model-gateway';
const api=vi.hoisted(()=>({history:vi.fn(),source:vi.fn()}));
vi.mock('@/api/model-gateway',()=>({getModelMonitoringHistory:api.history,getModelMonitoringSource:api.source}));
const permissions=reactive({view:true,status:true});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>code.endsWith(':status:view')?permissions.status:permissions.view})}));
vi.mock('./ECharts.vue',()=>({default:{props:['options'],setup:(p:{options:unknown})=>()=>h('pre',{class:'chart'},JSON.stringify(p.options))}}));
import Panel from './ModelMonitoring.vue';
const base=['invocationTps','unknownRatio','p50','p95','p99','reportedTokens','usageCoverage','admission','settlement'];
const nodes=['pipelineTps','pipelineP95','pipelineActive','nodeAttemptTps','nodeSuccessRatio','nodeP95','nodeSkippedTps','nodeExecutorActive','nodeExecutorQueued'];
const tasks=['taskStates','taskCompletionTps','unmeasuredExecutions','taskMetricsHealth','taskMetricsAge'];
const start='2026-10-26T00:00:00Z',end='2026-10-26T00:01:00Z',timestamp=Date.parse(start)/1000;
function matrix(values:Array<[number,string]>=[[timestamp,'1']],metric:Record<string,string>={}){return JSON.stringify({status:'success',data:{resultType:'matrix',result:[{metric,values}]}});}
function report(size=24):ModelMonitoringHistory{
 const keys=[...base,...(size>=18?nodes:[]),...(size>=23?tasks:[]),...([10,19,24].includes(size)?['activeModelCalls']:[])];
 return {range:'1h',start,end,stepSeconds:30,series:Object.fromEntries(keys.map(key=>[key,matrix()]))};
}
let app:App|undefined,host:HTMLDivElement;
async function settle(){for(let i=0;i<5;i++){await Promise.resolve();await nextTick();}}
function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(Panel);
 for(const name of ['ASpace','ASpin'])app.component(name,defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())}));
 app.component('ACard',defineComponent({props:['title'],setup:(p,{slots})=>()=>h('article',[h('h4',p.title),slots.default?.()])}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));
 app.component('AEmpty',defineComponent({props:['description'],setup:p=>()=>h('p',{class:'empty'},p.description)}));
 app.component('AButton',defineComponent({props:['disabled'],setup:(p,{slots,attrs})=>()=>h('button',{...attrs,disabled:p.disabled},slots.default?.())}));
 app.component('ASelect',defineComponent({props:['value','options'],emits:['update:value'],setup:(p,{emit})=>()=>h('select',{value:p.value,onChange:(e:Event)=>emit('update:value',(e.target as HTMLSelectElement).value)},p.options.map((o:{value:string;label:string})=>h('option',{value:o.value},o.label)))}));
 app.mount(host);
}
beforeEach(()=>{permissions.view=true;permissions.status=true;api.history.mockResolvedValue(report());api.source.mockResolvedValue({available:true,targets:JSON.stringify({status:'success',data:{resultType:'vector',result:[{value:[timestamp,'1']}]}})});});
afterEach(()=>{app?.unmount();app=undefined;host?.remove();vi.resetAllMocks();});
it.each([[9,7],[10,8],[18,14],[19,15],[23,19],[24,20]])('renders complete %i-series protocol as %i charts',async(size,count)=>{
 api.history.mockResolvedValue(report(size));mount();await settle();
 expect(host.querySelectorAll('.chart')).toHaveLength(count);
 expect(host.textContent).not.toContain('读取或解析失败');
 expect(host.textContent?.includes('尚未提供模型调用在途指标')).toBe(![10,19,24].includes(size));
});
it('does not query without current view permission',async()=>{
 permissions.view=false;mount();await settle();expect(api.history).not.toHaveBeenCalled();expect(api.source).not.toHaveBeenCalled();expect(host.textContent).toBe('');
});
it('clears loaded charts on revoke and fetches new data after restoration',async()=>{
 mount();await settle();expect(host.querySelectorAll('.chart')).toHaveLength(20);
 permissions.view=false;await settle();expect(host.textContent).toBe('');
 api.history.mockReturnValue(new Promise(()=>{}));permissions.view=true;await settle();
 expect(host.querySelectorAll('.chart')).toHaveLength(0);expect(api.history).toHaveBeenCalledTimes(2);
});
it('does not restore revoked charts or source details from pending responses',async()=>{
 let history!:(r:ModelMonitoringHistory)=>void,source!:(r:unknown)=>void;
 api.history.mockReturnValue(new Promise(resolve=>history=resolve));api.source.mockReturnValue(new Promise(resolve=>source=resolve));
 mount();await settle();permissions.view=false;await settle();history(report());source({available:true,targets:'private invalid payload'});await settle();
 expect(host.textContent).toBe('');expect(host.querySelectorAll('.chart')).toHaveLength(0);
});
it('revoking source permission clears target counts and ignores its late response',async()=>{
 let source!:(r:unknown)=>void;api.source.mockReturnValue(new Promise(resolve=>source=resolve));mount();await settle();
 permissions.status=false;await settle();source({available:true,targets:JSON.stringify({status:'success',data:{resultType:'vector',result:[{value:[timestamp,'0']}]}})});await settle();
 expect(api.source).toHaveBeenCalledTimes(1);expect(host.textContent).not.toContain('DOWN');expect(host.querySelectorAll('.chart')).toHaveLength(20);
});
it('discards an old window response after selecting another range',async()=>{
 let old!:(r:ModelMonitoringHistory)=>void;api.history.mockReturnValueOnce(new Promise(resolve=>old=resolve));
 api.history.mockResolvedValue({...report(9),range:'15m'});mount();await settle();
 const select=host.querySelector('select')!;select.value='15m';select.dispatchEvent(new Event('change'));await settle();
 expect(api.history).toHaveBeenLastCalledWith('15m');expect(host.querySelectorAll('.chart')).toHaveLength(7);
 old(report());await settle();expect(host.querySelectorAll('.chart')).toHaveLength(7);
});
it.each(['partial-node','partial-task','task-without-node','unknown'])('rejects %s protocol without partial charts',async(kind)=>{
 const r=report();if(kind==='partial-node')delete r.series.nodeP95;
 if(kind==='partial-task')delete r.series.taskMetricsAge;
 if(kind==='task-without-node')nodes.forEach(k=>delete r.series[k]);
 if(kind==='unknown')r.series.unknownMetric=matrix();
 api.history.mockResolvedValue(r);mount();await settle();expect(host.textContent).toContain('模型监控读取或解析失败');expect(host.querySelectorAll('.chart')).toHaveLength(0);
});
it('preserves gaps and sampled zero instead of filling unknown values',async()=>{
 const r=report(10);r.series.activeModelCalls=matrix([[timestamp,'0'],[timestamp+30,'NaN'],[timestamp+60,'+Inf']]);
 api.history.mockResolvedValue(r);mount();await settle();
 const chart=[...host.querySelectorAll('article')].find(e=>e.textContent?.includes('本应用显式模型调用在途'))!;
 const options=JSON.parse(chart.querySelector('pre')!.textContent!);
 expect(options.series[0].data).toEqual([[timestamp*1000,0],[(timestamp+30)*1000,null],[(timestamp+60)*1000,null]]);
 expect(options.series[0].connectNulls).toBe(false);
});
it('clears old graphs and reports a refresh failure',async()=>{
 mount();await settle();expect(host.querySelectorAll('.chart')).toHaveLength(20);
 api.history.mockRejectedValue(new Error('unavailable'));host.querySelector('button')!.click();await settle();
 expect(host.querySelectorAll('.chart')).toHaveLength(0);expect(host.textContent).toContain('模型监控读取或解析失败');
});
