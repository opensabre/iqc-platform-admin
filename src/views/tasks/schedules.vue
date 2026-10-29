<script setup lang="ts">
import AutomaticRetryPolicyEditor from "@/components/AutomaticRetryPolicyEditor.vue";
import {validateAutomaticRetry} from "@/api/automatic-retry";
import TriggerAttemptHistory from '@/components/TriggerAttemptHistory.vue';
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {message,Modal} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import SelectorAssetLibrary from '@/components/SelectorAssetLibrary.vue';
import {listPipelines,listPipelineVersions,type PublishedPipeline,type PipelineVersion} from '@/api/pipeline-policies';
import type {SelectorAssetReference} from '@/api/selectors';
import type {InspectionTask} from '@/api/tasks';
import {listSchedules,getSchedule,createSchedule,updateSchedule,publishSchedule,availabilitySchedule,scheduleVersions,scheduleInstances,previewSchedule,type PeriodicDefinition,type PeriodicSchedule,type PeriodicVersion} from '@/api/periodic-schedules';
const {can}=usePermission();
const rows=ref<PeriodicSchedule[]>([]),total=ref(0),current=ref(1),loading=ref(false),busy=ref(false),error=ref(''),open=ref(false),selected=ref<PeriodicSchedule>();
const code=ref(''),name=ref(''),baseline=ref(''),definition=ref<PeriodicDefinition>(fresh());
const pipelines=ref<PublishedPipeline[]>([]),pipelineVersions=ref<PipelineVersion[]>([]),pipelineLoading=ref(false),pipelinePage=ref(1),pipelineTotal=ref(0),catalogError=ref('');
const history=ref<PeriodicVersion[]>([]),instances=ref<InspectionTask[]>([]),instancePage=ref(1),instanceTotal=ref(0),times=ref<string[]>([]),detailError=ref(''),selectorLabel=ref('');
// Navigation invalidates command continuations as well as read generations.
let disposed=false;
let generation=0,detailGeneration=0,catalogGeneration=0,versionGeneration=0;
let publishGeneration=0,editorGeneration=0,operationGeneration=0;
watch(()=>JSON.stringify([can('iqc:schedule:publish'),can('iqc:sensitive:conversation:read'),can('iqc:sensitive:pii:read'),can('iqc:sensitive:prompt:read')]),()=>{++publishGeneration;},{flush:'sync'});
const sensitiveReadKey=computed(()=>JSON.stringify([can('iqc:sensitive:conversation:read'),can('iqc:sensitive:pii:read'),can('iqc:sensitive:prompt:read')]));
watch(()=>JSON.stringify([can('iqc:schedule:view'),sensitiveReadKey.value]),()=>{++generation;rows.value=[];total.value=0;loading.value=false;},{flush:'sync'});
watch(()=>JSON.stringify([can('iqc:pipeline:view'),sensitiveReadKey.value]),()=>{++catalogGeneration;pipelines.value=[];pipelineTotal.value=0;pipelineLoading.value=false;},{flush:'sync'});
watch(()=>JSON.stringify([can('iqc:pipeline:versions:view'),sensitiveReadKey.value]),()=>{++versionGeneration;pipelineVersions.value=[];},{flush:'sync'});
watch(()=>JSON.stringify([can('iqc:schedule:versions:view'),can('iqc:schedule:instances:view'),sensitiveReadKey.value]),()=>{++detailGeneration;history.value=[];instances.value=[];instanceTotal.value=0;},{flush:'sync'});
watch(()=>JSON.stringify([can('iqc:schedule:detail:view'),sensitiveReadKey.value]),()=>{
 ++editorGeneration;++operationGeneration;busy.value=false;open.value=false;clearDetails();
 if(selected.value)selected.value={...selected.value,name:'',draftConfigJson:null,lastError:null};
 name.value='';definition.value=fresh();baseline.value=JSON.stringify([name.value,definition.value]);reloadRequired.value=true;
},{flush:'sync'});
watch(()=>JSON.stringify([can('iqc:schedule:create'),can('iqc:schedule:update'),can('iqc:schedule:publish'),can('iqc:schedule:availability'),can('iqc:pipeline:rollout:task:create'),can('iqc:schedule:preview')]),()=>{++operationGeneration;busy.value=false;},{flush:'sync'});
function fresh():PeriodicDefinition{return {schemaVersion:'iqc-periodic-definition-v1',cron:'0 0 2 * * *',zoneId:'Asia/Shanghai',effectiveFrom:new Date().toISOString(),effectiveUntil:null,misfirePolicy:'FIRE_LATEST',maximumCatchUp:1,concurrency:1,pipeline:{pipelineId:'',versionNo:0},selector:{selectorId:'',versionNo:0}};}
const targetPipelineId=computed(()=>definition.value.rollout?.pipelineId||definition.value.pipeline?.pipelineId||'');
const rolloutMode=computed({get:()=>definition.value.schemaVersion==='iqc-periodic-rollout-definition-v1',set:(value:boolean)=>{
 if(disposed||busy.value||!writable.value||value&&!can('iqc:pipeline:rollout:task:create'))return;
 const id=targetPipelineId.value;++versionGeneration;pipelineVersions.value=[];
 if(value){definition.value.schemaVersion='iqc-periodic-rollout-definition-v1';definition.value.pipeline=null;definition.value.rollout={pipelineId:id};}
 else{definition.value.schemaVersion='iqc-periodic-definition-v1';definition.value.pipeline={pipelineId:id,versionNo:0};delete definition.value.rollout;void versionsForPipeline(id);}
}});
const reloadRequired=ref(false);
function isRestricted(row:PeriodicSchedule|PeriodicVersion) {const p=row.privacy;return !!p&&(p.policyVersion!=='iqc-schedule-read-v1'||p.canonicalPayloadVisible!==true||p.canReadFull!==true||p.canReadPii!==true||p.canReadPrompt!==true);}
const restricted=computed(()=>reloadRequired.value||!!selected.value&&isRestricted(selected.value));
function clearDetails(){++detailGeneration;++versionGeneration;history.value=[];instances.value=[];instanceTotal.value=0;pipelineVersions.value=[];selectorLabel.value='';}
const dirty=computed(()=>baseline.value!==JSON.stringify([name.value,definition.value]));
watch(()=>JSON.stringify(definition.value),()=>{times.value=[];});
const writable=computed(()=>!restricted.value&&can(selected.value?'iqc:schedule:update':'iqc:schedule:create'));
function apply(row:PeriodicSchedule){
 if(disposed)return;
 if(isRestricted(row)){selected.value=row;code.value=row.code;name.value=row.name;definition.value=fresh();selectorLabel.value='';baseline.value=JSON.stringify([name.value,definition.value]);reloadRequired.value=false;return;}
 const value=JSON.parse(row.draftConfigJson??'null') as PeriodicDefinition;
 if(!value||!['iqc-periodic-definition-v1','iqc-periodic-rollout-definition-v1'].includes(value.schemaVersion))throw Error('协议无效');
 selected.value=row;code.value=row.code;name.value=row.name;definition.value=value;selectorLabel.value=`${value.selector.selectorId} · v${value.selector.versionNo}`;baseline.value=JSON.stringify([name.value,value]);reloadRequired.value=false;
}

