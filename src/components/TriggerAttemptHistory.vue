<script setup lang="ts">
import {onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listTriggerAttempts,type TriggerAttempt,type TriggerKind} from '@/api/trigger-attempts';
const props=defineProps<{kind:TriggerKind;parentId:string}>();
const {can}=usePermission();
const rows=ref<TriggerAttempt[]>([]),current=ref(1),total=ref(0),loading=ref(false),error=ref('');
let generation=0;
const stages={AUTHORIZATION:'授权检查',EXPIRATION:'过期处理',MATERIALIZATION:'物化处理'};
const outcomes={DOMAIN_COMMITTED:'本轮事务已提交',NO_CHANGE:'本轮未完成新物化',FAILED:'失败',UNCONFIRMED:'结果未确认'};
async function load(page=current.value){
  const ticket=++generation;rows.value=[];error.value='';
  if(!props.parentId||!can('iqc:trigger:attempts:view')){loading.value=false;total.value=0;return;}
  loading.value=true;
  try{const result=await listTriggerAttempts(props.kind,props.parentId,page);if(ticket===generation){rows.value=result.records;total.value=result.total;current.value=page;}}
  catch{if(ticket===generation)error.value='尝试历史未能加载，请重试。';}
  finally{if(ticket===generation)loading.value=false;}
}
watch([()=>props.kind,()=>props.parentId,()=>can('iqc:trigger:attempts:view')],()=>{current.value=1;total.value=0;void load(1);},{immediate:true});
onBeforeUnmount(()=>{++generation;});
</script>
<template>
<section v-if="can('iqc:trigger:attempts:view')">
<a-space><h3>触发尝试历史</h3><a-button :disabled="loading" @click="load()">刷新</a-button></a-space>
<a-alert type="info" message="触发历史仅供原负责人或有全范围权限的用户查看。本轮提交不代表模型执行成功；只有开始记录时，结果保持未确认。"/>
<a-alert v-if="error" type="error" :message="error"/>
<a-table :data-source="rows" row-key="attemptId" :loading="loading" :pagination="false" :scroll="{x:1100}"
:columns="[{title:'开始 UTC',dataIndex:'startedAtUtc'},{title:'完成 UTC',dataIndex:'finishedAtUtc'},{title:'本轮结果',key:'outcome'},{title:'处理单元',dataIndex:'processedUnits'},{title:'失败阶段',key:'stage'},{title:'错误码',dataIndex:'errorCode'},{title:'错误类型',dataIndex:'errorType'},{title:'计划/事件 UTC',dataIndex:'plannedAtUtc'}]">
<template #bodyCell="{column,record}"><template v-if="column.key==='outcome'"><a-tag :color="record.outcome==='FAILED'?'red':record.outcome==='UNCONFIRMED'?'orange':'blue'">{{outcomes[record.outcome as keyof typeof outcomes]||record.outcome}}</a-tag></template><template v-else-if="column.key==='stage'">{{record.failureStage?stages[record.failureStage as keyof typeof stages]||record.failureStage:'—'}}</template></template>
</a-table>
<a-pagination :current="current" :total="total" :page-size="20" :disabled="loading" @change="load"/>
</section>
</template>
<style scoped>section{margin-top:20px}h3{margin:0}</style>
