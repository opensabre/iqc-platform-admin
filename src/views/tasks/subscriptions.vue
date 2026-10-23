<script setup lang="ts">
import AutomaticRetryPolicyEditor from "@/components/AutomaticRetryPolicyEditor.vue";
import {validateAutomaticRetry} from "@/api/automatic-retry";
import TriggerAttemptHistory from '@/components/TriggerAttemptHistory.vue';
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import {message,Modal} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import SelectorAssetLibrary from '@/components/SelectorAssetLibrary.vue';
import {listPipelines,listPipelineVersions,type PublishedPipeline,type PipelineVersion} from '@/api/pipeline-policies';
import type {SelectorAssetReference} from '@/api/selectors';
import type {InspectionTask} from '@/api/tasks';
import {listSchedules,getSchedule,createSchedule,updateSchedule,publishSchedule,availabilitySchedule,scheduleVersions,scheduleInstances,type SubscriptionDefinition,type EventSubscription,type SubscriptionVersion} from '@/api/event-subscriptions';
const {can}=usePermission();
const rows=ref<EventSubscription[]>([]),total=ref(0),current=ref(1),loading=ref(false),busy=ref(false),error=ref(''),open=ref(false),selected=ref<EventSubscription>();
const code=ref(''),name=ref(''),baseline=ref(''),definition=ref<SubscriptionDefinition>(fresh());
const pipelines=ref<PublishedPipeline[]>([]),pipelineVersions=ref<PipelineVersion[]>([]),pipelineLoading=ref(false),pipelinePage=ref(1),pipelineTotal=ref(0),catalogError=ref('');
const history=ref<SubscriptionVersion[]>([]),instances=ref<InspectionTask[]>([]),instancePage=ref(1),instanceTotal=ref(0),detailError=ref(''),selectorLabel=ref('');
// Navigation invalidates command continuations as well as read generations.
let disposed=false;
let generation=0,detailGeneration=0,catalogGeneration=0,versionGeneration=0;
function fresh():SubscriptionDefinition{return {schemaVersion:'iqc-event-subscription-v1',eventType:'ConversationCompleted',effectiveFrom:new Date().toISOString(),effectiveUntil:null,waitSeconds:3600,concurrency:1,pipeline:{pipelineId:'',versionNo:0},selector:null};}
const reloadRequired=ref(false);
function isRestricted(row:EventSubscription|SubscriptionVersion) {const p=row.privacy;return !!p&&(p.policyVersion!=='iqc-schedule-read-v1'||p.canonicalPayloadVisible!==true||p.canReadFull!==true||p.canReadPii!==true||p.canReadPrompt!==true);}
const restricted=computed(()=>reloadRequired.value||!!selected.value&&isRestricted(selected.value));
function clearDetails(){++detailGeneration;++versionGeneration;history.value=[];instances.value=[];instanceTotal.value=0;pipelineVersions.value=[];selectorLabel.value='';}
const dirty=computed(()=>baseline.value!==JSON.stringify([name.value,definition.value]));
const writable=computed(()=>!restricted.value&&can(selected.value?'iqc:subscription:update':'iqc:subscription:create'));
const targetPipelineId=computed(()=>definition.value.rollout?.pipelineId??definition.value.pipeline?.pipelineId??'');
const rolloutMode=computed({get:()=>definition.value.schemaVersion==='iqc-event-subscription-rollout-v1',set:(enabled:boolean)=>{
 if(disposed||busy.value||!writable.value||(enabled&&!can('iqc:pipeline:rollout:task:create')))return;
 const id=targetPipelineId.value;++versionGeneration;pipelineVersions.value=[];
 definition.value.schemaVersion=enabled?'iqc-event-subscription-rollout-v1':'iqc-event-subscription-v1';
 definition.value.pipeline=enabled?null:{pipelineId:id,versionNo:0};
 if(enabled)definition.value.rollout={pipelineId:id};else {delete definition.value.rollout;void versionsForPipeline(id);}
}});
const fixedVersion=computed({get:()=>definition.value.pipeline?.versionNo??0,set:(value:number)=>{
 if(!disposed&&!busy.value&&writable.value&&definition.value.pipeline)definition.value.pipeline.versionNo=value;
}});
function apply(row:EventSubscription){
 if(disposed)return;
 if(isRestricted(row)){selected.value=row;code.value=row.code;name.value=row.name;definition.value=fresh();selectorLabel.value='';baseline.value=JSON.stringify([name.value,definition.value]);reloadRequired.value=false;return;}
 const value=JSON.parse(row.draftConfigJson??'null') as SubscriptionDefinition;
 if(!value||!['iqc-event-subscription-v1','iqc-event-subscription-rollout-v1'].includes(value.schemaVersion))throw Error('协议无效');
 selected.value=row;code.value=row.code;name.value=row.name;definition.value=value;selectorLabel.value=value.selector?`${value.selector.selectorId} · v${value.selector.versionNo}`:'不限制选择器';baseline.value=JSON.stringify([name.value,value]);reloadRequired.value=false;
}

