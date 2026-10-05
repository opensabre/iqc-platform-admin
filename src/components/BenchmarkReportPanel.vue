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
 try{const data=await getBenchmarkReport(id,leftId.value,rightId.value);if(ticket===reportGeneration&&parent===generation)report.value=data;}
 catch{if(ticket===reportGeneration&&parent===generation)error.value='配对报告加载失败；缺失产物不会从金标分母中删除。';}
 finally{if(ticket===reportGeneration&&parent===generation)reportBusy.value=false;}
}
watch(()=>props.baselineTaskId,()=>void refresh(),{immediate:true});
onBeforeUnmount(()=>{++generation;++reportGeneration;});
</script>
<template>
<a-card title="单变量版本对照" :loading="loading">
<a-alert v-if="error" type="warning" :message="error"/><a-button @click="refresh">刷新配对与执行历史</a-button>
<template v-if="pair"><p>{{pair.name}} · {{pair.selection.dimension}} · 冻结数据集 v{{pair.datasetVersion}}</p>
<a-row :gutter="16"><a-col :span="12"><h4>基线：{{pair.baseline.name}} · {{pair.baseline.status}}</h4><a-select v-model:value="leftId" :options="leftRounds.map(r=>({value:r.id,label:`第 ${r.attemptNo} 轮 · ${r.status}`}))" placeholder="选择基线执行轮次" style="width:100%" @change="invalidate"/><a-button @click="router.push({path:'/evaluation/tasks',query:{taskId:pair.baseline.id}})">查看基线产物</a-button></a-col><a-col :span="12"><h4>候选：{{pair.candidate.name}} · {{pair.candidate.status}}</h4><a-select v-model:value="rightId" :options="rightRounds.map(r=>({value:r.id,label:`第 ${r.attemptNo} 轮 · ${r.status}`}))" placeholder="选择候选执行轮次" style="width:100%" @change="invalidate"/><a-button @click="router.push({path:'/evaluation/tasks',query:{taskId:pair.candidate.id}})">查看候选产物</a-button></a-col></a-row>
<p v-if="!leftRounds.length||!rightRounds.length">有一侧尚未执行，请在任务页手动执行对应任务。</p><a-button @click="router.push('/tasks')">任务执行与暂停</a-button><a-button v-if="can('iqc:benchmark:report:view')" type="primary" :loading="reportBusy" :disabled="!leftId||!rightId||reportBusy" @click="compare">比较所选轮次</a-button>
<template v-if="report"><a-alert :type="report.complete?'info':'warning'" :message="report.complete?'双侧报告产物齐全；不表示质量门禁通过':'至少一侧产物缺失；仍按完整金标集合计算'"/>
<p>变化为候选减基线。F1、召回和覆盖率正值较好；MAE、P95负值较好。比率按0–1展示；没有分母的指标保持未定义，不自动推荐胜者。</p>
<a-table :data-source="comparisons" row-key="key" :pagination="false"><a-table-column title="指标" data-index="label"/><a-table-column title="基线"><template #default="{record}">{{number(record.baseline)}}</template></a-table-column><a-table-column title="候选"><template #default="{record}">{{number(record.candidate)}}</template></a-table-column><a-table-column title="变化"><template #default="{record}">{{number(record.value)}}</template></a-table-column></a-table>
<details><summary>双侧完整报告、缺失样本与原执行来源</summary><pre>{{JSON.stringify(report,null,2)}}</pre></details></template>
<details><summary>声明变量及冻结不变量摘要</summary><pre>{{JSON.stringify({experimentId:pair.experimentId,datasetHash:pair.datasetHash,selection:pair.selection,comparison:pair.comparison},null,2)}}</pre></details>
</template></a-card>
</template>
<style scoped>.ant-alert,.ant-btn{margin:8px 8px 8px 0}pre{max-height:500px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}</style>
