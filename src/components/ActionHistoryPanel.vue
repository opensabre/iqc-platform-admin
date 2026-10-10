<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listActionHistory,requestActionDiscovery,reconcileAction,type ActionHistory} from '@/api/action-history';
const props=defineProps<{resultId:string}>();
const {can}=usePermission();
const allowed=computed(()=>can('iqc:action:history:view'));
const canRequest=computed(()=>can('iqc:action:enqueue'));
const canReconcile=computed(()=>can('iqc:action:reconcile'));
const selected=ref<ActionHistory|null>(null),reason=ref(''),reconciling=ref(false),reconcileMessage=ref(''),reconcileError=ref('');
let reconciliationGeneration=0;
const localReceiptTypes=new Set(['SAVE_RESULT','CREATE_REVIEW','ADD_TO_EVALUATION_CANDIDATE']);
function eligible(row:ActionHistory){return canReconcile.value&&row.status==='REQUIRES_RECONCILIATION'&&row.outcome==='UNKNOWN'&&localReceiptTypes.has(row.type)&&Number.isSafeInteger(row.version)&&(row.version??0)>0;}
function openReconciliation(row:ActionHistory){
 if(!alive||!allowed.value||reconciling.value||!eligible(row))return;
 selected.value={...row};reason.value='';reconcileError.value='';reconcileMessage.value='';
}
function cancelReconciliation(){if(!reconciling.value){selected.value=null;reason.value='';}}
async function confirmReconciliation(){
 const row=selected.value,comment=reason.value.trim();
 if(!alive||!allowed.value||!row||!eligible(row)||reconciling.value||!props.resultId)return;
 if(!comment||comment.length>1000){reconcileError.value='请填写不超过1000字的核对原因。';return;}
 const ticket=++reconciliationGeneration,id=props.resultId;
 reconciling.value=true;reconcileMessage.value='';reconcileError.value='';
 try{
  const data=await reconcileAction(id,row.id,row.version!,comment);
  if(!data||data.id!==row.id||!['CONFIRMED','UNCONFIRMED','STALE_OBSERVATION'].includes(data.state))throw Error('Invalid reconciliation response');
  if(alive&&ticket===reconciliationGeneration&&allowed.value&&canReconcile.value){
   reconcileMessage.value=data.state==='CONFIRMED'?'已确认实际产物，动作已完成。':data.state==='UNCONFIRMED'?'未取得实际产物确认，动作继续等待核对。':'动作状态已变化，请查看刷新后的记录。';
   selected.value=null;reason.value='';void refresh();
  }
 }catch{if(alive&&ticket===reconciliationGeneration)reconcileError.value='核对请求未确认，请刷新查看当前状态。';}
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
 const ticket=++generation,id=props.resultId;loading.value=true;error.value='';rows.value=[];
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
watch([()=>props.resultId,allowed,canReconcile],()=>{reconciliationGeneration++;selected.value=null;reason.value='';reconciling.value=false;reconcileMessage.value='';reconcileError.value='';});
watch([()=>props.resultId,allowed,canRequest],()=>{requestGeneration++;requesting.value=false;requestMessage.value='';requestError.value='';});
watch([()=>props.resultId,allowed],()=>{generation++;rows.value=[];error.value='';loading.value=false;if(allowed.value)void refresh();},{immediate:true});
onBeforeUnmount(()=>{alive=false;generation++;requestGeneration++;reconciliationGeneration++;rows.value=[];});
</script>
<template><section v-if="allowed" class="action-history"><a-space><h3>动作执行记录</h3><a-button :loading="loading" :disabled="reconciling" @click="refresh">刷新</a-button><a-button v-if="canRequest" :loading="requesting" @click="requestCheck">检查结果动作</a-button></a-space><p>动作状态与机器分析结论分别记录。</p><a-alert v-if="requestMessage" type="info" :message="requestMessage"/><a-alert v-if="requestError" type="error" :message="requestError"/><a-alert v-if="reconcileMessage" type="info" :message="reconcileMessage"/><a-alert v-if="reconcileError" type="error" :message="reconcileError"/><a-alert v-if="error" type="error" :message="error"/><a-table v-else :loading="loading" :data-source="rows" :columns="columns" row-key="id" size="small" :pagination="false" :scroll="{x:1540}" :locale="{emptyText:loading?'加载中':'暂无动作记录'}"><template #bodyCell="{column,record,text}"><template v-if="column.key==='status'">{{labels[record.status]||record.status}}</template><template v-else-if="column.key==='operation'"><a-button v-if="eligible(record)" :disabled="reconciling||loading" @click="openReconciliation(record)">核对实际产物</a-button><span v-else>—</span></template><template v-else>{{text ?? '—'}}</template></template></a-table><a-modal :open="!!selected" title="核对实际产物" :confirm-loading="reconciling" :closable="!reconciling" :keyboard="!reconciling" :mask-closable="false" :cancel-button-props="{disabled:reconciling}" ok-text="核对" cancel-text="取消" @ok="confirmReconciliation" @cancel="cancelReconciliation"><p>动作：{{selected?.actionId}}</p><p>仅查询您原始动作的已保存产物；没有确认产物时保持待核对。</p><label for="action-reconciliation-reason">核对原因</label><a-textarea id="action-reconciliation-reason" v-model:value="reason" :maxlength="1000" :disabled="reconciling" :rows="3"/><a-alert v-if="reconcileError" type="error" :message="reconcileError"/></a-modal></section></template>
<style scoped>.action-history{margin:20px 0}.action-history p{overflow-wrap:anywhere}.action-history .ant-alert{margin:8px 0}</style>