async function refresh(page=current.value){if(disposed||busy.value||!can('iqc:subscription:view'))return;const ticket=++generation;loading.value=true;error.value='';try{const data=await listSchedules(page);if(ticket===generation){rows.value=data.records;total.value=data.total;current.value=page;}}catch{if(ticket===generation)error.value='订阅列表加载失败，请重试。';}finally{if(ticket===generation)loading.value=false;}}
async function catalogs(page=1){if(disposed||!can('iqc:pipeline:view'))return;const ticket=++catalogGeneration;pipelineLoading.value=true;catalogError.value='';try{const data=await listPipelines(page);if(ticket===catalogGeneration){pipelines.value=data.records.filter(p=>p.status==='ACTIVE');pipelinePage.value=page;pipelineTotal.value=data.total;}}catch{if(ticket===catalogGeneration)catalogError.value='流水线目录未加载，请核对权限。';}finally{if(ticket===catalogGeneration)pipelineLoading.value=false;}}
async function pipelineChanged(id:string){if(disposed||busy.value||!writable.value)return;if(rolloutMode.value){++versionGeneration;pipelineVersions.value=[];definition.value.rollout={pipelineId:id};}else{definition.value.pipeline={pipelineId:id,versionNo:0};await versionsForPipeline(id);}}
async function versionsForPipeline(id:string){const ticket=++versionGeneration;pipelineVersions.value=[];if(rolloutMode.value||!id||!can('iqc:pipeline:versions:view'))return;try{const data=await listPipelineVersions(id);if(ticket===versionGeneration&&!rolloutMode.value&&targetPipelineId.value===id)pipelineVersions.value=data;}catch{if(ticket===versionGeneration)catalogError.value='流水线版本加载失败，请核对权限。';}}
function chooseSelector(reference:SelectorAssetReference,label:string){if(disposed||busy.value||!writable.value)return;definition.value.selector={...reference};selectorLabel.value=label;}
async function details(page=1){if(disposed)return;const asset=selected.value;if(!asset)return;const ticket=++detailGeneration;history.value=[];instances.value=[];instanceTotal.value=0;detailError.value='';try{if(can('iqc:subscription:versions:view')){const data=await scheduleVersions(asset.id);if(ticket===detailGeneration)history.value=data;}if(ticket===detailGeneration&&!disposed&&can('iqc:subscription:instances:view')){const data=await scheduleInstances(asset.id,page);if(ticket===detailGeneration){instances.value=data.records;instanceTotal.value=data.total;instancePage.value=page;}}}catch{if(ticket===detailGeneration)detailError.value='版本或接收实例加载失败，请刷新。';}}
async function load(row:EventSubscription){
 if(disposed||busy.value||!can('iqc:subscription:detail:view'))return;
 busy.value=true;clearDetails();const ticket=detailGeneration;
 reloadRequired.value=true;selected.value={...row,name:'',draftConfigJson:null,lastError:null};code.value=row.code;name.value='';definition.value=fresh();baseline.value=JSON.stringify([name.value,definition.value]);
 try{const data=await getSchedule(row.id);if(ticket!==detailGeneration)return;
  apply(data);open.value=true;await versionsForPipeline(targetPipelineId.value);await details();
 }catch{if(ticket===detailGeneration)message.error('订阅详情读取失败，旧配置已清除，请重新加载。');}
 finally{if(!disposed)busy.value=false;}
}