function stageReceipt(row:PeriodicSchedule){
 clearDetails();selected.value={...row,name:'',draftConfigJson:null,lastError:null};code.value=row.code;name.value='';definition.value=fresh();
 reloadRequired.value=true;baseline.value=JSON.stringify([name.value,definition.value]);
}
async function reread(id:string,current:()=>boolean){
 if(!current()||!can('iqc:schedule:detail:view'))return;
 const data=await getSchedule(id);if(!current()||!can('iqc:schedule:detail:view'))return;
 apply(data);await details();
}

async function refresh(page=current.value){if(disposed||busy.value||!can('iqc:schedule:view'))return;const ticket=++generation;loading.value=true;error.value='';try{const data=await listSchedules(page);if(!disposed&&ticket===generation&&can('iqc:schedule:view')){rows.value=data.records;total.value=data.total;current.value=page;}}catch{if(ticket===generation)error.value='调度列表加载失败，请重试。';}finally{if(ticket===generation)loading.value=false;}}
async function catalogs(page=1){if(disposed||!can('iqc:pipeline:view'))return;const ticket=++catalogGeneration;pipelineLoading.value=true;catalogError.value='';try{const data=await listPipelines(page);if(!disposed&&ticket===catalogGeneration&&can('iqc:pipeline:view')){pipelines.value=data.records.filter(p=>p.status==='ACTIVE');pipelinePage.value=page;pipelineTotal.value=data.total;}}catch{if(ticket===catalogGeneration)catalogError.value='流水线目录未加载，请核对权限。';}finally{if(ticket===catalogGeneration)pipelineLoading.value=false;}}
async function pipelineChanged(id:string){if(disposed||busy.value||!writable.value)return;if(rolloutMode.value){definition.value.pipeline=null;definition.value.rollout={pipelineId:id};++versionGeneration;pipelineVersions.value=[];}else{definition.value.pipeline={pipelineId:id,versionNo:0};await versionsForPipeline(id);}}
async function versionsForPipeline(id:string){const ticket=++versionGeneration;pipelineVersions.value=[];if(disposed||rolloutMode.value||!id||!can('iqc:pipeline:versions:view'))return;try{const data=await listPipelineVersions(id);if(!disposed&&ticket===versionGeneration&&can('iqc:pipeline:versions:view')&&definition.value.pipeline?.pipelineId===id)pipelineVersions.value=data;}catch{if(ticket===versionGeneration)catalogError.value='流水线版本加载失败，请核对权限。';}}
function chooseSelector(reference:SelectorAssetReference,label:string){if(disposed||busy.value||!writable.value)return;definition.value.selector={...reference};selectorLabel.value=label;times.value=[];}
async function details(page=1){if(disposed)return;const asset=selected.value;if(!asset)return;const ticket=++detailGeneration;history.value=[];instances.value=[];instanceTotal.value=0;detailError.value='';try{if(can('iqc:schedule:versions:view')){const data=await scheduleVersions(asset.id);if(!disposed&&ticket===detailGeneration&&selected.value?.id===asset.id&&can('iqc:schedule:versions:view'))history.value=data;}if(ticket===detailGeneration&&!disposed&&selected.value?.id===asset.id&&can('iqc:schedule:instances:view')){const data=await scheduleInstances(asset.id,page);if(!disposed&&ticket===detailGeneration&&selected.value?.id===asset.id&&can('iqc:schedule:instances:view')){instances.value=data.records;instanceTotal.value=data.total;instancePage.value=page;}}}catch{if(ticket===detailGeneration)detailError.value='版本或周期实例加载失败，请刷新。';}}
async function load(row:PeriodicSchedule){
 if(disposed||busy.value||!can('iqc:schedule:detail:view'))return;
 const operation=++operationGeneration,context=++editorGeneration;
 const current=()=>!disposed&&operation===operationGeneration&&context===editorGeneration&&can('iqc:schedule:detail:view');
 busy.value=true;stageReceipt(row);const ticket=detailGeneration;
 try{const data=await getSchedule(row.id);if(!current()||ticket!==detailGeneration)return;
  apply(data);open.value=true;await versionsForPipeline(targetPipelineId.value);if(!current())return;await details();
 }catch{if(current())message.error('调度详情读取失败，旧配置已清除，请重新加载。');}
 finally{if(!disposed&&operation===operationGeneration)busy.value=false;}
}

