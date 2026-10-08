<script setup lang="ts">
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import ECharts from './ECharts.vue';
import {usePermission} from '@/composables/permission';
import {getModelMonitoringHistory,type ModelMonitoringHistory,type ModelMonitoringRange} from '@/api/model-gateway';
import {modelTrendOptions} from './model-monitoring-history';
const {can}=usePermission();const authorized=computed(()=>can('iqc:model:monitoring:view'));
const range=ref<ModelMonitoringRange>('1h'),loading=ref(false),error=ref(''),history=ref<ModelMonitoringHistory>();let generation=0;
const definitions=[
  {title:'显式调用完成速率（次/秒）',fields:[{key:'invocationTps',label:'调用/秒'}]},
  {title:'结果未知比例（%）',fields:[{key:'unknownRatio',label:'未知比例',multiplier:100}]},
  {title:'调用耗时分位数（毫秒）',fields:[{key:'p50',label:'P50',multiplier:1000},{key:'p95',label:'P95',multiplier:1000},{key:'p99',label:'P99',multiplier:1000}]},
  {title:'已报告Token速率（Token/秒）',fields:[{key:'reportedTokens',label:'Token/秒'}]},
  {title:'用量覆盖（调用/秒）',fields:[{key:'usageCoverage',label:'用量状态'}]},
  {title:'准入阶段（次/秒）',fields:[{key:'admission',label:'准入'}]},
  {title:'账本核销结果（次/秒）',fields:[{key:'settlement',label:'核销'}]}
];
const charts=ref<Array<{title:string;options:ReturnType<typeof modelTrendOptions>;known:boolean}>>([]);
async function load(){const ticket=++generation;history.value=undefined;charts.value=[];error.value='';if(!authorized.value){loading.value=false;return;}loading.value=true;
  try{const result=await getModelMonitoringHistory(range.value);if(ticket!==generation)return;
    if(result.range!==range.value)throw new Error('range mismatch');
    const parsed=definitions.map(definition=>{const options=modelTrendOptions(result,definition.fields);return {title:definition.title,options,known:options.series.some(series=>series.data.some(point=>point[1]!=null))};});
    history.value=result;charts.value=parsed;
  }catch{if(ticket===generation)error.value='模型监控读取或解析失败，请重试并检查监控服务。';}
  finally{if(ticket===generation)loading.value=false;}
}
watch([range,authorized],()=>void load(),{immediate:true});onBeforeUnmount(()=>{generation++;});
</script>
<template><section v-if="authorized" class="monitoring"><a-space><h3>模型运行趋势</h3><a-select v-model:value="range" style="width:130px" :options="[{value:'15m',label:'15分钟'},{value:'1h',label:'1小时'},{value:'6h',label:'6小时'},{value:'24h',label:'24小时'},{value:'7d',label:'7天'},{value:'30d',label:'30天'}]"/><a-button :disabled="loading" @click="load">刷新</a-button></a-space>
<a-alert type="info" message="统计全局显式模型调用。响应返回不代表质检成功，结果未知不能断言供应商失败。Token类别有重叠，不可相加；缺失样本保留断点。"/>
<a-alert v-if="error" type="error" :message="error"/><a-spin :spinning="loading"><p v-if="history">查询窗口：{{history.start}} — {{history.end}} · 步长 {{history.stepSeconds}} 秒</p>
<div class="charts"><a-card v-for="chart in charts" :key="chart.title" :title="chart.title"><ECharts v-if="chart.known" :options="chart.options"/><a-empty v-else description="没有有效样本；请检查时间窗口、采集状态和用量覆盖。"/></a-card></div></a-spin>
<p>运行计数随实例重启变化，不能替代精确预算账本或供应商账单。GPU、业务质检失败率尚无此图的数据来源。</p></section></template>
<style scoped>.monitoring{margin-top:24px}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;margin-top:16px}h3{margin:0}</style>
