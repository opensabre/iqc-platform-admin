<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listActionHistory,type ActionHistory} from '@/api/action-history';
const props=defineProps<{resultId:string}>();
const {can}=usePermission();
const allowed=computed(()=>can('iqc:action:history:view'));
const rows=ref<ActionHistory[]>([]),loading=ref(false),error=ref('');
let generation=0,alive=true;
const labels:Record<string,string>={PENDING:'待执行',RUNNING:'执行中',WAITING_RETRY:'等待重试',COMPLETE:'已完成',FAILED:'失败',REQUIRES_RECONCILIATION:'待核对',BLOCKED_ADAPTER:'适配器阻塞',BLOCKED_SOURCE:'来源阻塞',BLOCKED_AUTHORIZATION:'授权阻塞',EXPIRED:'已过期'};
const columns=[{title:'动作',dataIndex:'actionId',width:160},{title:'类型',dataIndex:'type',width:180},{title:'状态',key:'status',width:140},{title:'执行尝试',dataIndex:'attemptCount',width:100},{title:'最早重试 UTC',dataIndex:'nextAttemptAtUtc',width:190},{title:'结算时间 UTC',dataIndex:'settledAtUtc',width:190},{title:'结果引用',dataIndex:'resultReference',width:180},{title:'证据引用',dataIndex:'evidenceReference',width:180},{title:'原因代码',dataIndex:'errorCode',width:220}];
async function refresh(){
 if(!alive||!allowed.value||!props.resultId)return;
 const ticket=++generation,id=props.resultId;loading.value=true;error.value='';rows.value=[];
 try{
  const data=await listActionHistory(id);
  if(!Array.isArray(data)||data.length>100||data.some(row=>!row||typeof row.id!=='string'||typeof row.actionId!=='string'||typeof row.type!=='string'||typeof row.status!=='string'||row.attemptCount!==null&&(!Number.isInteger(row.attemptCount)||row.attemptCount<0)))throw Error('Invalid action records');
  if(alive&&ticket===generation&&allowed.value)rows.value=data;
 }catch{if(alive&&ticket===generation)error.value='动作记录加载失败，请刷新重试。';}
 finally{if(alive&&ticket===generation)loading.value=false;}
}
watch([()=>props.resultId,allowed],()=>{generation++;rows.value=[];error.value='';loading.value=false;if(allowed.value)void refresh();},{immediate:true});
onBeforeUnmount(()=>{alive=false;generation++;rows.value=[];});
</script>
<template><section v-if="allowed" class="action-history"><a-space><h3>动作执行记录</h3><a-button :loading="loading" @click="refresh">刷新</a-button></a-space><p>动作状态与机器分析结论分别记录。</p><a-alert v-if="error" type="error" :message="error"/><a-table v-else :loading="loading" :data-source="rows" :columns="columns" row-key="id" size="small" :pagination="false" :scroll="{x:1540}" :locale="{emptyText:loading?'加载中':'暂无动作记录'}"><template #bodyCell="{column,record,text}"><template v-if="column.key==='status'">{{labels[record.status]||record.status}}</template><template v-else>{{text ?? '—'}}</template></template></a-table></section></template>
<style scoped>.action-history{margin:20px 0}.action-history p{overflow-wrap:anywhere}.action-history .ant-alert{margin:8px 0}</style>
