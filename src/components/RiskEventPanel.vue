<template>
  <a-card v-if="allowed" title="风险事件" style="margin-top:16px">
    <p>事件创建与风险处置分别记录；没有事件不表示分析无风险。</p>
    <a-button :loading="loading" :disabled="handling" @click="load">刷新</a-button>
    <a-alert v-if="error" type="error" :message="error" style="margin-top:8px"/>
    <p v-if="message">{{ message }}</p>
    <a-empty v-if="!loading && !rows.length" description="暂无风险事件"/>
    <a-card v-for="row in rows" :key="row.id" size="small" style="margin-top:8px">
      <strong>{{ row.title }}</strong> · {{ row.category }} · {{ levels[row.riskLevel] }} · {{ states[row.status] }}
      <p style="white-space:pre-wrap">{{ row.description }}</p>
      <small>事件 {{ row.id }} · 来源动作 {{ row.sourceActionExecutionId }} · 处置版本 {{ row.version }}</small>
      <a-button v-if="canHistory" :disabled="loading || handling" @click="openHistory(row)">处置历史</a-button>
      <a-button v-if="canHandle" :disabled="loading || handling || BigInt(row.version)===9223372036854775807n" @click="open(row)">处置</a-button>
    </a-card>
    <a-modal :open="!!historyId" title="风险处置历史" :footer="null" @cancel="closeHistory">
      <a-alert v-if="historyError" type="error" :message="historyError"/>
      <a-empty v-if="!historyLoading && !historyRows.length && !historyError" description="暂无处置记录"/>
      <div v-for="event in historyRows" :key="event.version" style="margin:12px 0">
        <strong>版本 {{ event.version }} · {{ states[event.previousStatus] }} → {{ states[event.status] }}</strong>
        <p style="white-space:pre-wrap">{{ event.reason }}</p>
        <small>{{ event.actor }} · {{ event.recordedAtUtc }} UTC</small>
      </div>
      <a-button v-if="historyNext" :loading="historyLoading" @click="loadHistory(true)">加载更早记录</a-button>
      <a-spin v-else-if="historyLoading"/>
    </a-modal>
    <a-modal :open="!!selected" title="处置风险事件" :confirm-loading="handling" :cancel-button-props="{disabled:handling}" :closable="!handling" :mask-closable="!handling" :keyboard="!handling" @ok="submit" @cancel="close">
      <p>当前观察版本 {{ selected?.version }}；旧观察需刷新，不自动重试。</p>
      <a-select v-model:value="next" :options="options" :disabled="handling" style="width:100%"/>
      <a-textarea v-model:value="reason" :maxlength="1000" :disabled="handling" placeholder="必填处置原因" style="margin-top:12px"/>
      <a-alert v-if="handlingError" type="error" :message="handlingError" style="margin-top:8px"/>
    </a-modal>
  </a-card>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listRiskEvents,handleRiskEvent,riskHandlingHistory,type RiskEvent,type RiskHandlingEvent} from '@/api/risk-events';