function create(){if(disposed||busy.value||!can('iqc:subscription:create'))return;++detailGeneration;++versionGeneration;selected.value=undefined;reloadRequired.value=false;code.value='';name.value='';definition.value=fresh();baseline.value='';history.value=[];instances.value=[];pipelineVersions.value=[];selectorLabel.value='';open.value=true;}
function validated(){const d=structuredClone(JSON.parse(JSON.stringify(definition.value))) as SubscriptionDefinition;if(!name.value.trim()||name.value.length>100)throw Error('名称需为1–100字');if(!selected.value&&!/^[A-Z][A-Z0-9_]{1,63}$/.test(code.value))throw Error('编码需为2–64位大写字母、数字或下划线');const from=new Date(d.effectiveFrom);if(!Number.isFinite(from.getTime()))throw Error('生效时间无效');from.setUTCMilliseconds(0);d.effectiveFrom=from.toISOString();if(d.effectiveUntil){const until=new Date(d.effectiveUntil);if(!Number.isFinite(until.getTime()))throw Error('结束时间无效');until.setUTCMilliseconds(0);if(until<=from)throw Error('结束时间须晚于生效时间（整秒）');d.effectiveUntil=until.toISOString();}else d.effectiveUntil=null;if(!Number.isInteger(d.waitSeconds)||d.waitSeconds<1||d.waitSeconds>604800||!Number.isInteger(d.concurrency)||d.concurrency<1||d.concurrency>32)throw Error('等待秒数及并发数量超出允许范围');const gray=d.schemaVersion==='iqc-event-subscription-rollout-v1';if(gray?(!can('iqc:pipeline:rollout:task:create')||d.pipeline!=null||!d.rollout?.pipelineId):(!d.pipeline?.pipelineId||!d.pipeline.versionNo||d.rollout!=null))throw Error('请选择有效流水线目标，灰度模式需要灰度任务权限');if(d.selector&&(!d.selector.selectorId||!d.selector.versionNo))throw Error('请选择有效的已发布选择器');d.retryPolicy=validateAutomaticRetry(d.retryPolicy);return d;}
async function save(){
 if(disposed||busy.value||!writable.value)return;let d:SubscriptionDefinition;try{d=validated();}catch(e){message.warning(e instanceof Error?e.message:'配置无效');return;}
 busy.value=true;
 try{
  let receipt:EventSubscription;
  try{receipt=selected.value?await updateSchedule(selected.value.id,selected.value.draftRevision,name.value.trim(),d):await createSchedule(code.value,name.value.trim(),d);}
  catch{if(disposed)return;message.error('保存未确认，请保留编辑并重新核对修订。');return;}
  if(disposed)return;
  clearDetails();apply(receipt);message.success('草稿已保存');
  try{apply(await getSchedule(receipt.id));await details();}catch{if(disposed)return;message.warning('草稿已保存，但重新读取失败。请重新加载，勿重复提交。');}
 }finally{if(!disposed)busy.value=false;}await refresh();
}

function publish(){const asset=selected.value;if(disposed||!asset||restricted.value||busy.value||dirty.value||!can('iqc:subscription:publish'))return;
 Modal.confirm({title:`发布修订 ${asset.draftRevision}？`,content:'发布版本不可修改。发布后请显式启用。',async onOk(){
  if(disposed||restricted.value||busy.value||dirty.value||selected.value?.id!==asset.id||selected.value.draftRevision!==asset.draftRevision)return;
  busy.value=true;try{
   try{await publishSchedule(asset.id,asset.draftRevision);}catch{if(disposed)return;message.error('发布未确认，请重新加载核对。');return;}
   if(disposed)return;
   clearDetails();selected.value={...asset,draftConfigJson:null};definition.value=fresh();reloadRequired.value=true;baseline.value=JSON.stringify([name.value,definition.value]);message.success('版本已发布');
   try{apply(await getSchedule(asset.id));await details();}catch{if(disposed)return;message.warning('版本已发布，但重新读取失败。请重新加载，勿重复发布。');}
  }finally{if(!disposed)busy.value=false;}await refresh();
 }});
}

async function availability(row:EventSubscription){
 if(disposed||busy.value||!can('iqc:subscription:availability')||(row.status!=='ACTIVE'&&!row.activeRevisionId))return;
 if(selected.value?.id===row.id&&dirty.value){message.warning('请先保存或重新加载未保存的草稿。');return;}
 busy.value=true;try{
  let receipt:EventSubscription;try{receipt=await availabilitySchedule(row.id,row.status!=='ACTIVE');}catch{if(disposed)return;message.error('操作未确认，请刷新核对。');return;}
  if(disposed)return;
  message.success('可用性已更新');if(selected.value?.id===row.id){clearDetails();apply(receipt);try{apply(await getSchedule(row.id));await details();}catch{if(disposed)return;message.warning('可用性已更新，但重新读取失败。请重新加载。');}}
 }finally{if(!disposed)busy.value=false;}await refresh();
}

