<template>
  <a-card v-if="allowed" title="风险中心">
    <p>按稳定事件 ID 分页；处置与历史沿用来源结果的权限和记录。</p>
    <a-space wrap>
      <a-select v-model:value="status" style="width:160px" :options="statusOptions" @change="refresh"/>
      <a-select v-model:value="risk" style="width:160px" :options="riskOptions" @change="refresh"/>
      <a-button :loading="loading" @click="refresh">刷新</a-button>
    </a-space>
    <a-alert v-if="error" type="error" :message="error" style="margin-top:12px"/>
    <a-empty v-if="!loading && !error && !rows.length" description="当前范围和筛选暂无风险事件"/>
    <a-card v-for="row in rows" :key="row.id" size="small" style="margin-top:12px">
      <strong>{{ row.title }}</strong> · {{ row.category }} · {{ levels[row.riskLevel] }} · {{ states[row.status] }}
      <p style="white-space:pre-wrap">{{ row.description }}</p>
      <small>事件 {{ row.id }} · 来源结果 {{ row.sourceResultId }} · 处置版本 {{ row.version }}</small>
      <a-button v-if="can('iqc:risk:view')" @click="selected=row.sourceResultId">查看来源结果风险与处置</a-button>
    </a-card>
    <a-button v-if="next" :loading="loading" style="margin-top:12px" @click="load(true)">加载下一页</a-button>
    <a-spin v-else-if="loading"/>
  </a-card>
  <a-modal :open="!!selected" title="来源结果风险事件" :footer="null" :width="900" @cancel="selected=''">
    <RiskEventPanel v-if="selected" :key="selected" :result-id="selected"/>
  </a-modal>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { riskCenter, type RiskEvent } from '@/api/risk-events';
import { usePermission } from '@/composables/permission';
import RiskEventPanel from '@/components/RiskEventPanel.vue';
const {can}=usePermission();
const allowed=computed(()=>can('iqc:risk:center:view'));
const states:Record<string,string>={OPEN:'待处理',IN_PROGRESS:'处理中',RESOLVED:'已解决',DISMISSED:'已排除'};
const levels:Record<string,string>={LOW:'低',MEDIUM:'中',HIGH:'高',CRITICAL:'严重'};
const statusOptions=[{value:'',label:'全部状态'},...Object.entries(states).map(([value,label])=>({value,label}))];
const riskOptions=[{value:'',label:'全部风险等级'},...Object.entries(levels).map(([value,label])=>({value,label}))];
const status=ref(''),risk=ref(''),selected=ref(''),next=ref<string|null>(null),error=ref(''),loading=ref(false);
const rows=ref<RiskEvent[]>([]);let generation=0;
function valid(row:RiskEvent):boolean {
  return !!row && typeof row.id==='string' && /^risk-[a-f0-9]{59}$/.test(row.id)
    && typeof row.sourceResultId==='string' && /^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,63}$/.test(row.sourceResultId)
    && typeof row.sourceActionExecutionId==='string' && /^[a-f0-9]{64}$/.test(row.sourceActionExecutionId)
    && typeof row.category==='string' && /^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,63}$/.test(row.category)
    && typeof row.title==='string' && !!row.title.trim() && row.title.length<=128
    && typeof row.description==='string' && !!row.description.trim() && row.description.length<=1000
    && Object.hasOwn(states,row.status) && Object.hasOwn(levels,row.riskLevel)
    && typeof row.version==='string' && /^(0|[1-9][0-9]{0,18})$/.test(row.version) && BigInt(row.version)<=9223372036854775807n;
}
function refresh(){++generation;rows.value=[];next.value=null;selected.value='';loading.value=false;void load(false);}
async function load(append:boolean){
  if(!allowed.value || loading.value || append&&!next.value)return;
  const token=++generation,after=append?next.value!:undefined,filter=status.value,level=risk.value;
  loading.value=true;error.value='';
  try{
    const page=await riskCenter(after,filter||undefined,level||undefined);
    if(token!==generation || !allowed.value)return;
    if(!page || !Array.isArray(page.events) || page.events.length>20 || !(page.nextAfterId===null || typeof page.nextAfterId==='string'))throw new Error('invalid');
    let previous=after||'';
    for(const row of page.events){
      if(!valid(row) || row.id<=previous || filter&&row.status!==filter || level&&row.riskLevel!==level)throw new Error('invalid');
      previous=row.id;
    }
    if(page.nextAfterId!==null && (page.events.length!==20 || page.nextAfterId!==previous))throw new Error('invalid');
    rows.value=append?[...rows.value,...page.events]:page.events;next.value=page.nextAfterId;
  }catch{if(token===generation)error.value='风险中心读取失败，请重试；未更新事件记录。';}
  finally{if(token===generation)loading.value=false;}
}
watch(allowed,()=>{++generation;rows.value=[];next.value=null;selected.value='';error.value='';loading.value=false;if(allowed.value)void load(false);},{immediate:true});
watch(()=>can('iqc:risk:view'),value=>{if(!value)selected.value='';});
onBeforeUnmount(()=>{++generation;});
</script>