function create(){if(disposed||busy.value||!can('iqc:schedule:create'))return;++editorGeneration;++operationGeneration;++detailGeneration;++versionGeneration;selected.value=undefined;reloadRequired.value=false;code.value='';name.value='';definition.value=fresh();baseline.value='';history.value=[];instances.value=[];times.value=[];pipelineVersions.value=[];selectorLabel.value='';open.value=true;}
function validated(){const d=structuredClone(JSON.parse(JSON.stringify(definition.value))) as PeriodicDefinition;if(!name.value.trim()||name.value.length>100)throw Error('名称需为1–100字');if(!selected.value&&!/^[A-Z][A-Z0-9_]{1,63}$/.test(code.value))throw Error('编码需为2–64位大写字母、数字或下划线');if(d.cron.trim().split(/\s+/).length!==6)throw Error('Cron 必须为六字段');new Intl.DateTimeFormat('en',{timeZone:d.zoneId});const from=new Date(d.effectiveFrom);if(!Number.isFinite(from.getTime()))throw Error('生效时间无效');d.effectiveFrom=from.toISOString();if(d.effectiveUntil){const until=new Date(d.effectiveUntil);if(!Number.isFinite(until.getTime())||until<=from)throw Error('结束时间须晚于生效时间');d.effectiveUntil=until.toISOString();}else d.effectiveUntil=null;if(!Number.isInteger(d.maximumCatchUp)||d.maximumCatchUp<1||d.maximumCatchUp>100||!Number.isInteger(d.concurrency)||d.concurrency<1||d.concurrency>32)throw Error('补跑及并发数量超出允许范围');if(!d.selector.selectorId||!d.selector.versionNo)throw Error('请选择已发布选择器');if(d.schemaVersion==='iqc-periodic-rollout-definition-v1'){if(d.pipeline!=null||!d.rollout?.pipelineId)throw Error('请选择灰度流水线');}else if(d.schemaVersion!=='iqc-periodic-definition-v1'||!d.pipeline?.pipelineId||!d.pipeline.versionNo||d.rollout!=null)throw Error('请选择流水线已发布版本');d.retryPolicy=validateAutomaticRetry(d.retryPolicy);return d;}
async function save(){
 if(disposed||busy.value||!writable.value)return;let d:PeriodicDefinition;try{d=validated();}catch(e){message.warning(e instanceof Error?e.message:'配置无效');return;}
 const asset=selected.value,requestName=name.value.trim(),requestCode=code.value;
 const permission=asset?'iqc:schedule:update':'iqc:schedule:create';
 const operation=++operationGeneration,context=editorGeneration;
 const current=()=>!disposed&&operation===operationGeneration&&context===editorGeneration&&can(permission);
 busy.value=true;
 try{
  let receipt:PeriodicSchedule;
  try{receipt=asset?await updateSchedule(asset.id,asset.draftRevision,requestName,d):await createSchedule(requestCode,requestName,d);}
  catch{if(current())message.error('保存未确认，请保留编辑并重新核对修订。');return;}
  if(!current())return;
  stageReceipt(receipt);message.success('草稿已保存');
  try{await reread(receipt.id,current);}catch{if(current())message.warning('草稿已保存，但重新读取失败。请重新加载，勿重复提交。');}
 }finally{if(!disposed&&operation===operationGeneration){busy.value=false;void refresh();}}
}

