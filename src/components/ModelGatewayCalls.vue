<script setup lang="ts">
import {onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listModelCalls,type ModelCall,type ModelCallStatus} from '@/api/model-gateway';
const {can}=usePermission();
const rows=ref<ModelCall[]>([]),loading=ref(false),error=ref(''),current=ref(1),total=ref(0),status=ref<ModelCallStatus>();
let generation=0;
const states={RESERVED:'响应未确认',CONFIRMED:'响应已确认',UNKNOWN:'请求结果未知'};
const usageStates={COMPLETE:'完整用量',PARTIAL:'部分用量',MISSING:'用量未知',INVALID:'用量无效'};
async function load(page=current.value){
  const ticket=++generation;rows.value=[];error.value='';
  if(!can('iqc:model-gateway:calls:view')){loading.value=false;total.value=0;return;}
  loading.value=true;
  try{const result=await listModelCalls(status.value,page);if(ticket===generation){rows.value=result.records;current.value=page;total.value=result.total;}}
  catch{if(ticket===generation)error.value='模型调用记录未能加载，请重试。';}
  finally{if(ticket===generation)loading.value=false;}
}
watch([status,()=>can('iqc:model-gateway:calls:view')],()=>{current.value=1;total.value=0;void load(1);},{immediate:true});
onBeforeUnmount(()=>{generation++;});
</script>
<template>
<section v-if="can('iqc:model-gateway:calls:view')">
<a-space><h3>模型调用记录</h3><a-select v-model:value="status" allow-clear placeholder="全部状态" style="width:160px" :options="[{value:'RESERVED',label:'响应未确认'},{value:'CONFIRMED',label:'响应已确认'},{value:'UNKNOWN',label:'请求结果未知'}]"/><a-button :disabled="loading" @click="load()">刷新</a-button></a-space>
<a-alert type="info" message="这里展示全局模型调用。响应已确认不代表质检成功；用量缺失显示未知。未确认请求继续占用并发额度，避免超限。"/>
<a-alert v-if="error" type="error" :message="error"/>
<a-table :data-source="rows" :loading="loading" row-key="callId" :pagination="false" :scroll="{x:1600}" :columns="[{title:'开始 UTC',dataIndex:'reservedAtUtc'},{title:'完成 UTC',dataIndex:'settledAtUtc'},{title:'响应状态',key:'status'},{title:'用量状态',key:'usageStatus'},{title:'输入 Token',key:'inputTokens'},{title:'输出 Token',key:'outputTokens'},{title:'总 Token',key:'totalTokens'},{title:'响应模型',dataIndex:'responseModelId'},{title:'规则',dataIndex:'ruleId'},{title:'逻辑记录',dataIndex:'logicalRecordId'},{title:'模型键',dataIndex:'modelKey'},{title:'错误类型',dataIndex:'errorType'}]">
<template #bodyCell="{column,record}"><template v-if="column.key==='status'"><a-tag :color="record.status==='CONFIRMED'?'blue':'orange'">{{states[record.status as ModelCallStatus]}}</a-tag></template><template v-else-if="column.key==='usageStatus'">{{record.usageStatus?usageStates[record.usageStatus as keyof typeof usageStates]:'未知'}}</template><template v-else-if="['inputTokens','outputTokens','totalTokens'].includes(column.key)">{{record[column.key]??'未知'}}</template></template>
</a-table>
<a-pagination :current="current" :total="total" :page-size="20" :disabled="loading" @change="load"/>
</section>
</template>
<style scoped>section{margin-top:24px}h3{margin:0}</style>
