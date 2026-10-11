<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listActionHistory,requestActionDiscovery,reconcileAction,recoverAction,type ActionHistory,type ActionStateEvent,type ActionEventState,type ActionAttempt} from '@/api/action-history';
const props=defineProps<{resultId:string}>();
const {can}=usePermission();
const allowed=computed(()=>can('iqc:action:history:view'));
const canRequest=computed(()=>can('iqc:action:enqueue'));
const canReconcile=computed(()=>can('iqc:action:reconcile'));
const canRecover=computed(()=>can('iqc:action:recover'));
const operation=ref<'reconcile'|'recover'>('reconcile');
const journalAction=ref<string|null>(null),journalName=ref(''),journalRows=ref<ActionStateEvent[]>([]),journalLoading=ref(false),journalError=ref(''),journalNext=ref<string|null>(null),journalGap=ref(false);
let journalGeneration=0;
function closeJournal(){journalGeneration++;journalAction.value=null;journalName.value='';journalRows.value=[];journalNext.value=null;journalError.value='';journalGap.value=false;journalLoading.value=false;}
function compareVersion(a:string,b:string){return a.length-b.length||(a<b?-1:a>b?1:0);}
function validVersion(v:unknown):v is string {return typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&compareVersion(v,'9223372036854775807')<=0;}
function validState(state:unknown):state is ActionEventState {
 if(!state||typeof state!=='object')return false;
 const s=state as ActionEventState;
 return typeof s.status==='string'&&Number.isSafeInteger(s.attemptCount)&&s.attemptCount>=0&&['claimedAtUtc','settledAtUtc','nextAttemptAtUtc','outcome','evidenceReference','resultReference','errorCode'].every(k=>s[k as keyof ActionEventState]===null||typeof s[k as keyof ActionEventState]==='string');
}
async function loadJournal(more=false){
 const actionId=journalAction.value,before=more?journalNext.value:null;
 if(!alive||!allowed.value||!actionId||journalLoading.value||more&&!before)return;
 const ticket=++journalGeneration,id=props.resultId;journalLoading.value=true;journalError.value='';
 try{
  const data=await listActionHistory(id,{actionExecutionId:actionId,includeHistory:true,...(before?{beforeVersion:before}:{})});
  const page=Array.isArray(data)&&data.length===1&&data[0]?.id===actionId?data[0].history:null;
  if(!page||!Array.isArray(page.events)||page.events.length>50||typeof page.earlierHistoryUnavailable!=='boolean')throw Error('Invalid action journal');
  let boundary=before;
  for(const event of page.events){
   if(!event||!validVersion(event.version)||boundary!==null&&compareVersion(event.version,boundary)>=0||!validState(event.state)||typeof event.recordedAtUtc!=='string'||event.actor!==null&&typeof event.actor!=='string')throw Error('Invalid action journal event');
   if(event.previousVersion!==null&&(!validVersion(event.previousVersion)||compareVersion(event.previousVersion,event.version)>=0||!validState(event.previousState))||event.previousVersion===null&&event.previousState!==null)throw Error('Invalid action journal predecessor');
   if(event.reconciliationReason!=null&&(typeof event.reconciliationReason!=='string'||event.reconciliationReason.length>1000))throw Error('Invalid reconciliation reason');
   if(event.recoveryReason!=null&&(typeof event.recoveryReason!=='string'||event.recoveryReason.length>1000))throw Error('Invalid recovery reason');
   boundary=event.version;
  }
  if(page.nextBeforeVersion!==null&&(!validVersion(page.nextBeforeVersion)||page.events.length!==50||page.nextBeforeVersion!==page.events.at(-1)?.version||page.earlierHistoryUnavailable))throw Error('Invalid action journal cursor');
  if(alive&&ticket===journalGeneration&&allowed.value){journalRows.value=more?[...journalRows.value,...page.events]:page.events;journalNext.value=page.nextBeforeVersion;journalGap.value=page.earlierHistoryUnavailable;}
 }catch{if(alive&&ticket===journalGeneration)journalError.value='动作历史加载失败，请重试。';}
 finally{if(alive&&ticket===journalGeneration)journalLoading.value=false;}
}
function openJournal(row:ActionHistory){if(!alive||!allowed.value||reconciling.value||loading.value)return;closeJournal();journalAction.value=row.id;journalName.value=row.actionId;void loadJournal();}
const observationAction=ref<string|null>(null),observationName=ref(''),observationRows=ref<ActionAttempt[]>([]),observationLoading=ref(false),observationError=ref(''),observationNext=ref<string|null>(null);
let observationGeneration=0;
const observationLabels:Record<string,string>={STARTED:'核对结果尚未持久确认',CONFIRMED:'已确认实际产物',UNCONFIRMED:'未取得实际产物确认',STALE_OBSERVATION:'观察版本已失效',LOOKUP_FAILED:'核对未完成'};
function closeObservations(){observationGeneration++;observationAction.value=null;observationName.value='';observationRows.value=[];observationLoading.value=false;observationError.value='';observationNext.value=null;}
function observationKey(row:ActionAttempt){return `${new Date(row.startedAtUtc+'Z').toISOString().slice(0,-1)}~${row.id}`;}
function validObservationTime(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(value)||value.slice(0,4)<'1000')return false;
 const parsed=new Date(value+'Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19)===value.slice(0,19);
}
function validObservationCursor(value:unknown):value is string {return typeof value==='string'&&value.length===56&&validObservationTime(value.slice(0,23))&&value[23]==='~'&&/^[a-f0-9]{32}$/.test(value.slice(24));}
async function loadObservations(more=false){
 const actionId=observationAction.value,before=more?observationNext.value:null;
 if(!alive||!allowed.value||!actionId||observationLoading.value||more&&!before)return;
 const ticket=++observationGeneration,id=props.resultId;observationLoading.value=true;observationError.value='';
 try {
  const data=await listActionHistory(id,{actionExecutionId:actionId,includeAttempts:true,...(before?{beforeAttempt:before}:{})});
  const page=Array.isArray(data)&&data.length===1&&data[0]?.id===actionId?data[0].attempts:null;
  if(!page||!Array.isArray(page.attempts)||page.attempts.length>50)throw Error('Invalid observations');
  let boundary=before;
  for(const row of page.attempts){
   if(!row||typeof row.id!=='string'||!/^[a-f0-9]{32}$/.test(row.id)||!validVersion(row.observedVersion)||row.observedVersion==='0'||typeof row.actor!=='string'||typeof row.reason!=='string'||row.reason.length>1000||!Object.hasOwn(observationLabels,row.state)||!validObservationTime(row.startedAtUtc))throw Error('Invalid observation');
   const key=observationKey(row);
   if(boundary!==null&&key>=boundary)throw Error('Invalid observation order');
   if(row.state==='STARTED'?(row.finishedAtUtc!==null||row.confirmedVersion!==null):(!validObservationTime(row.finishedAtUtc)||new Date(row.finishedAtUtc+'Z').getTime()<new Date(row.startedAtUtc+'Z').getTime()))throw Error('Invalid observation terminal time');
   if(row.state==='CONFIRMED'?(!validVersion(row.confirmedVersion)||BigInt(row.confirmedVersion)!==BigInt(row.observedVersion)+1n):row.confirmedVersion!==null)throw Error('Invalid observation confirmation');
   boundary=key;
  }
  if(page.nextBeforeAttempt!==null&&(!validObservationCursor(page.nextBeforeAttempt)||page.attempts.length!==50||page.nextBeforeAttempt!==boundary))throw Error('Invalid observation cursor');
  if(alive&&ticket===observationGeneration&&allowed.value){observationRows.value=more?[...observationRows.value,...page.attempts]:page.attempts;observationNext.value=page.nextBeforeAttempt;}
 } catch {if(alive&&ticket===observationGeneration)observationError.value='核对尝试加载失败，请重试。';}
 finally {if(alive&&ticket===observationGeneration)observationLoading.value=false;}
}
function openObservations(row:ActionHistory){if(!alive||!allowed.value||reconciling.value||loading.value)return;closeObservations();observationAction.value=row.id;observationName.value=row.actionId;void loadObservations();}
const selected=ref<ActionHistory|null>(null),reason=ref(''),reconciling=ref(false),reconcileMessage=ref(''),reconcileError=ref('');
let reconciliationGeneration=0;
const localReceiptTypes=new Set(['SAVE_RESULT','UPDATE_LABEL','CREATE_RISK_EVENT','CREATE_REVIEW','ADD_TO_EVALUATION_CANDIDATE']);
function eligible(row:ActionHistory){return canReconcile.value&&row.status==='REQUIRES_RECONCILIATION'&&row.outcome==='UNKNOWN'&&localReceiptTypes.has(row.type)&&Number.isSafeInteger(row.version)&&(row.version??0)>0;}
function recoverable(row:ActionHistory){return canRecover.value&&['BLOCKED_SOURCE','BLOCKED_AUTHORIZATION','BLOCKED_ADAPTER'].includes(row.status)&&Number.isSafeInteger(row.version)&&(row.version??-1)>=0&&(row.attemptCount===0&&row.outcome===null||Number.isSafeInteger(row.attemptCount)&&(row.attemptCount??0)>0&&row.outcome==='CONFIRMED_RETRYABLE_FAILURE');}
function openRecovery(row:ActionHistory){if(!alive||!allowed.value||reconciling.value||loading.value||!recoverable(row))return;operation.value='recover';selected.value={...row};reason.value='';reconcileError.value='';reconcileMessage.value='';}
function openReconciliation(row:ActionHistory){
 if(!alive||!allowed.value||reconciling.value||!eligible(row))return;
 operation.value='reconcile';selected.value={...row};reason.value='';reconcileError.value='';reconcileMessage.value='';
}
function cancelReconciliation(){if(!reconciling.value){selected.value=null;reason.value='';}}
async function confirmReconciliation(){
 const row=selected.value,comment=reason.value.trim();
 if(!alive||!allowed.value||!row||!(operation.value==='recover'?recoverable(row):eligible(row))||reconciling.value||!props.resultId)return;
 if(!comment||comment.length>1000){reconcileError.value='请填写不超过1000字的操作原因。';return;}
 const ticket=++reconciliationGeneration,id=props.resultId,recover=operation.value==='recover';
 reconciling.value=true;reconcileMessage.value='';reconcileError.value='';
 try{
  const data=recover?await recoverAction(id,row.id,row.version!,comment):await reconcileAction(id,row.id,row.version!,comment);
  if(!data||data.id!==row.id||!(recover?['RECOVERED','NOT_RECOVERED']:['CONFIRMED','UNCONFIRMED','STALE_OBSERVATION']).includes(data.state))throw Error('Invalid reconciliation response');
  if(alive&&ticket===reconciliationGeneration&&allowed.value&&(recover?canRecover.value:canReconcile.value)){
   reconcileMessage.value=recover?(data.state==='RECOVERED'?'已恢复等待检查，请刷新查看后续执行记录。':'未恢复，请检查当前状态、授权和动作政策。'):data.state==='CONFIRMED'?'已确认实际产物，动作已完成。':data.state==='UNCONFIRMED'?'未取得实际产物确认，动作继续等待核对。':'动作状态已变化，请查看刷新后的记录。';
   selected.value=null;reason.value='';void refresh();
  }
 }catch{if(alive&&ticket===reconciliationGeneration)reconcileError.value=recover?'恢复请求未确认，请刷新查看当前状态。':'核对请求未确认，请刷新查看当前状态。';}
 finally{if(alive&&ticket===reconciliationGeneration)reconciling.value=false;}
}
const requesting=ref(false),requestMessage=ref(''),requestError=ref('');
let requestGeneration=0;
const rows=ref<ActionHistory[]>([]),loading=ref(false),error=ref('');
let generation=0,alive=true;
const labels:Record<string,string>={PENDING:'待执行',RUNNING:'执行中',WAITING_RETRY:'等待重试',COMPLETE:'已完成',FAILED:'失败',REQUIRES_RECONCILIATION:'待核对',BLOCKED_ADAPTER:'适配器阻塞',BLOCKED_SOURCE:'来源阻塞',BLOCKED_AUTHORIZATION:'授权阻塞',EXPIRED:'已过期'};
const columns=[{title:'动作',dataIndex:'actionId',width:160},{title:'类型',dataIndex:'type',width:180},{title:'状态',key:'status',width:140},{title:'执行尝试',dataIndex:'attemptCount',width:100},{title:'下次检查/重试 UTC',dataIndex:'nextAttemptAtUtc',width:190},{title:'结算时间 UTC',dataIndex:'settledAtUtc',width:190},{title:'结果引用',dataIndex:'resultReference',width:180},{title:'证据引用',dataIndex:'evidenceReference',width:180},{title:'原因代码',dataIndex:'errorCode',width:220},{title:'操作',key:'operation',width:140}];
async function refresh(){
 if(!alive||!allowed.value||!props.resultId)return;
 reconciliationGeneration++;selected.value=null;reason.value='';reconciling.value=false;closeJournal();closeObservations();const ticket=++generation,id=props.resultId;loading.value=true;error.value='';rows.value=[];
 try{
  const data=await listActionHistory(id);
  if(!Array.isArray(data)||data.length>100||data.some(row=>!row||typeof row.id!=='string'||typeof row.actionId!=='string'||typeof row.type!=='string'||typeof row.status!=='string'||row.version!=null&&(!Number.isInteger(row.version)||row.version<0)||row.attemptCount!==null&&(!Number.isInteger(row.attemptCount)||row.attemptCount<0)))throw Error('Invalid action records');
  if(alive&&ticket===generation&&allowed.value)rows.value=data;
 }catch{if(alive&&ticket===generation)error.value='动作记录加载失败，请刷新重试。';}
 finally{if(alive&&ticket===generation)loading.value=false;}
}
async function requestCheck(){
 if(!alive||!allowed.value||!canRequest.value||requesting.value||!props.resultId)return;
 const ticket=++requestGeneration,id=props.resultId;requesting.value=true;requestMessage.value='';requestError.value='';
 try{
  const data=await requestActionDiscovery(id);
  if(!data||data.sourceResultId!==id||!['DISCOVERY_REQUESTED','ALREADY_DISCOVERED'].includes(data.status))throw Error('Invalid discovery response');
  if(alive&&ticket===requestGeneration&&allowed.value&&canRequest.value){
   requestMessage.value=data.status==='DISCOVERY_REQUESTED'?'已安排动作检查，请稍后刷新查看执行记录。':'该结果已完成动作检查。';
   void refresh();
  }
 }catch{if(alive&&ticket===requestGeneration)requestError.value='动作检查请求失败，请确认该结果属于您且动作处理已启用。';}
 finally{if(alive&&ticket===requestGeneration)requesting.value=false;}
}
watch([()=>props.resultId,allowed],()=>{closeJournal();closeObservations();});
watch([()=>props.resultId,allowed,canReconcile,canRecover],()=>{reconciliationGeneration++;selected.value=null;reason.value='';reconciling.value=false;reconcileMessage.value='';reconcileError.value='';});
watch([()=>props.resultId,allowed,canRequest],()=>{requestGeneration++;requesting.value=false;requestMessage.value='';requestError.value='';});
watch([()=>props.resultId,allowed],()=>{generation++;rows.value=[];error.value='';loading.value=false;if(allowed.value)void refresh();},{immediate:true});
onBeforeUnmount(()=>{closeJournal();closeObservations();alive=false;generation++;requestGeneration++;reconciliationGeneration++;rows.value=[];});
</script>
<template><section v-if="allowed" class="action-history"><a-space><h3>动作执行记录</h3><a-button :loading="loading" :disabled="reconciling" @click="refresh">刷新</a-button><a-button v-if="canRequest" :loading="requesting" @click="requestCheck">检查结果动作</a-button></a-space><p>动作状态与机器分析结论分别记录。</p><a-alert v-if="requestMessage" type="info" :message="requestMessage"/><a-alert v-if="requestError" type="error" :message="requestError"/><a-alert v-if="reconcileMessage" type="info" :message="reconcileMessage"/><a-alert v-if="reconcileError" type="error" :message="reconcileError"/><a-alert v-if="error" type="error" :message="error"/><a-table v-else :loading="loading" :data-source="rows" :columns="columns" row-key="id" size="small" :pagination="false" :scroll="{x:1540}" :locale="{emptyText:loading?'加载中':'暂无动作记录'}"><template #bodyCell="{column,record,text}"><template v-if="column.key==='status'">{{labels[record.status]||record.status}}</template><template v-else-if="column.key==='operation'"><a-button :disabled="reconciling||loading" @click="openJournal(record)">查看历史</a-button><a-button :disabled="reconciling||loading" @click="openObservations(record)">查看核对尝试</a-button><a-button v-if="recoverable(record)" :disabled="reconciling||loading" @click="openRecovery(record)">恢复阻塞动作</a-button><a-button v-if="eligible(record)" :disabled="reconciling||loading" @click="openReconciliation(record)">核对实际产物</a-button></template><template v-else>{{text ?? '—'}}</template></template></a-table><a-modal :open="!!selected" :title="operation==='recover'?'恢复阻塞动作':'核对实际产物'" :confirm-loading="reconciling" :closable="!reconciling" :keyboard="!reconciling" :mask-closable="false" :cancel-button-props="{disabled:reconciling}" :ok-text="operation==='recover'?'恢复':'核对'" cancel-text="取消" @ok="confirmReconciliation" @cancel="cancelReconciliation"><p>动作：{{selected?.actionId}}</p><p v-if="operation==='recover'">重新检查原始动作的来源、授权和政策；恢复后由后台继续处理，原回执保留。</p><p v-else>仅查询您原始动作的已保存产物；没有确认产物时保持待核对。</p><label for="action-reconciliation-reason">{{operation==='recover'?'恢复原因':'核对原因'}}</label><a-textarea id="action-reconciliation-reason" v-model:value="reason" :maxlength="1000" :disabled="reconciling" :rows="3"/><a-alert v-if="reconcileError" type="error" :message="reconcileError"/></a-modal><a-modal :open="!!journalAction" :title="`动作历史：${journalName}`" :footer="null" @cancel="closeJournal">
<p>以下记录按变更顺序由新到旧展示。领取次数不证明动作已经发送。</p>
<a-alert v-if="journalError" type="error" :message="journalError"/>
<p v-if="journalLoading">加载中</p>
<p v-if="!journalLoading&&!journalRows.length&&!journalError">暂无保存的历史记录。</p>
<ol class="journal-events"><li v-for="event in journalRows" :key="event.version">
<strong>{{labels[event.state.status]||event.state.status}}</strong> · 领取次数 {{event.state.attemptCount}}
<p>记录时间 UTC：{{event.recordedAtUtc}} · 操作人：{{event.actor??'—'}}</p>
<p v-if="event.recoveryReason">恢复原因：{{event.recoveryReason}}</p><p v-if="event.reconciliationReason">核对原因：{{event.reconciliationReason}}</p>
<p v-if="event.state.outcome">确认结果：{{event.state.outcome}}</p>
<p v-if="event.state.claimedAtUtc">领取时间 UTC：{{event.state.claimedAtUtc}}</p>
<p v-if="event.state.settledAtUtc">结算时间 UTC：{{event.state.settledAtUtc}}</p>
<p v-if="event.state.nextAttemptAtUtc">下次检查/重试 UTC：{{event.state.nextAttemptAtUtc}}</p>
<p v-if="event.state.resultReference">结果引用：{{event.state.resultReference}}</p>
<p v-if="event.state.evidenceReference">证据引用：{{event.state.evidenceReference}}</p>
<p v-if="event.state.errorCode">原因代码：{{event.state.errorCode}}</p>
<p v-if="event.previousState">变更前：{{labels[event.previousState.status]||event.previousState.status}} · 领取次数 {{event.previousState.attemptCount}}<span v-if="event.previousState.outcome"> · {{event.previousState.outcome}}</span><span v-if="event.previousState.evidenceReference"> · 证据 {{event.previousState.evidenceReference}}</span><span v-if="event.previousState.resultReference"> · 结果 {{event.previousState.resultReference}}</span><span v-if="event.previousState.errorCode"> · {{event.previousState.errorCode}}</span></p>
</li></ol>
<a-alert v-if="journalGap" type="info" message="较早的动作历史未保留；日志启用前的过程无法完整还原。"/>
<a-button v-if="journalNext" :loading="journalLoading" :disabled="journalLoading" @click="loadJournal(true)">加载更早记录</a-button>
<a-button v-if="journalError" :disabled="journalLoading" @click="loadJournal(!!journalNext)">重试加载</a-button>
<a-button @click="closeJournal">关闭历史</a-button>
</a-modal><a-modal :open="!!observationAction" :title="`核对尝试：${observationName}`" :footer="null" @cancel="closeObservations">
<p>核对尝试按开始时间由新到旧展示。核对结果尚未持久确认时，不能据此判断动作失败或重发。</p>
<a-alert v-if="observationError" type="error" :message="observationError"/>
<p v-if="observationLoading">加载中</p>
<p v-if="!observationLoading&&!observationRows.length&&!observationError">暂无保存的核对尝试；较早请求可能未保留。</p>
<ol class="observation-events"><li v-for="row in observationRows" :key="row.id">
<strong>{{observationLabels[row.state]}}</strong>
<p>核对原因：{{row.reason}}</p><p>操作人：{{row.actor}} · 观察版本：{{row.observedVersion}}</p>
<p>开始时间 UTC：{{row.startedAtUtc}}</p><p v-if="row.finishedAtUtc">结束时间 UTC：{{row.finishedAtUtc}}</p>
<p v-if="row.confirmedVersion">确认版本：{{row.confirmedVersion}}</p>
</li></ol>
<a-button v-if="observationNext" :loading="observationLoading" :disabled="observationLoading" @click="loadObservations(true)">加载更早核对</a-button>
<a-button v-if="observationError" :disabled="observationLoading" @click="loadObservations(!!observationNext)">重试核对记录</a-button>
<a-button @click="closeObservations">关闭核对记录</a-button>
</a-modal></section></template>
<style scoped>.action-history{margin:20px 0}.action-history p{overflow-wrap:anywhere}.action-history .ant-alert{margin:8px 0}.journal-events,.observation-events{padding-left:24px;max-height:55vh;overflow:auto}.journal-events li,.observation-events li{margin:16px 0;overflow-wrap:anywhere}.journal-events p,.observation-events p{margin:4px 0}</style>
