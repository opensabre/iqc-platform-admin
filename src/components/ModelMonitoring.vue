<script setup lang="ts">
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import ECharts from './ECharts.vue';
import {usePermission} from '@/composables/permission';
import {getModelMonitoringHistory,getModelMonitoringSource,type ModelMonitoringHistory,type ModelMonitoringRange} from '@/api/model-gateway';
import {modelTrendOptions} from './model-monitoring-history';
const {can}=usePermission();const authorized=computed(()=>can('iqc:model:monitoring:view'));
const range=ref<ModelMonitoringRange>('1h'),loading=ref(false),error=ref(''),history=ref<ModelMonitoringHistory>();let generation=0;
const canStatus=computed(()=>can('iqc:model:monitoring:status:view'));
const sourceMessage=ref(''),sourceWarning=ref(false);
async function loadSource(ticket:number){sourceMessage.value='';sourceWarning.value=false;if(!canStatus.value)return;
  try{const source=await getModelMonitoringSource();if(ticket!==generation)return;
    if(!source.available){sourceWarning.value=true;sourceMessage.value='监控数据源不可查询';return;}
    const response=JSON.parse(source.targets??'') as {status?:unknown;data?:{resultType?:unknown;result?:unknown}};
    if(!response||response.status!=='success'||response.data?.resultType!=='vector'||!Array.isArray(response.data.result)||response.data.result.length>100)throw new Error('invalid target vector');
    let up=0,down=0,unknown=0;
    for(const row of response.data.result){const value=(row as {value?:unknown})?.value;
      if(!Array.isArray(value)||value.length!==2||typeof value[0]!=='number'||!Number.isFinite(value[0])||typeof value[1]!=='string')throw new Error('invalid target sample');
      if(value[1]==='1')up++;else if(value[1]==='0')down++;else unknown++;
    }
    sourceWarning.value=down>0||unknown>0||up===0;
    sourceMessage.value=response.data.result.length?`Prometheus报告IQC采集目标：UP ${up}，DOWN ${down}，未知 ${unknown}。`:'数据源可查询，但没有IQC采集目标样本。';
  }catch{if(ticket===generation){sourceWarning.value=true;sourceMessage.value='采集状态读取或解析失败，请检查控制面。';}}
}
const definitions=[
  {title:'显式调用完成速率（次/秒）',fields:[{key:'invocationTps',label:'调用/秒'}]},
  {title:'结果未知比例（%）',fields:[{key:'unknownRatio',label:'未知比例',multiplier:100}]},
  {title:'调用耗时分位数（毫秒）',fields:[{key:'p50',label:'P50',multiplier:1000},{key:'p95',label:'P95',multiplier:1000},{key:'p99',label:'P99',multiplier:1000}]},
  {title:'已报告Token速率（Token/秒）',fields:[{key:'reportedTokens',label:'Token/秒'}]},
  {title:'用量覆盖（调用/秒）',fields:[{key:'usageCoverage',label:'用量状态'}]},
  {title:'准入阶段（次/秒）',fields:[{key:'admission',label:'准入'}]},
  {title:'账本核销结果（次/秒）',fields:[{key:'settlement',label:'核销'}]}
];
const pipelineDefinitions=[
  {title:'生产检测图完成速率（会话/秒）',fields:[{key:'pipelineTps',label:'会话/秒'}]},
  {title:'生产逻辑耗时 P95（毫秒）',fields:[{key:'pipelineP95',label:'检测图 P95',multiplier:1000},{key:'nodeP95',label:'节点尝试 P95',multiplier:1000}]},
  {title:'生产节点尝试成功率（%）',fields:[{key:'nodeSuccessRatio',label:'尝试成功率',multiplier:100}]},
  {title:'生产节点尝试完成速率（次/秒）',fields:[{key:'nodeAttemptTps',label:'节点状态'}]},
  {title:'生产未开始节点跳过速率（节点/秒）',fields:[{key:'nodeSkippedTps',label:'跳过/秒'}]},
  {title:'生产检测图逻辑在途（会话）',fields:[{key:'pipelineActive',label:'在途会话'}]},
  {title:'共享节点线程池（含评测）',fields:[{key:'nodeExecutorActive',label:'活跃线程'},{key:'nodeExecutorQueued',label:'排队尝试'}]}
];
const taskDefinitions=[
  {title:'生产持久任务状态（个）',fields:[{key:'taskStates',label:'任务状态'}]},
  {title:'生产执行轮次结束速率（次/秒，近5分钟）',fields:[{key:'taskCompletionTps',label:'轮次结束'}]},
  {title:'缺少完成时间的历史终态轮次（个）',fields:[{key:'unmeasuredExecutions',label:'历史未测量'}]},
  {title:'数据库采样健康（1为全部实例有效）',fields:[{key:'taskMetricsHealth',label:'采样健康'}]},
  {title:'距最近数据库采样成功（秒）',fields:[{key:'taskMetricsAge',label:'样本年龄'}]}
];
const pipelineSupported=ref(false),taskSupported=ref(false),activeModelSupported=ref(false);
const charts=ref<Array<{title:string;options:ReturnType<typeof modelTrendOptions>;known:boolean}>>([]);
async function load(){const ticket=++generation;history.value=undefined;charts.value=[];pipelineSupported.value=false;taskSupported.value=false;activeModelSupported.value=false;error.value='';if(!authorized.value){loading.value=false;return;}loading.value=true;const sourceRequest=loadSource(ticket);
  try{const result=await getModelMonitoringHistory(range.value);if(ticket!==generation)return;
    if(result.range!==range.value)throw new Error('range mismatch');
    const keys=pipelineDefinitions.flatMap(definition=>definition.fields.map(field=>field.key));
    const present=keys.filter(key=>Object.hasOwn(result.series,key)).length;
    if(present!==0&&present!==keys.length)throw new Error('incomplete pipeline metrics');
    const supported=present===keys.length;
    const taskKeys=taskDefinitions.flatMap(definition=>definition.fields.map(field=>field.key));
    const tasksPresent=taskKeys.filter(key=>Object.hasOwn(result.series,key)).length;
    if(tasksPresent!==0&&(!supported||tasksPresent!==taskKeys.length))throw new Error('incomplete task metrics');
    const tasksSupported=tasksPresent===taskKeys.length;
    const activeSupported=Object.hasOwn(result.series,'activeModelCalls');
    const parsed=[...definitions,...(activeSupported?[{title:'本应用显式模型调用在途（跨实例）',fields:[{key:'activeModelCalls',label:'在途调用'}]}]:[]),...(supported?pipelineDefinitions:[]),...(tasksSupported?taskDefinitions:[])].map(definition=>{const options=modelTrendOptions(result,definition.fields);return {title:definition.title,options,known:options.series.some(series=>series.data.some(point=>point[1]!=null))};});
    history.value=result;charts.value=parsed;pipelineSupported.value=supported;taskSupported.value=tasksSupported;activeModelSupported.value=activeSupported;
  }catch{if(ticket===generation)error.value='模型监控读取或解析失败，请重试并检查监控服务。';}
  finally{await sourceRequest;if(ticket===generation)loading.value=false;}
}
watch([range,authorized,canStatus],()=>void load(),{immediate:true,flush:'sync'});onBeforeUnmount(()=>{generation++;});
</script>
<template><section v-if="authorized" class="monitoring"><a-space><h3>模型与节点运行趋势</h3><a-select v-model:value="range" style="width:130px" :options="[{value:'15m',label:'15分钟'},{value:'1h',label:'1小时'},{value:'6h',label:'6小时'},{value:'24h',label:'24小时'},{value:'7d',label:'7天'},{value:'30d',label:'30天'}]"/><a-button :disabled="loading" @click="load">刷新</a-button></a-space>
<a-alert type="info" message="统计全局显式模型调用及生产检测图。节点成功率按每次尝试计算，重试和备用节点分别计数，未开始的跳过不充当执行成功。响应返回不代表质检成功；Token类别不可相加，缺失样本保留断点。"/>
<a-alert v-if="sourceMessage" :type="sourceWarning?'warning':'info'" :message="sourceMessage"/>
<a-alert v-if="error" type="error" :message="error"/><a-spin :spinning="loading"><p v-if="history">查询窗口：{{history.start}} — {{history.end}} · 步长 {{history.stepSeconds}} 秒</p>
<a-alert v-if="history&&!pipelineSupported" type="info" message="当前控制面未返回节点运行系列，节点指标尚无法确认。"/>
<a-alert v-if="history&&!taskSupported" type="info" message="当前控制面未返回持久任务系列，任务积压与轮次结束速率尚无法确认。"/>
<p v-if="history&&!activeModelSupported">当前控制面尚未提供模型调用在途指标，无法确认当前调用并发。</p>
<div class="charts"><a-card v-for="chart in charts" :key="chart.title" :title="chart.title"><ECharts v-if="chart.known" :options="chart.options"/><a-empty v-else description="没有有效样本；请检查时间窗口、采集状态和用量覆盖。"/></a-card></div></a-spin>
<p>模型在途仅计已准入且进入显式供应商调用的本应用边界，返回/抛错后归还；不含准入、归档或结算等待，不代表供应商GPU占用。运行计数随实例重启变化，不能替代精确账本。检测图耗时不含融合评分和持久化；超时、取消后的逻辑结算耗时不代表底层任务已经停止。共享线程池包含评测，不是持久任务积压或 GPU 用量；持久状态按数据库快照，暂停、预算等待与排队分别显示；结束速率只包含已记录完成时间的轮次，取消不等于质检成功。历史缺测不回填，过期或失败样本保断点，目标 UP 不代表数据库样本有效。本图尚无 GPU 数据来源。</p></section></template>
<style scoped>.monitoring{margin-top:24px}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;margin-top:16px}h3{margin:0}</style>
