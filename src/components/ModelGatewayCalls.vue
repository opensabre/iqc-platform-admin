<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {message} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import {listModelCalls,listTaskModelCalls,getModelCapacity,configureModelCapacity,releaseModelCapacity,type ModelCall,type ModelCallStatus,type ModelCapacity,type CapacityReleaseReason,type CostSummary} from '@/api/model-gateway';
const props=defineProps<{taskId?:string;executionId?:string}>();
const {can}=usePermission();
const authorized=computed(()=>props.taskId?can('iqc:task:model-calls:view'):can('iqc:model-gateway:calls:view'));
const rows=ref<ModelCall[]>([]),loading=ref(false),error=ref(''),current=ref(1),total=ref(0),status=ref<ModelCallStatus>();
const summary=ref<CostSummary>();
let generation=0,capacityGeneration=0;
const capacity=ref<ModelCapacity>(),capacityOpen=ref(false),capacityLoading=ref(false),limit=ref(0),saving=ref(false);
const releaseCall=ref<ModelCall>(),releaseOpen=ref(false),reason=ref<CapacityReleaseReason>('REMOTE_COMPLETED'),evidence=ref(''),remoteStopped=ref(false);
async function inspectCapacity(row:ModelCall){const ticket=++capacityGeneration;capacity.value=undefined;capacityOpen.value=true;capacityLoading.value=true;
  try{const result=await getModelCapacity(row.modelKey);if(ticket===capacityGeneration){capacity.value=result;limit.value=result.concurrencyLimit;}}
  catch{if(ticket===capacityGeneration)message.error('模型容量加载失败');}finally{if(ticket===capacityGeneration)capacityLoading.value=false;}}
async function saveCapacity(){if(!capacity.value||!can('iqc:model-gateway:capacity:configure'))return;
  if(!Number.isInteger(limit.value)||limit.value<0||limit.value>10000){message.warning('并发上限需为0到10000的整数');return;}
  saving.value=true;try{const result=await configureModelCapacity(capacity.value.modelKey,limit.value,capacity.value.version);capacity.value=result.after;message.success('并发上限已保存');}
  catch{message.error('保存失败，配置可能已变化，请关闭后重新查看');}finally{saving.value=false;}}
function beginRelease(row:ModelCall){releaseCall.value=row;reason.value='REMOTE_COMPLETED';evidence.value='';remoteStopped.value=false;releaseOpen.value=true;}
async function saveRelease(){if(!releaseCall.value||!can('iqc:model-gateway:calls:release'))return;
  if(!remoteStopped.value||! /^[A-Za-z0-9:_./-]{1,128}$/.test(evidence.value)){message.warning('请核对远端停止并填写有效凭据编号');return;}
  saving.value=true;try{await releaseModelCapacity(releaseCall.value.callId,releaseCall.value.modelKey,reason.value,evidence.value,remoteStopped.value);releaseOpen.value=false;message.success('占用已恢复，原调用状态保留');await load();}
  catch{message.error('恢复失败，请刷新记录后核对');}finally{saving.value=false;}}