function reload(){const row=selected.value;if(!row||busy.value)return;if(dirty.value)Modal.confirm({title:"重新加载并放弃未保存的修改？",onOk:()=>load(row)});else void load(row);}
function finishClose(){open.value=false;clearDetails();selected.value=undefined;code.value='';name.value='';definition.value=fresh();baseline.value='';reloadRequired.value=false;}
function close(){if(busy.value)return;if(dirty.value)Modal.confirm({title:'放弃未保存的修改？',onOk:finishClose});else finishClose();}

onMounted(()=>{void refresh();void catalogs();});onBeforeUnmount(()=>{disposed=true;++generation;++detailGeneration;++catalogGeneration;++versionGeneration;finishClose();});
</script>
<template>
<div class="schedules"><a-space><h2>事件订阅</h2><router-link v-if="can('iqc:schedule:view')" to="/tasks/schedules">周期调度</router-link><a-button :disabled="busy||loading" @click="refresh()">刷新</a-button><a-button v-if="can('iqc:subscription:create')" type="primary" :disabled="busy" @click="create">新建订阅</a-button></a-space>
<a-alert v-if="error" type="error" :message="error"/><a-table :data-source="rows" row-key="id" :loading="loading" :pagination="false" :columns="[{title:'名称',key:'name'},{title:'状态',dataIndex:'status'},{title:'活动版本 ID',dataIndex:'activeRevisionId'},{title:'最早重试 UTC',dataIndex:'retryNotBeforeUtc'},{title:'最近错误',dataIndex:'lastError'},{title:'操作',key:'actions'}]"><template #bodyCell="{column,record}"><template v-if="column.key==='name'"><a-button v-if="can('iqc:subscription:detail:view')" type="link" :disabled="busy" @click="load(record)">{{record.name}}</a-button><span v-else>{{record.name}}</span></template><template v-if="column.dataIndex==='lastError'">{{record.privacy?.withheldFields?.includes('lastError')?'原因未展示':record.lastError||'—'}}</template><template v-if="column.key==='actions'"><a-button v-if="can('iqc:subscription:availability')" :disabled="busy||(!record.activeRevisionId&&record.status!=='ACTIVE')" @click="availability(record)">{{record.status==='ACTIVE'?'停用':'启用'}}</a-button></template></template></a-table><a-pagination :current="current" :total="total" :page-size="20" :disabled="busy||loading" @change="refresh"/>
<a-drawer :open="open" title="事件订阅定义" width="900" :closable="!busy" :mask-closable="false" @close="close">
<a-alert type="info" message="默认停用；发布后须显式启用。停用仅阻止后续接收，不取消已接收任务。按归档记录时间 UTC 匹配有效期，时间规范为整秒；发布新版本会再次接收其范围内的会话。"/><a-alert v-if="selected" :message="`草稿修订 ${selected.draftRevision} · ${selected.status} · 最早重试 UTC ${selected.retryNotBeforeUtc??'无'} · 错误 ${restricted||selected.privacy?.withheldFields?.includes('lastError')?'原因未展示':selected.lastError??'无'}`"/>
<a-alert v-if="restricted" type="info" message="配置正文受限或需要重新读取，当前只展示元数据；不能用此副本编辑、预览或确认发布。"/><a-form v-if="!restricted" layout="vertical"><a-form-item label="编码"><a-input v-model:value="code" :disabled="!!selected||busy||!writable"/></a-form-item><a-form-item label="名称"><a-input v-model:value="name" :disabled="busy||!writable"/></a-form-item><a-form-item label="归档事件类型"><a-select v-model:value="definition.eventType" :disabled="busy||!writable" :options="[{value:'ConversationCompleted',label:'会话归档完成'},{value:'ASRCompleted',label:'ASR归档完成'}]"/></a-form-item><a-form-item label="生效时间（ISO，含时区）"><a-input v-model:value="definition.effectiveFrom" :disabled="busy||!writable"/></a-form-item><a-form-item label="结束时间（可选 ISO）"><a-input v-model:value="definition.effectiveUntil" :disabled="busy||!writable"/></a-form-item><a-form-item label="等待输入秒数"><a-input-number v-model:value="definition.waitSeconds" :min="1" :max="604800" :disabled="busy||!writable"/></a-form-item><a-form-item label="任务并发"><a-input-number v-model:value="definition.concurrency" :min="1" :max="32" :disabled="busy||!writable"/></a-form-item>
<a-alert v-if="catalogError" type="warning" :message="catalogError"/><a-form-item label="跟随灰度策略"><a-switch v-model:checked="rolloutMode" :disabled="busy||!writable||!can('iqc:pipeline:rollout:task:create')"/><p>每个事件首次接收时按当前策略分配，已接收任务保持原版本。</p></a-form-item><a-form-item label="已发布流水线"><a-select :value="targetPipelineId" :disabled="busy||!writable||pipelineLoading" :options="pipelines.map(p=>({value:p.id,label:p.name}))" @change="pipelineChanged"/><a-pagination :current="pipelinePage" :total="pipelineTotal" :page-size="20" :disabled="busy||pipelineLoading" @change="catalogs"/><a-select v-if="!rolloutMode" v-model:value="fixedVersion" :disabled="busy||!writable" :options="pipelineVersions.map(v=>({value:v.versionNo,label:`v${v.versionNo} · ${v.contentHash}`}))"/><p>引用：{{targetPipelineId}} · {{rolloutMode?'跟随灰度策略':`v${fixedVersion}`}}</p></a-form-item>
<a-form-item label="已发布选择器（可选）"><a-button v-if="writable" :disabled="busy" @click="definition.selector=null;selectorLabel='不限制选择器'">清除选择器限制</a-button><SelectorAssetLibrary v-if="writable" :disabled="busy" @select="chooseSelector"/><p>{{selectorLabel||'不限制选择器'}}</p></a-form-item><AutomaticRetryPolicyEditor v-model="definition.retryPolicy" :disabled="busy||!writable"/></a-form>
<a-space><a-button v-if="writable" type="primary" :disabled="busy" @click="save">保存草稿</a-button><a-button v-if="can('iqc:subscription:publish')&&selected" :disabled="restricted||busy||dirty" @click="publish">发布修订</a-button><a-button v-if="selected" :disabled="busy" @click="reload">重新加载</a-button></a-space>
<a-alert v-if="detailError" type="warning" :message="detailError"/><template v-if="selected"><a-button :disabled="busy" @click="details(instancePage)">刷新版本与实例</a-button><h3 v-if="can('iqc:subscription:versions:view')">不可变版本</h3><a-collapse v-if="can('iqc:subscription:versions:view')"><a-collapse-panel v-for="v in history" :key="v.id" :header="`v${v.versionNo} · 修订 ${v.sourceDraftRevision} · ${v.contentHash}`"><pre v-if="!isRestricted(v)">{{v.snapshotJson||'未包含快照正文'}}</pre><p v-else>版本正文受权限限制，版本号与原摘要保持。</p></a-collapse-panel></a-collapse><h3 v-if="can('iqc:subscription:instances:view')">接收实例</h3><a-table v-if="can('iqc:subscription:instances:view')" :data-source="instances" row-key="id" :pagination="false" :columns="[{title:'任务',key:'task'},{title:'状态',dataIndex:'status'},{title:'当前 EID',dataIndex:'currentExecutionId'},{title:'接入事件 ID',dataIndex:'triggerEventId'},{title:'接入原因',dataIndex:'triggerError'}]"><template #bodyCell="{column,record}"><template v-if="column.key==='task'"><router-link v-if="can('iqc:task:view')" :to="{path:'/tasks',query:{taskId:record.id}}">{{record.name}}</router-link><span v-else>{{record.name}} · {{record.id}}</span></template><template v-else-if="column.dataIndex==='triggerError'">{{record.privacy?.withheldFields?.includes('triggerError')?'原因未展示':record.triggerError||'—'}}</template></template></a-table><a-pagination v-if="can('iqc:subscription:instances:view')" :current="instancePage" :total="instanceTotal" :page-size="20" :disabled="busy" @change="details"/></template>
<TriggerAttemptHistory v-if="selected && open" kind="SUBSCRIPTION" :parent-id="selected.id"/></a-drawer></div>
</template>
<style scoped>.schedules{padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}h3{margin-top:20px}</style>
