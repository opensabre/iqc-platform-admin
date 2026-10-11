<template>
  <a-card v-if="allowed" title="风险事件" style="margin-top:16px">
    <p>事件创建与风险处置分别记录；没有事件不表示分析无风险。</p>
    <a-button :loading="loading" @click="load">刷新</a-button>
    <a-alert v-if="error" type="error" :message="error" style="margin-top:8px"/>
    <a-empty v-else-if="!loading && !rows.length" description="暂无风险事件"/>
    <a-card v-for="row in rows" :key="row.id" size="small" style="margin-top:8px">
      <strong>{{ row.title }}</strong> · {{ row.category }} · {{ levels[row.riskLevel] }} · {{ states[row.status] }}
      <p style="white-space:pre-wrap">{{ row.description }}</p>
      <small>事件 {{ row.id }} · 来源动作 {{ row.sourceActionExecutionId }} · 处置版本 {{ row.version }}</small>
    </a-card>
  </a-card>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listRiskEvents,type RiskEvent} from '@/api/risk-events';
const props=defineProps<{resultId:string}>();
const {can}=usePermission();
const allowed=computed(()=>can('iqc:risk:view'));
const rows=ref<RiskEvent[]>([]),loading=ref(false),error=ref('');
const levels:Record<string,string>={LOW:'低风险',MEDIUM:'中风险',HIGH:'高风险',CRITICAL:'严重风险'};
const states:Record<string,string>={OPEN:'待处置',IN_PROGRESS:'处置中',RESOLVED:'已解决',DISMISSED:'已排除'};
let generation=0,alive=true;
async function load(){
  if(!alive || !allowed.value || loading.value)return;
  const ticket=++generation,id=props.resultId;loading.value=true;error.value='';rows.value=[];
  try {
    const data=await listRiskEvents(id);const ids=new Set<string>();
    if(!Array.isArray(data) || data.length>100)throw Error('Invalid risk list');
    for(const row of data){
      if(!row || typeof row.id!=='string' || !/^risk-[a-f0-9]{59}$/.test(row.id) || ids.has(row.id)
          || row.sourceResultId!==id || typeof row.sourceActionExecutionId!=='string' || !/^[a-f0-9]{64}$/.test(row.sourceActionExecutionId)
          || typeof row.category!=='string' || !/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,63}$/.test(row.category)
          || typeof row.title!=='string' || !row.title.trim() || row.title.length>128
          || typeof row.description!=='string' || !row.description.trim() || row.description.length>1000
          || !Object.hasOwn(levels,row.riskLevel) || !Object.hasOwn(states,row.status)
          || typeof row.version!=='string' || !/^(0|[1-9][0-9]{0,18})$/.test(row.version) || BigInt(row.version)>9223372036854775807n)throw Error('Invalid risk event');
      ids.add(row.id);
    }
    if(alive && ticket===generation && allowed.value)rows.value=data;
  } catch {if(alive && ticket===generation)error.value='风险事件加载失败，请重试。';}
  finally {if(alive && ticket===generation)loading.value=false;}
}
watch(()=>[props.resultId,allowed.value],()=>{generation++;rows.value=[];error.value='';loading.value=false;if(allowed.value)void load();},{immediate:true});
onBeforeUnmount(()=>{alive=false;generation++;rows.value=[];});
</script>