const states={RESERVED:'响应未确认',CONFIRMED:'响应已确认',UNKNOWN:'请求结果未知'};
const costStates:Record<string,string>={CALCULATED_FROM_DECLARED_PRICE:'按声明价计算',UNKNOWN_RESPONSE:'响应未知',UNKNOWN_PRICE:'价格未知',UNKNOWN_USAGE:'用量未知',UNKNOWN_REQUEST_SCOPE:'计量范围不完整',UNKNOWN_CACHE_BILLING:'缓存计费未支持',PRICING_EVIDENCE_INVALID:'价格证据无效'};
const outputStates:Record<string,string>={NOT_DECLARED:'未设置',UNKNOWN_RESPONSE:'响应未知',UNKNOWN_REQUEST_SCOPE:'计量范围不完整',UNKNOWN_USAGE:'输出用量未知',OBSERVED_WITHIN_LIMIT:'本次观测未超限',OBSERVED_OVER_LIMIT:'本次观测超限'};
const usageStates={COMPLETE:'完整用量',PARTIAL:'部分用量',MISSING:'用量未知',INVALID:'用量无效'};
async function load(page=current.value){
  const ticket=++generation;rows.value=[];summary.value=undefined;error.value='';
  if(!authorized.value){loading.value=false;total.value=0;return;}
  loading.value=true;
  try{const result=props.taskId?await listTaskModelCalls(props.taskId,props.executionId,status.value,page):await listModelCalls(status.value,page);if(ticket===generation){rows.value=result.records;summary.value=result.costSummary;current.value=page;total.value=result.total;}}
  catch{if(ticket===generation)error.value='模型调用记录未能加载，请重试。';}
  finally{if(ticket===generation)loading.value=false;}
}
watch([status,authorized,()=>props.taskId,()=>props.executionId],()=>{current.value=1;total.value=0;void load(1);},{immediate:true});
onBeforeUnmount(()=>{generation++;capacityGeneration++;});
</script>
<template>
<section v-if="authorized">
<a-space><h3>模型调用记录</h3><a-select v-model:value="status" allow-clear placeholder="全部状态" style="width:160px" :options="[{value:'RESERVED',label:'响应未确认'},{value:'CONFIRMED',label:'响应已确认'},{value:'UNKNOWN',label:'请求结果未知'}]"/><a-button :disabled="loading" @click="load()">刷新</a-button></a-space>
<a-alert type="info" :message="`${props.taskId?'这里展示本任务明确关联的模型调用，未关联旧记录不推测归属。':'这里展示全局模型调用。'}响应已确认不代表质检成功；缺失用量显示未知。已恢复占用会另行标记。`"/>
<div v-if="summary" class="cost-summary">
<p>当前筛选全部调用：{{summary.callCount}} · 已知费用调用：{{summary.knownCount}} · 未知费用调用：{{summary.unknownCount}}</p>
<p v-for="group in summary.currencies" :key="group.currency??'unknown'">{{group.currency??'币种未知'}}：已知费用小计 {{group.knownSubtotal??'未知'}} · 未知费用调用 {{group.unknownCount}}</p>
<p>小计按冻结声明价计算，未知费用未计入；不同币种分别展示，不等同供应商账单。</p>
</div>
<a-alert v-if="error" type="error" :message="error"/>
<a-table :data-source="rows" :loading="loading" row-key="callId" :pagination="false" :scroll="{x:1600}" :columns="[{title:'开始 UTC',dataIndex:'reservedAtUtc'},{title:'完成 UTC',dataIndex:'settledAtUtc'},{title:'响应状态',key:'status'},{title:'用量状态',key:'usageStatus'},{title:'输入 Token',key:'inputTokens'},{title:'输出 Token',key:'outputTokens'},{title:'总 Token',key:'totalTokens'},{title:'缓存读 Token',key:'cacheReadInputTokens'},{title:'缓存写 Token',key:'cacheWriteInputTokens'},{title:'请求模型',dataIndex:'requestedModelName'},{title:'响应模型',dataIndex:'responseModelId'},{title:'模型配置版本',dataIndex:'modelProfileVersion'},{title:'请求输出上限',key:'outputLimit'},{title:'输出限制观测',key:'outputLimitStatus'},{title:'声明价格费用',key:'cost'},{title:'费用状态',key:'costStatus'},{title:'任务',dataIndex:'taskId'},{title:'执行轮次',dataIndex:'executionId'},{title:'节点',dataIndex:'nodeId'},{title:'检测轮次',key:'runIndex'},{title:'会话',dataIndex:'conversationId'},{title:'规则',dataIndex:'ruleId'},{title:'逻辑记录',dataIndex:'logicalRecordId'},{title:'模型键',dataIndex:'modelKey'},{title:'错误类型',dataIndex:'errorType'},{title:'容量恢复',key:'released'},{title:'操作',key:'actions',fixed:'right',width:180}]">
<template #bodyCell="{column,record}"><template v-if="column.key==='actions'"><a-button v-if="can('iqc:model-gateway:capacity:view')" type="link" @click="inspectCapacity(record)">容量</a-button><a-button v-if="can('iqc:model-gateway:calls:release')&&record.status!=='CONFIRMED'&&!record.capacityReleasedAtUtc" type="link" @click="beginRelease(record)">核对恢复</a-button></template><template v-else-if="column.key==='released'">{{record.capacityReleasedAtUtc?`已恢复：${record.capacityReleasedBy}`:'—'}}</template><template v-else-if="column.key==='status'"><a-tag :color="record.status==='CONFIRMED'?'blue':'orange'">{{states[record.status as ModelCallStatus]}}</a-tag></template><template v-else-if="column.key==='usageStatus'">{{record.usageStatus?usageStates[record.usageStatus as keyof typeof usageStates]:'未知'}}</template><template v-else-if="column.key==='outputLimit'">{{record.maxOutputTokens==null?'未知':`${record.maxOutputTokens} (${record.outputTokenParameter})`}}</template><template v-else-if="column.key==='outputLimitStatus'"><a-tag :color="record.outputLimitStatus==='OBSERVED_OVER_LIMIT'?'red':undefined">{{outputStates[record.outputLimitStatus]||'未知'}}</a-tag></template><template v-else-if="column.key==='cost'">{{record.calculatedCost==null?'未知':`${record.calculatedCost} ${record.pricingCurrency}`}}</template><template v-else-if="column.key==='costStatus'">{{costStates[record.costStatus]||'未知'}}</template><template v-else-if="column.key==='runIndex'">{{record.runIndex==null?'未知':record.runIndex+1}}</template><template v-else-if="['inputTokens','outputTokens','totalTokens','cacheReadInputTokens','cacheWriteInputTokens'].includes(column.key)">{{record[column.key]??'未知'}}</template></template>
</a-table>
<a-pagination :current="current" :total="total" :page-size="20" :disabled="loading" @change="load"/>
<a-modal v-model:open="capacityOpen" title="模型并发容量" :footer="null" @cancel="capacityGeneration++">
<a-spin :spinning="capacityLoading"><template v-if="capacity"><p>当前占用：{{capacity.occupied}} · 配置版本：{{capacity.version}}</p><p>{{capacity.managed?'管理员配置生效':'沿用部署初始化配置'}}</p><a-form layout="vertical"><a-form-item label="并发上限（0表示不限）"><a-input-number v-model:value="limit" :min="0" :max="10000" :precision="0" :disabled="!can('iqc:model-gateway:capacity:configure')"/></a-form-item></a-form><p>降低到当前占用以下会阻止新调用，已有调用继续执行。</p><a-button v-if="can('iqc:model-gateway:capacity:configure')" type="primary" :loading="saving" @click="saveCapacity">保存并发上限</a-button></template></a-spin>
</a-modal>
<a-modal v-model:open="releaseOpen" title="核对并恢复占用" :confirm-loading="saving" @ok="saveRelease">
<a-alert type="warning" message="请先核对原发起进程不会继续发送请求，且远端已完成、取消或请求未发送。恢复只释放一次并发占用，保留原未知结果和用量；不能仅凭等待时长判断远端已停止。"/>
<a-form layout="vertical"><a-form-item label="核对结论"><a-select v-model:value="reason" :options="[{value:'REMOTE_COMPLETED',label:'远端已完成'},{value:'REMOTE_CANCELLED',label:'远端已取消'},{value:'REQUEST_NOT_SENT',label:'确认请求未发送'}]"/></a-form-item><a-form-item label="核对凭据编号"><a-input v-model:value="evidence" :maxlength="128" placeholder="工单、日志或核对记录编号"/></a-form-item><a-checkbox v-model:checked="remoteStopped">我已核对原调用不会再发送或在远端继续执行</a-checkbox></a-form>
</a-modal>
</section>
</template>
<style scoped>section{margin-top:24px}h3{margin:0}</style>