const props=defineProps<{resultId:string}>();
const {can}=usePermission();
const allowed=computed(()=>can('iqc:risk:view'));
const rows=ref<RiskEvent[]>([]),loading=ref(false),error=ref('');
const levels:Record<string,string>={LOW:'低风险',MEDIUM:'中风险',HIGH:'高风险',CRITICAL:'严重风险'};
const states:Record<string,string>={OPEN:'待处置',IN_PROGRESS:'处置中',RESOLVED:'已解决',DISMISSED:'已排除'};
let generation=0,alive=true;
const canHandle=computed(()=>can('iqc:risk:handle'));
const canHistory=computed(()=>can('iqc:risk:history:view'));
const historyId=ref<string|null>(null),historyRows=ref<RiskHandlingEvent[]>([]),historyNext=ref<string|null>(null),historyLoading=ref(false),historyError=ref('');
let historyGeneration=0;
function closeHistory(){historyGeneration++;historyId.value=null;historyRows.value=[];historyNext.value=null;historyLoading.value=false;historyError.value='';}
function openHistory(row:RiskEvent){if(!canHistory.value || handling.value || loading.value)return;closeHistory();historyId.value=row.id;void loadHistory();}
async function loadHistory(more=false){
  if(!alive || !allowed.value || !canHistory.value || !historyId.value || historyLoading.value || more && !historyNext.value)return;
  const ticket=++historyGeneration,id=historyId.value,cursor=more?historyNext.value!:undefined;
  historyLoading.value=true;historyError.value='';
  try {
    const page=await riskHandlingHistory(props.resultId,id,cursor);
    if(!page || !Array.isArray(page.events) || page.events.length>50)throw Error('Invalid risk history');
    let previous=more?historyRows.value.at(-1):undefined;
    for(const event of page.events){
      if(!event || typeof event.version!=='string' || !/^[1-9][0-9]{0,18}$/.test(event.version) || BigInt(event.version)>9223372036854775807n
          || cursor && BigInt(event.version)>=BigInt(cursor) || !Object.hasOwn(states,event.status) || !Object.hasOwn(states,event.previousStatus)
          || event.status===event.previousStatus || typeof event.reason!=='string' || !event.reason.trim() || event.reason.length>1000
          || typeof event.actor!=='string' || !event.actor.trim() || event.actor.length>128
          || typeof event.recordedAtUtc!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(event.recordedAtUtc)
          || !Number.isFinite(Date.parse(event.recordedAtUtc+'Z'))
          || previous && (BigInt(event.version)!==BigInt(previous.version)-1n || event.status!==previous.previousStatus))throw Error('Invalid risk history event');
      previous=event;
    }
    if(page.nextBeforeVersion!==null && (page.events.length!==50 || page.nextBeforeVersion!==previous?.version))throw Error('Invalid risk history cursor');
    if(alive && ticket===historyGeneration && canHistory.value && allowed.value){historyRows.value=more?[...historyRows.value,...page.events]:page.events;historyNext.value=page.nextBeforeVersion;}
  } catch {if(alive && ticket===historyGeneration)historyError.value='处置历史加载失败，请关闭后重试。';}
  finally {if(alive && ticket===historyGeneration)historyLoading.value=false;}
}

const selected=ref<RiskEvent|null>(null),next=ref(''),reason=ref(''),handling=ref(false),handlingError=ref(''),message=ref('');
let operationGeneration=0;
const options=computed(()=>{const status=selected.value?.status;const values=status==='OPEN'?['IN_PROGRESS','RESOLVED','DISMISSED']:status==='IN_PROGRESS'?['RESOLVED','DISMISSED']:status?['OPEN']:[];return values.map(value=>({value,label:states[value]}));});
function close(){if(handling.value)return;operationGeneration++;selected.value=null;reason.value='';handlingError.value='';next.value='';}
function open(row:RiskEvent){if(!canHandle.value || loading.value || handling.value)return;close();selected.value={...row};next.value=options.value[0]?.value || '';}
async function submit(){
  if(!selected.value || !canHandle.value || handling.value)return;
  if(!reason.value.trim() || reason.value.length>1000 || !options.value.some(option=>option.value===next.value)){handlingError.value='请选择目标状态并填写原因。';return;}
  const ticket=++operationGeneration,row={...selected.value},resultId=props.resultId;handling.value=true;handlingError.value='';message.value='';
  try {
    const response=await handleRiskEvent(resultId,row.id,row.version,next.value,reason.value);
    if(!alive || ticket!==operationGeneration || !allowed.value || !canHandle.value)return;
    if(!response || response.id!==row.id || !['HANDLED','STALE_OBSERVATION'].includes(response.state))throw Error('Invalid handling receipt');
    message.value=response.state==='HANDLED'?'风险处置已保存。':'观察已变化，请查看刷新后的记录。';
    handling.value=false;close();await load();
  } catch {if(alive && ticket===operationGeneration)handlingError.value='处置未确认，请查看实际记录；不会自动重试。';}
  finally {if(alive && ticket===operationGeneration)handling.value=false;}
}

async function load(){
  if(!alive || !allowed.value || loading.value)return;
  closeHistory();close();const ticket=++generation,id=props.resultId;loading.value=true;error.value='';rows.value=[];
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
watch(()=>[props.resultId,allowed.value,canHandle.value,canHistory.value],()=>{closeHistory();operationGeneration++;handling.value=false;close();message.value='';generation++;rows.value=[];error.value='';loading.value=false;if(allowed.value)void load();},{immediate:true});
onBeforeUnmount(()=>{alive=false;closeHistory();operationGeneration++;generation++;rows.value=[];});
</script>
