<script setup lang="ts">
import {computed,ref,shallowRef,watch,onBeforeUnmount} from 'vue';
import {useRouter} from 'vue-router';
import {usePermission} from '@/composables/permission';
import {getBenchmark,getBenchmarkReport,type BenchmarkPair,type BenchmarkReport} from '@/api/benchmarks';
import type {EvaluationReport} from '@/api/evaluation';
import {listTaskExecutions,type TaskExecutionSummary} from '@/api/tasks';
const props=defineProps<{baselineTaskId:string}>();
const {can}=usePermission(),router=useRouter();
const pair=shallowRef<BenchmarkPair>(),report=shallowRef<BenchmarkReport>(),error=ref(''),loading=ref(false),reportBusy=ref(false);
const includeModelUsage=ref(false);
const usageSides=computed(()=>{const usage=report.value?.modelUsage;return usage?.schemaVersion==='iqc-benchmark-model-usage-v1'&&usage.scope==='RECORDED_CALLS_OF_VALIDATED_SAMPLE_SOURCE_RUNS'?[{side:'基线',...usage.baseline},{side:'候选',...usage.candidate}]:[];});
const tokenRows=computed(()=>usageSides.value.flatMap(side=>{
 const tokens=side.recorded.tokens;
 return tokens?[{key:side.side+':input',side:side.side,label:'输入',...tokens.input},{key:side.side+':output',side:side.side,label:'输出',...tokens.output},{key:side.side+':total',side:side.side,label:'总量',...tokens.total}]:[];
}));
const costRows=computed(()=>usageSides.value.flatMap(side=>side.recorded.costs.currencies.map((cost,index)=>({key:side.side+':'+index,side:side.side,...cost}))));
const leftRounds=ref<TaskExecutionSummary[]>([]),rightRounds=ref<TaskExecutionSummary[]>([]),leftId=ref<string>(),rightId=ref<string>();
let generation=0,reportGeneration=0;
const labels:Record<string,string>={precision:'精确率',recall:'召回率',f1:'F1',coverage:'事实覆盖率',scoreMae:'评分 MAE',highRiskRecall:'高风险召回率',regressionPassRate:'回归通过率',p95Ms:'P95 毫秒',structuredSuccessRate:'结构化输出成功率'};
function metrics(r:EvaluationReport):Record<string,number|null>{return {precision:r.findingMetrics.aggregate.precision,recall:r.findingMetrics.aggregate.recall,f1:r.findingMetrics.aggregate.f1,coverage:r.findingMetrics.aggregate.coverage,scoreMae:r.businessMetrics.meanAbsoluteScoreError??null,highRiskRecall:r.businessMetrics.highRiskRecall??null,regressionPassRate:r.regressionMetrics?.passRate??null,p95Ms:r.latencyMetrics.p95Ms,structuredSuccessRate:r.structuredMetrics?.successRate??null};}
const comparisons=computed(()=>{const r=report.value;if(!r)return [];const baseline=metrics(r.baseline),candidate=metrics(r.candidate);return Object.entries(r.deltas).map(([key,value])=>({key,label:labels[key]||key,value,baseline:baseline[key]??null,candidate:candidate[key]??null}));});
const number=(value:number|null)=>value==null?'未定义':Number(value).toFixed(6);
async function refresh(){
 const ticket=++generation;++reportGeneration;pair.value=undefined;report.value=undefined;leftRounds.value=[];rightRounds.value=[];leftId.value=undefined;rightId.value=undefined;loading.value=true;reportBusy.value=false;error.value='';
 try{const p=await getBenchmark(props.baselineTaskId);if(ticket!==generation)return;pair.value=p;
 const rounds=await Promise.allSettled([listTaskExecutions(p.baseline.id),listTaskExecutions(p.candidate.id)]);if(ticket!==generation)return;
 if(rounds[0].status==='fulfilled'){leftRounds.value=rounds[0].value;leftId.value=p.baseline.currentExecutionId||rounds[0].value[0]?.id;}
 if(rounds[1].status==='fulfilled'){rightRounds.value=rounds[1].value;rightId.value=p.candidate.currentExecutionId||rounds[1].value[0]?.id;}
 if(rounds.some(r=>r.status==='rejected'))error.value='部分执行历史加载失败，请核对任务读取权限后刷新。';
 }catch{if(ticket===generation)error.value='实验配对加载失败，请核对权限和冻结快照。';}finally{if(ticket===generation)loading.value=false;}
}
function invalidate(){++reportGeneration;report.value=undefined;reportBusy.value=false;}
async function compare(){
 if(!pair.value||!leftId.value||!rightId.value||!can('iqc:benchmark:report:view'))return;
 const ticket=++reportGeneration,parent=generation,id=pair.value.baseline.id;reportBusy.value=true;report.value=undefined;error.value='';
 try{const data=await getBenchmarkReport(id,leftId.value,rightId.value,includeModelUsage.value&&can('iqc:task:model-calls:view'));if(ticket===reportGeneration&&parent===generation)report.value=data;}
 catch{if(ticket===reportGeneration&&parent===generation)error.value='配对报告加载失败；调用统计还需任务模型调用权限，缺失产物不会从金标分母中删除。';}
 finally{if(ticket===reportGeneration&&parent===generation)reportBusy.value=false;}
}
watch(()=>can('iqc:task:model-calls:view'),allowed=>{if(!allowed){includeModelUsage.value=false;invalidate();}});
watch(()=>props.baselineTaskId,()=>void refresh(),{immediate:true});
onBeforeUnmount(()=>{++generation;++reportGeneration;});
</script>
<template>
<a-card title="单变量版本对照" :loading="loading">
<a-alert v-if="error" type="warning" :message="error"/><a-button @click="refresh">刷新配对与执行历史</a-button>
<template v-if="pair"><p>{{pair.name}} · {{pair.selection.dimension}} · 冻结数据集 v{{pair.datasetVersion}}</p>
<a-row :gutter="16"><a-col :span="12"><h4>基线：{{pair.baseline.name}} · {{pair.baseline.status}}</h4><a-select v-model:value="leftId" :options="leftRounds.map(r=>({value:r.id,label:`第 ${r.attemptNo} 轮 · ${r.status}`}))" placeholder="选择基线执行轮次" style="width:100%" @change="invalidate"/><a-button @click="router.push({path:'/evaluation/tasks',query:{taskId:pair.baseline.id}})">查看基线产物</a-button></a-col><a-col :span="12"><h4>候选：{{pair.candidate.name}} · {{pair.candidate.status}}</h4><a-select v-model:value="rightId" :options="rightRounds.map(r=>({value:r.id,label:`第 ${r.attemptNo} 轮 · ${r.status}`}))" placeholder="选择候选执行轮次" style="width:100%" @change="invalidate"/><a-button @click="router.push({path:'/evaluation/tasks',query:{taskId:pair.candidate.id}})">查看候选产物</a-button></a-col></a-row>
<p v-if="!leftRounds.length||!rightRounds.length">有一侧尚未执行，请在任务页手动执行对应任务。</p><a-button @click="router.push('/tasks')">任务执行与暂停</a-button><a-button v-if="can('iqc:benchmark:report:view')" type="primary" :loading="reportBusy" :disabled="!leftId||!rightId||reportBusy" @click="compare">比较所选轮次</a-button>
<a-checkbox v-if="can('iqc:task:model-calls:view')" v-model:checked="includeModelUsage" @change="invalidate">附带已记录模型调用与费用</a-checkbox>
<template v-if="report"><a-alert :type="report.complete?'info':'warning'" :message="report.complete?'双侧报告产物齐全；不表示质量门禁通过':'至少一侧产物缺失；仍按完整金标集合计算'"/>
<p>变化为候选减基线。F1、召回和覆盖率正值较好；MAE、P95负值较好。比率按0–1展示；没有分母的指标保持未定义，不自动推荐胜者。</p>
<a-table :data-source="comparisons" row-key="key" :pagination="false"><a-table-column title="指标" data-index="label"/><a-table-column title="基线"><template #default="{record}">{{number(record.baseline)}}</template></a-table-column><a-table-column title="候选"><template #default="{record}">{{number(record.candidate)}}</template></a-table-column><a-table-column title="变化"><template #default="{record}">{{number(record.value)}}</template></a-table-column></a-table>
<template v-if="usageSides.length&&can('iqc:task:model-calls:view')">
<h4>验证样本来源执行的已记录模型调用</h4>
<a-alert type="info" show-icon message="按每个已验证样本的原执行轮次汇总，包含该来源轮次的已记录重试和工具调用。费用按冻结声明价格计算，并非供应商账单，也不是所选轮次全部费用或实验生命周期账单；缺少产物/调用记录/价格均不能当成零成本，不跨币种相加或自动判断胜者。"/>
<a-descriptions v-for="side in usageSides" :key="side.side" :title="side.side" :column="2">
<a-descriptions-item label="已绑定 / 金标样本">{{side.boundSamples}} / {{side.expectedSamples}}（未绑定 {{side.unboundSamples}}）</a-descriptions-item>
<a-descriptions-item label="账本调用数">{{side.recorded.costs.callCount}}（{{side.recorded.costs.callCount==='0'?'未记录调用，不代表零成本':'含该来源的已记录尝试'}}）</a-descriptions-item>
<a-descriptions-item label="费用已知 / 未知调用">{{side.recorded.costs.knownCount}} / {{side.recorded.costs.unknownCount}}</a-descriptions-item>
<a-descriptions-item label="调用耗时平均毫秒">{{side.recorded.latency.averageMillis??'未测量'}}（已测 {{side.recorded.latency.measuredCount}}，未知 {{side.recorded.latency.unknownCount}}）</a-descriptions-item>
</a-descriptions>
<a-table :data-source="costRows" row-key="key" :pagination="false"><a-table-column title="侧别" data-index="side"/><a-table-column title="币种"><template #default="{record}">{{record.currency??'未声明'}}</template></a-table-column><a-table-column title="已知费用小计"><template #default="{record}">{{record.knownSubtotal??'未测量'}}</template></a-table-column><a-table-column title="已知 / 未知调用"><template #default="{record}">{{record.knownCount}} / {{record.unknownCount}}</template></a-table-column></a-table>
<template v-if="tokenRows.length"><h4>供应商已报告 Token</h4><p>输入、输出、总量各自统计已知与未知调用；不相互推算。小计没有贡献值时保持未测量，不能当成零用量；重试和工具调用仍按上述来源执行范围。</p>
<a-table :data-source="tokenRows" row-key="key" :pagination="false"><a-table-column title="侧别" data-index="side"/><a-table-column title="用量" data-index="label"/><a-table-column title="已知小计"><template #default="{record}">{{record.knownSubtotal??'未测量'}}</template></a-table-column><a-table-column title="已知 / 未知调用"><template #default="{record}">{{record.knownCount}} / {{record.unknownCount}}</template></a-table-column></a-table></template>
</template>
<details><summary>双侧完整报告、缺失样本与原执行来源</summary><pre>{{JSON.stringify(report,null,2)}}</pre></details></template>
<details><summary>声明变量及冻结不变量摘要</summary><pre>{{JSON.stringify({experimentId:pair.experimentId,datasetHash:pair.datasetHash,selection:pair.selection,comparison:pair.comparison},null,2)}}</pre></details>
</template></a-card>
</template>
<style scoped>.ant-alert,.ant-btn{margin:8px 8px 8px 0}pre{max-height:500px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}</style>