function publish(){const asset=selected.value;if(disposed||!asset||restricted.value||busy.value||dirty.value||!can('iqc:schedule:publish'))return;
 const permissionTicket=publishGeneration,contextTicket=detailGeneration;
 Modal.confirm({title:`发布修订 ${asset.draftRevision}？`,content:'发布版本不可修改。发布后请显式启用。',async onOk(){
  if(disposed||permissionTicket!==publishGeneration||contextTicket!==detailGeneration||!can('iqc:schedule:publish')||restricted.value||busy.value||dirty.value||selected.value?.id!==asset.id||selected.value.draftRevision!==asset.draftRevision)return;
  const operation=++operationGeneration,context=editorGeneration;
  const current=()=>!disposed&&operation===operationGeneration&&context===editorGeneration&&can('iqc:schedule:publish');
  busy.value=true;try{
   try{await publishSchedule(asset.id,asset.draftRevision);}catch{if(current())message.error('发布未确认，请重新加载核对。');return;}
   if(!current())return;
   stageReceipt(asset);message.success('版本已发布');
   try{await reread(asset.id,current);}catch{if(current())message.warning('版本已发布，但重新读取失败。请重新加载，勿重复发布。');}
  }finally{if(!disposed&&operation===operationGeneration){busy.value=false;void refresh();}}
 }});
}

async function availability(row:PeriodicSchedule){
 if(disposed||busy.value||!can('iqc:schedule:availability')||(row.status!=='ACTIVE'&&!row.activeRevisionId))return;
 if(selected.value?.id===row.id&&dirty.value){message.warning('请先保存或重新加载未保存的草稿。');return;}
 const operation=++operationGeneration,context=editorGeneration;
 const current=()=>!disposed&&operation===operationGeneration&&context===editorGeneration&&can('iqc:schedule:availability');
 busy.value=true;try{
  let receipt:PeriodicSchedule;try{receipt=await availabilitySchedule(row.id,row.status!=='ACTIVE');}catch{if(current())message.error('操作未确认，请刷新核对。');return;}
  if(!current())return;
  message.success('可用性已更新');if(selected.value?.id===row.id){stageReceipt(receipt);try{await reread(row.id,current);}catch{if(current())message.warning('可用性已更新，但重新读取失败。请重新加载。');}}
 }finally{if(!disposed&&operation===operationGeneration){busy.value=false;void refresh();}}
}

async function preview(){
 if(disposed||restricted.value||busy.value||!can('iqc:schedule:preview'))return;let d:PeriodicDefinition;try{d=validated();}catch(e){message.warning(e instanceof Error?e.message:'配置无效');return;}
 const operation=++operationGeneration,context=editorGeneration;
 const current=()=>!disposed&&operation===operationGeneration&&context===editorGeneration&&can('iqc:schedule:preview');
 busy.value=true;times.value=[];try{const data=await previewSchedule(d,new Date().toISOString());if(current())times.value=data;}
 catch{if(current())message.error('计划预览失败，请检查 Cron、时区及有效期。');}finally{if(!disposed&&operation===operationGeneration)busy.value=false;}
}

function reload(){const row=selected.value;if(!row||busy.value)return;if(dirty.value)Modal.confirm({title:"重新加载并放弃未保存的修改？",onOk:()=>load(row)});else void load(row);}
function finishClose(){++editorGeneration;++operationGeneration;open.value=false;clearDetails();selected.value=undefined;code.value='';name.value='';definition.value=fresh();baseline.value='';reloadRequired.value=false;}
function close(){if(busy.value)return;if(dirty.value)Modal.confirm({title:'放弃未保存的修改？',onOk:finishClose});else finishClose();}

onMounted(()=>{void refresh();void catalogs();});onBeforeUnmount(()=>{disposed=true;++generation;++detailGeneration;++catalogGeneration;++versionGeneration;finishClose();});
</script>
<template>
<div class="schedules"><a-space><h2>周期调度</h2><router-link v-if="can('iqc:subscription:view')" to="/tasks/subscriptions">事件订阅</router-link><a-button :disabled="busy||loading" @click="refresh()">刷新</a-button><a-button v-if="can('iqc:schedule:create')" type="primary" :disabled="busy" @click="create">新建调度</a-button></a-space>
<a-alert v-if="error" type="error" :message="error"/><a-table :data-source="rows" row-key="id" :loading="loading" :pagination="false" :columns="[{title:'名称',key:'name'},{title:'状态',dataIndex:'status'},{title:'活动版本 ID',dataIndex:'activeRevisionId'},{title:'下一计划 UTC',dataIndex:'nextPlannedAtUtc'},{title:'最近错误',dataIndex:'lastError'},{title:'操作',key:'actions'}]"><template #bodyCell="{column,record}"><template v-if="column.key==='name'"><a-button v-if="can('iqc:schedule:detail:view')" type="link" :disabled="busy" @click="load(record)">{{record.name}}</a-button><span v-else>{{record.name}}</span></template><template v-if="column.dataIndex==='lastError'">{{record.privacy?.withheldFields?.includes('lastError')?'原因未展示':record.lastError||'—'}}</template><template v-if="column.key==='actions'"><a-button v-if="can('iqc:schedule:availability')" :disabled="busy||(!record.activeRevisionId&&record.status!=='ACTIVE')" @click="availability(record)">{{record.status==='ACTIVE'?'停用':'启用'}}</a-button></template></template></a-table><a-pagination :current="current" :total="total" :page-size="20" :disabled="busy||loading" @change="refresh"/>
<a-drawer :open="open" title="周期调度定义" width="900" :closable="!busy" :mask-closable="false" @close="close">
<a-alert type="info" message="默认停用；保存后发布，再显式启用。负责人固定为创建者，后端校验维护权。"/><a-alert v-if="selected" :message="`草稿修订 ${selected.draftRevision} · ${selected.status} · 下一计划 UTC ${selected.nextPlannedAtUtc??'无'} · 错误 ${restricted||selected.privacy?.withheldFields?.includes('lastError')?'原因未展示':selected.lastError??'无'}`"/>
<a-alert v-if="restricted" type="info" message="配置正文受限或需要重新读取，当前只展示元数据；不能用此副本编辑、预览或确认发布。"/><a-form v-if="!restricted" layout="vertical"><a-form-item label="编码"><a-input v-model:value="code" :disabled="!!selected||busy||!writable"/></a-form-item><a-form-item label="名称"><a-input v-model:value="name" :disabled="busy||!writable"/></a-form-item><a-form-item label="Cron（秒 分 时 日 月 星期）"><a-input v-model:value="definition.cron" :disabled="busy||!writable"/></a-form-item><a-form-item label="IANA 时区"><a-input v-model:value="definition.zoneId" :disabled="busy||!writable"/></a-form-item><a-form-item label="生效时间（ISO，含时区）"><a-input v-model:value="definition.effectiveFrom" :disabled="busy||!writable"/></a-form-item><a-form-item label="结束时间（可选 ISO）"><a-input v-model:value="definition.effectiveUntil" :disabled="busy||!writable"/></a-form-item><a-form-item label="错过计划策略" extra="计划时刻后有30秒宽限；超过宽限才按错过策略处理。"><a-select v-model:value="definition.misfirePolicy" :disabled="busy||!writable" :options="[{value:'SKIP',label:'跳过'},{value:'FIRE_LATEST',label:'执行最近一轮'},{value:'CATCH_UP',label:'有限补跑'}]"/></a-form-item><a-form-item label="每次最大补跑"><a-input-number v-model:value="definition.maximumCatchUp" :min="1" :max="100" :disabled="busy||!writable"/></a-form-item><a-form-item label="任务并发"><a-input-number v-model:value="definition.concurrency" :min="1" :max="32" :disabled="busy||!writable"/></a-form-item>
<a-alert v-if="catalogError" type="warning" :message="catalogError"/><a-form-item label="每实例使用当前灰度策略"><a-switch v-model:checked="rolloutMode" :disabled="busy||!writable||(!rolloutMode&&!can('iqc:pipeline:rollout:task:create'))"/><p v-if="rolloutMode">新计划实例首次物化时冻结当前灰度分配；扩量或回退只影响后续新实例，已有实例保留原版本和输入。</p></a-form-item><a-form-item :label="rolloutMode?'灰度流水线':'已发布流水线'"><a-select :value="targetPipelineId" :disabled="busy||!writable||pipelineLoading" :options="pipelines.map(p=>({value:p.id,label:p.name}))" @change="pipelineChanged"/><a-pagination :current="pipelinePage" :total="pipelineTotal" :page-size="20" :disabled="busy||pipelineLoading" @change="catalogs"/><a-select v-if="!rolloutMode&&definition.pipeline" v-model:value="definition.pipeline.versionNo" :disabled="busy||!writable" :options="pipelineVersions.map(v=>({value:v.versionNo,label:`v${v.versionNo} · ${v.contentHash}`}))"/><p>引用：{{targetPipelineId}} · {{rolloutMode?'实例创建时的灰度策略':`v${definition.pipeline?.versionNo??'未选择'}`}}</p></a-form-item>
<a-form-item label="已发布选择器"><SelectorAssetLibrary v-if="writable" :disabled="busy" @select="chooseSelector"/><p>{{selectorLabel||'尚未选择'}}</p></a-form-item><AutomaticRetryPolicyEditor v-model="definition.retryPolicy" :disabled="busy||!writable"/></a-form>
<a-space><a-button v-if="writable" type="primary" :disabled="busy" @click="save">保存草稿</a-button><a-button v-if="can('iqc:schedule:publish')&&selected" :disabled="restricted||busy||dirty" @click="publish">发布修订</a-button><a-button v-if="can('iqc:schedule:preview')" :disabled="restricted||busy" @click="preview">预览计划 UTC</a-button><a-button v-if="selected" :disabled="busy" @click="reload">重新加载</a-button></a-space><a-list :data-source="times"><template #renderItem="{item}"><a-list-item>{{item}}</a-list-item></template></a-list>
<a-alert v-if="detailError" type="warning" :message="detailError"/><template v-if="selected"><a-button :disabled="busy" @click="details(instancePage)">刷新版本与实例</a-button><h3 v-if="can('iqc:schedule:versions:view')">不可变版本</h3><a-collapse v-if="can('iqc:schedule:versions:view')"><a-collapse-panel v-for="v in history" :key="v.id" :header="`v${v.versionNo} · 修订 ${v.sourceDraftRevision} · ${v.contentHash}`"><pre v-if="!isRestricted(v)">{{v.snapshotJson||'未包含快照正文'}}</pre><p v-else>版本正文受权限限制，版本号与原摘要保持。</p></a-collapse-panel></a-collapse><h3 v-if="can('iqc:schedule:instances:view')">周期实例</h3><a-table v-if="can('iqc:schedule:instances:view')" :data-source="instances" row-key="id" :pagination="false" :columns="[{title:'任务',key:'task'},{title:'状态',dataIndex:'status'},{title:'当前 EID',dataIndex:'currentExecutionId'},{title:'计划时间',dataIndex:'scheduledTime'}]"><template #bodyCell="{column,record}"><template v-if="column.key==='task'"><router-link v-if="can('iqc:task:view')" :to="{path:'/tasks',query:{taskId:record.id}}">{{record.name}}</router-link><span v-else>{{record.name}} · {{record.id}}</span></template></template></a-table><a-pagination v-if="can('iqc:schedule:instances:view')" :current="instancePage" :total="instanceTotal" :page-size="20" :disabled="busy" @change="details"/></template>
<TriggerAttemptHistory v-if="selected && open" kind="PERIODIC" :parent-id="selected.id"/></a-drawer></div>
</template>
<style scoped>.schedules{padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}h3{margin-top:20px}</style>
