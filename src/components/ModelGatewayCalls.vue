<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {message} from 'ant-design-vue';
import {usePermission} from '@/composables/permission';
import {getModelDiagnostic,type ModelDiagnostic,listModelCalls,listTaskModelCalls,getModelCapacity,configureModelCapacity,releaseModelCapacity,reconcileModelBudget,recoverModelBudget,getModelBudget,configureProfileBudget,type ModelCallPrivacy,type ModelBudgetSnapshot,type ModelCall,type ModelCallStatus,type ModelCapacity,type CapacityReleaseReason,type CostSummary,type BudgetPolicy} from '@/api/model-gateway';
const props=defineProps<{taskId?:string;executionId?:string}>();
const {can}=usePermission();
const authorized=computed(()=>props.taskId?can('iqc:task:model-calls:view'):can('iqc:model-gateway:calls:view'));
const rows=ref<ModelCall[]>([]),loading=ref(false),error=ref(''),current=ref(1),total=ref(0),status=ref<ModelCallStatus>();
const summary=ref<CostSummary>(),callPrivacy=ref<ModelCallPrivacy>();
const conversationDraft=ref(''),conversationFilter=ref<string>();
function applyConversation(){
  const value=conversationDraft.value.trim();
  if(value&&!/^[A-Za-z0-9:_-]{1,64}$/.test(value)){message.error('请输入有效会话标识');return;}
  conversationFilter.value=value||undefined;
}
function clearConversation(){conversationDraft.value='';conversationFilter.value=undefined;}

const evidenceRestricted=computed(()=>!!callPrivacy.value&&(callPrivacy.value.policyVersion!=='iqc-model-call-read-v1'||callPrivacy.value.evidenceVisible!==true||callPrivacy.value.canReadFull!==true||callPrivacy.value.canReadPii!==true||callPrivacy.value.canReadPrompt!==true));
let generation=0,capacityGeneration=0;
const diagnostic=ref<ModelDiagnostic>(),diagnosticOpen=ref(false),diagnosticLoading=ref(false),diagnosticError=ref('');
let diagnosticGeneration=0;
const diagnosticStates:Record<string,string>={CAPTURED:'请求与响应已归档',REQUEST_ONLY:'仅请求已归档',RESPONSE_ONLY:'仅响应已归档',NOT_RECORDED:'未归档（可能未开启或属于旧调用）',EXPIRED:'归档已过期，正文不可读',SIZE_LIMIT:'超过大小上限，正文未保存',UNREADABLE:'归档不可读或来源校验失败'};
const diagnosticPayload=computed(()=>diagnostic.value?.schemaVersion==='iqc-model-call-data-v1'&&['CAPTURED','REQUEST_ONLY','RESPONSE_ONLY'].includes(diagnostic.value.state));
function closeDiagnostic(){++diagnosticGeneration;diagnosticOpen.value=false;diagnostic.value=undefined;diagnosticError.value='';diagnosticLoading.value=false;}
watch(diagnosticOpen,open=>{if(!open){++diagnosticGeneration;diagnostic.value=undefined;diagnosticError.value='';diagnosticLoading.value=false;}});
async function inspectDiagnostic(row:ModelCall){
  const taskId=props.taskId;if(!taskId||!can('iqc:task:model-call-data:view'))return;
  closeDiagnostic();diagnosticOpen.value=true;diagnosticLoading.value=true;const ticket=++diagnosticGeneration;
  try{const data=await getModelDiagnostic(taskId,row.callId);
    if(ticket!==diagnosticGeneration||!diagnosticOpen.value||taskId!==props.taskId)return;
    if(data.schemaVersion!=='iqc-model-call-data-v1'||data.callId!==row.callId||data.taskId!==taskId){diagnosticError.value='诊断协议或来源不匹配，未显示正文。';return;}
    diagnostic.value=data;
  }catch{if(ticket===diagnosticGeneration&&diagnosticOpen.value)diagnosticError.value='诊断读取失败，请核对当前任务、日志、完整会话、PII和Prompt权限。';}
  finally{if(ticket===diagnosticGeneration)diagnosticLoading.value=false;}
}

const capacity=ref<ModelCapacity>(),capacityOpen=ref(false),capacityLoading=ref(false),limit=ref(0),saving=ref(false);
const profileBudget=ref<ModelBudgetSnapshot>();
const canConfigureBudget=computed(()=>profileBudget.value?can('iqc:model:budget:configure'):can('iqc:model-gateway:capacity:configure'));
const budgetSource=ref<Pick<ModelCall,'pricingHash'|'pricingCurrency'|'modelProfileVersion'>>(),editBudget=ref(false),tokenLimit=ref(''),costLimit=ref(''),budgetCurrency=ref(''),window=ref(0),deployment=ref(''),parameter=ref('MAX_TOKENS'),priceHash=ref<string|null>(null),budgetEvidence=ref(''),contractVerified=ref(false);
const recoveringBudget=ref(false);
function beginBudgetRecovery(){if(saving.value||!capacity.value||!can('iqc:model-gateway:budget:recover'))return;recoveringBudget.value=true;editBudget.value=true;contractVerified.value=false;budgetEvidence.value='';}
function bindSourcePrice(){priceHash.value=budgetSource.value?.pricingHash??null;budgetCurrency.value=budgetSource.value?.pricingCurrency??'';}
const releaseCall=ref<ModelCall>(),releaseOpen=ref(false),reason=ref<CapacityReleaseReason>('REMOTE_COMPLETED'),evidence=ref(''),remoteStopped=ref(false);
async function inspectCapacity(row:ModelCall){const ticket=++capacityGeneration;capacity.value=undefined;capacityOpen.value=true;capacityLoading.value=true;profileBudget.value=undefined;budgetSource.value=row;recoveringBudget.value=false;editBudget.value=false;contractVerified.value=false;
  try{const result=await getModelCapacity(row.modelKey);if(ticket===capacityGeneration){capacity.value=result;limit.value=result.concurrencyLimit;const b=result.budget;tokenLimit.value=b.tokenLimit??'';costLimit.value=b.costLimit??'';budgetCurrency.value=b.currency??row.pricingCurrency??'';window.value=b.contextWindow??row.contextWindowTokens??0;deployment.value=b.deploymentRef??row.deploymentRef??'';parameter.value=b.outputParameter??row.outputTokenParameter??'MAX_TOKENS';priceHash.value=b.pricingHash??row.pricingHash;budgetEvidence.value=b.evidenceRef??'';}}
  catch{if(ticket===capacityGeneration)message.error('模型容量加载失败');}finally{if(ticket===capacityGeneration)capacityLoading.value=false;}}
async function inspectModelBudget(id:string){if(!can('iqc:model:budget:view'))return;const ticket=++capacityGeneration;capacity.value=undefined;profileBudget.value=undefined;capacityOpen.value=true;capacityLoading.value=true;recoveringBudget.value=false;editBudget.value=true;contractVerified.value=false;
  try{const source=await getModelBudget(id);if(ticket!==capacityGeneration)return;profileBudget.value=source;budgetSource.value={pricingHash:source.pricingHash,pricingCurrency:source.pricingCurrency,modelProfileVersion:source.modelVersion};
    capacity.value=source.capacity??{modelKey:source.modelKey,occupied:'0',concurrencyLimit:1,managed:false,version:'0',budget:{tokenLimit:null,tokenCommitted:'0',tokenRemaining:null,costLimit:null,costCommitted:'0',costRemaining:null,currency:null,contextWindow:null,deploymentRef:null,outputParameter:null,pricingHash:null,evidenceRef:null,breached:false}};
    const b=capacity.value.budget;limit.value=capacity.value.concurrencyLimit;tokenLimit.value=b.tokenLimit??'';costLimit.value=b.costLimit??'';budgetCurrency.value=b.currency??source.pricingCurrency??'';
    window.value=source.contextWindowTokens??0;deployment.value=source.deploymentRef??'';parameter.value=source.outputTokenParameter??'MAX_TOKENS';priceHash.value=source.pricingHash;budgetEvidence.value='';
  }catch{if(ticket===capacityGeneration)message.error('模型预算状态读取失败，请重试');}finally{if(ticket===capacityGeneration)capacityLoading.value=false;}}
defineExpose({inspectModelBudget});
async function saveCapacity(){if(saving.value||!capacity.value||!(recoveringBudget.value?can('iqc:model-gateway:budget:recover'):canConfigureBudget.value))return;
  if(!Number.isInteger(limit.value)||limit.value<0||limit.value>10000){message.warning('并发上限需为0到10000的整数');return;}
  let policy:BudgetPolicy|undefined;
  if(editBudget.value||recoveringBudget.value||profileBudget.value){
    if(!contractVerified.value||(!tokenLimit.value&&!costLimit.value)||!Number.isInteger(window.value)||window.value<1||window.value>100000000){message.warning('请设置至少一种额度、有效上下文窗口，并核定供应商契约');return;}
    policy={tokenLimit:tokenLimit.value||null,costLimit:costLimit.value||null,currency:costLimit.value?budgetCurrency.value:capacity.value.budget.currency,contextWindow:window.value,deploymentRef:deployment.value,outputParameter:parameter.value,pricingHash:costLimit.value?priceHash.value:null,evidenceRef:budgetEvidence.value,contractVerified:contractVerified.value};
  }
  if(recoveringBudget.value&&(!capacity.value.budget.breached||capacity.value.occupied!=='0'||budgetEvidence.value===capacity.value.budget.evidenceRef)){message.warning('恢复前须清空模型占用，并提供重新核定的新凭据');return;}
  const ticket=capacityGeneration,source=capacity.value,recovery=recoveringBudget.value,profile=profileBudget.value;
  saving.value=true;try{const result=profile&&policy&&!recovery?(await configureProfileBudget(profile,source.version,limit.value,policy)).capacity:recovery&&policy?await recoverModelBudget(source.modelKey,source.version,policy):await configureModelCapacity(source.modelKey,limit.value,source.version,policy);if(ticket!==capacityGeneration)return;capacity.value=result.after;if(profile)profileBudget.value={...profile,capacity:result.after};editBudget.value=false;contractVerified.value=false;recoveringBudget.value=false;message.success(recovery?'预算隔离已恢复，累计消耗保留':'容量策略已保存');}
  catch{if(ticket===capacityGeneration)message.error('保存失败，请重新打开并核对模型版本、政策版本和声明');}finally{saving.value=false;}}
function beginRelease(row:ModelCall){releaseCall.value=row;reason.value='REMOTE_COMPLETED';evidence.value='';remoteStopped.value=false;releaseOpen.value=true;}
async function saveRelease(){if(!releaseCall.value||!can('iqc:model-gateway:calls:release'))return;
  if(!remoteStopped.value||! /^[A-Za-z0-9:_./-]{1,128}$/.test(evidence.value)){message.warning('请核对远端停止并填写有效凭据编号');return;}
  saving.value=true;try{await releaseModelCapacity(releaseCall.value.callId,releaseCall.value.modelKey,reason.value,evidence.value,remoteStopped.value);releaseOpen.value=false;message.success('占用已恢复，原调用状态保留');await load();}
  catch{message.error('恢复失败，请刷新记录后核对');}finally{saving.value=false;}}

const reconciliationCall=ref<ModelCall>(),reconciliationOpen=ref(false),reconciliationSaving=ref(false);
const reconciledTokens=ref(''),reconciledCost=ref(''),reconciliationEvidence=ref(''),reconciliationVerified=ref(false);
let reconciliationGeneration=0;
function beginReconciliation(row:ModelCall){if(reconciliationSaving.value)return;reconciliationGeneration++;reconciliationCall.value=row;reconciledTokens.value='';reconciledCost.value='';reconciliationEvidence.value='';reconciliationVerified.value=false;reconciliationOpen.value=true;}
async function saveReconciliation(){const row=reconciliationCall.value;if(!row||reconciliationSaving.value||!can('iqc:model-gateway:calls:reconcile'))return;
  if(!reconciliationVerified.value||!/^(0|[1-9][0-9]{0,18})$/.test(reconciledTokens.value)||BigInt(reconciledTokens.value)>9223372036854775807n
      ||(row.budgetReservedCost!=null&&!/^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$/.test(reconciledCost.value))
      ||! /^[A-Za-z0-9:_./-]{1,128}$/.test(reconciliationEvidence.value)){message.warning('请填写最终精确用量、金额和凭据，并确认已核对供应商事实');return;}
  const ticket=reconciliationGeneration;reconciliationSaving.value=true;
  try{await reconcileModelBudget(row.callId,row.modelKey,reconciledTokens.value,row.budgetReservedCost==null?null:reconciledCost.value,row.budgetReservedCost==null?null:row.budgetCurrency,reconciliationEvidence.value,reconciliationVerified.value);
    if(ticket!==reconciliationGeneration)return;reconciliationOpen.value=false;reconciliationVerified.value=false;message.success('预算已核对，原响应事实保留');await load();}
  catch{if(ticket===reconciliationGeneration)message.error('预算核对失败，请刷新后核对最终事实和远端停止凭据');}
  finally{reconciliationSaving.value=false;}
}

const states={RESERVED:'响应未确认',CONFIRMED:'响应已确认',UNKNOWN:'请求结果未知'};
const costStates:Record<string,string>={CALCULATED_FROM_DECLARED_PRICE:'按声明价计算',UNKNOWN_RESPONSE:'响应未知',UNKNOWN_PRICE:'价格未知',UNKNOWN_USAGE:'用量未知',UNKNOWN_REQUEST_SCOPE:'计量范围不完整',UNKNOWN_CACHE_BILLING:'缓存计费未支持',PRICING_EVIDENCE_INVALID:'价格证据无效'};
const outputStates:Record<string,string>={NOT_DECLARED:'未设置',UNKNOWN_RESPONSE:'响应未知',UNKNOWN_REQUEST_SCOPE:'计量范围不完整',UNKNOWN_USAGE:'输出用量未知',OBSERVED_WITHIN_LIMIT:'本次观测未超限',OBSERVED_OVER_LIMIT:'本次观测超限'};
const budgetStates:Record<string,string>={NOT_CONFIGURED:'未参与预算',HELD:'保留预留',SETTLED:'已核销',TOKEN_SETTLED_COST_HELD:'Token已核销，金额仍预留',QUARANTINED:'核定范围失效',RECONCILED:'已人工核对'};
const usageStates={COMPLETE:'完整用量',PARTIAL:'部分用量',MISSING:'用量未知',INVALID:'用量无效'};
async function load(page=current.value){
  closeDiagnostic();const ticket=++generation;rows.value=[];summary.value=undefined;callPrivacy.value=undefined;error.value='';
  if(!authorized.value){loading.value=false;total.value=0;return;}
  loading.value=true;
  try{const result=props.taskId?await listTaskModelCalls(props.taskId,props.executionId,status.value,page,20,conversationFilter.value):await listModelCalls(status.value,page);if(ticket===generation){rows.value=result.records;summary.value=result.costSummary;callPrivacy.value=result.privacy;current.value=page;total.value=result.total;}}
  catch{if(ticket===generation)error.value='模型调用记录未能加载，请重试。';}
  finally{if(ticket===generation)loading.value=false;}
}
watch(()=>props.taskId,clearConversation);
watch([status,authorized,()=>props.taskId,()=>props.executionId,conversationFilter],()=>{current.value=1;total.value=0;void load(1);},{immediate:true});
onBeforeUnmount(()=>{generation++;capacityGeneration++;reconciliationGeneration++;closeDiagnostic();});
</script>
<template>
<section v-if="authorized||capacityOpen">
<template v-if="authorized">
<a-space><h3>模型调用记录</h3><a-select v-model:value="status" allow-clear placeholder="全部状态" style="width:160px" :options="[{value:'RESERVED',label:'响应未确认'},{value:'CONFIRMED',label:'响应已确认'},{value:'UNKNOWN',label:'请求结果未知'}]"/><a-button :disabled="loading" @click="load()">刷新</a-button></a-space>
<a-space v-if="props.taskId" style="margin-bottom:12px"><a-input v-model:value="conversationDraft" placeholder="会话 ID（留空查看整个任务）" :maxlength="64" style="width:340px" @press-enter="applyConversation"/><a-button @click="applyConversation">按会话查询</a-button><a-button @click="clearConversation">清除筛选</a-button></a-space>
<p v-if="props.taskId">当前会话范围：{{conversationFilter||'整个任务'}} · 执行范围：{{props.executionId||'全部执行轮次（包含重试）'}}</p>
<a-alert type="info" :message="`${props.taskId?'这里展示本任务明确关联的模型调用，未关联旧记录不推测归属。':'这里展示全局模型调用。'}响应已确认不代表质检成功；缺失用量显示未知。已恢复占用会另行标记。`"/>
<div v-if="summary" class="cost-summary">
<p>当前筛选全部调用：{{summary.callCount}} · 已知费用调用：{{summary.knownCount}} · 未知费用调用：{{summary.unknownCount}}</p>
<p v-for="group in summary.currencies" :key="group.currency??'unknown'">{{group.currency??'币种未知'}}：已知费用小计 {{group.knownSubtotal??'未知'}} · 未知费用调用 {{group.unknownCount}}</p>
<p>小计按冻结声明价计算，未知费用未计入；不同币种分别展示，不等同供应商账单。</p>
<p v-if="props.taskId&&conversationFilter">此会话在当前任务、执行及状态筛选内的已记录调用费用如上。只有未知费用调用为 0 时，小计才覆盖全部匹配账本调用；无记录不表示零成本。工具续调、降级及重试如已关联此会话均按各条实际调用累计，未关联旧记录无法补算。</p>
</div>
<a-alert v-if="evidenceRestricted" type="info" message="人工核对凭据及部分模型展示文本受权限限制；用量、费用与统计保持原值，未展示不等于没有凭据。"/><a-alert v-if="error" type="error" :message="error"/>
<a-table :data-source="rows" :loading="loading" row-key="callId" :pagination="false" :scroll="{x:1600}" :columns="[{title:'开始 UTC',dataIndex:'reservedAtUtc'},{title:'完成 UTC',dataIndex:'settledAtUtc'},{title:'响应状态',key:'status'},{title:'用量状态',key:'usageStatus'},{title:'输入 Token',key:'inputTokens'},{title:'输出 Token',key:'outputTokens'},{title:'总 Token',key:'totalTokens'},{title:'缓存读 Token',key:'cacheReadInputTokens'},{title:'缓存写 Token',key:'cacheWriteInputTokens'},{title:'请求模型',dataIndex:'requestedModelName'},{title:'响应模型',dataIndex:'responseModelId'},{title:'模型配置版本',dataIndex:'modelProfileVersion'},{title:'部署声明',key:'deploymentRef'},{title:'上下文窗口声明',key:'contextWindowTokens'},{title:'请求输出上限',key:'outputLimit'},{title:'输出限制观测',key:'outputLimitStatus'},{title:'声明价格费用',key:'cost'},{title:'费用状态',key:'costStatus'},{title:'预算Token预留',key:'budgetReservedTokens'},{title:'预算金额预留',key:'budgetReservedCost'},{title:'预算状态',key:'budgetStatus'},{title:'人工预算事实',key:'reconciliation'},{title:'任务',dataIndex:'taskId'},{title:'执行轮次',dataIndex:'executionId'},{title:'节点',dataIndex:'nodeId'},{title:'检测轮次',key:'runIndex'},{title:'工具回合',key:'toolRoundIndex'},{title:'工具执行证据 UTC',dataIndex:'toolExecutionStartedAtUtc'},{title:'会话',dataIndex:'conversationId'},{title:'规则',dataIndex:'ruleId'},{title:'逻辑记录',dataIndex:'logicalRecordId'},{title:'模型键',dataIndex:'modelKey'},{title:'错误类型',dataIndex:'errorType'},{title:'容量恢复',key:'released'},{title:'操作',key:'actions',fixed:'right',width:180}]">
<template #bodyCell="{column,record}"><template v-if="column.key==='actions'"><a-button v-if="props.taskId&&can('iqc:task:model-call-data:view')" type="link" @click="inspectDiagnostic(record)">诊断正文</a-button><a-button v-if="can('iqc:model-gateway:capacity:view')" type="link" @click="inspectCapacity(record)">容量</a-button><a-button v-if="can('iqc:model-gateway:calls:release')&&record.status!=='CONFIRMED'&&!record.capacityReleasedAtUtc" type="link" @click="beginRelease(record)">核对恢复</a-button><a-button v-if="can('iqc:model-gateway:calls:reconcile')&&record.budgetReservedTokens!=null&&!record.reconciliation&&(record.status==='CONFIRMED'||record.capacityReleasedAtUtc)" type="link" :disabled="reconciliationSaving" @click="beginReconciliation(record)">预算对账</a-button></template><template v-else-if="column.key==='released'">{{record.capacityReleasedAtUtc?`已恢复：${record.capacityReleasedBy}`:'—'}}</template><template v-else-if="column.key==='status'"><a-tag :color="record.status==='CONFIRMED'?'blue':'orange'">{{states[record.status as ModelCallStatus]}}</a-tag></template><template v-else-if="column.key==='usageStatus'">{{record.usageStatus?usageStates[record.usageStatus as keyof typeof usageStates]:'未知'}}</template><template v-else-if="['deploymentRef','contextWindowTokens'].includes(column.key)">{{record[column.key]??'未知'}}</template><template v-else-if="column.key==='outputLimit'">{{record.maxOutputTokens==null?'未知':`${record.maxOutputTokens} (${record.outputTokenParameter})`}}</template><template v-else-if="column.key==='outputLimitStatus'"><a-tag :color="record.outputLimitStatus==='OBSERVED_OVER_LIMIT'?'red':undefined">{{outputStates[record.outputLimitStatus]||'未知'}}</a-tag></template><template v-else-if="column.key==='reconciliation'"><template v-if="record.reconciliation">Token：{{record.reconciliation.tokens}}<br/>金额：{{record.reconciliation.cost==null?'未参与':`${record.reconciliation.cost} ${record.reconciliation.currency}`}}<br/>{{record.reconciliation.owner}} · {{record.reconciliation.atUtc}} UTC<br/>凭据：{{evidenceRestricted?'凭据未展示':record.reconciliation.evidence||'—'}}</template><template v-else>未人工核对</template></template><template v-else-if="column.key==='budgetStatus'">{{budgetStates[record.budgetStatus]||'未知'}}</template><template v-else-if="column.key==='budgetReservedTokens'">{{record.budgetReservedTokens??'未参与'}}</template><template v-else-if="column.key==='budgetReservedCost'">{{record.budgetReservedCost==null?'未参与':`${record.budgetReservedCost} ${record.budgetCurrency}`}}</template><template v-else-if="column.key==='cost'">{{record.calculatedCost==null?'未知':`${record.calculatedCost} ${record.pricingCurrency}`}}</template><template v-else-if="column.key==='costStatus'">{{costStates[record.costStatus]||'未知'}}</template><template v-else-if="column.key==='toolRoundIndex'">{{record.toolRoundIndex==null?'未知':record.toolRoundIndex===0?'初次请求':`续调 ${record.toolRoundIndex}`}}</template><template v-else-if="column.key==='runIndex'">{{record.runIndex==null?'未知':record.runIndex+1}}</template><template v-else-if="['inputTokens','outputTokens','totalTokens','cacheReadInputTokens','cacheWriteInputTokens'].includes(column.key)">{{record[column.key]??'未知'}}</template></template>
</a-table>
<a-pagination :current="current" :total="total" :page-size="20" :disabled="loading" @change="load"/>
</template>
<a-modal v-model:open="diagnosticOpen" title="模型调用诊断正文" :width="900" :footer="null" @cancel="closeDiagnostic">
<a-spin :spinning="diagnosticLoading"><a-alert type="info" message="独立敏感读取，仅展示该调用未过期的归档；不代表完整网络传输报文，不用于重新评分或核算费用。"/><a-alert v-if="diagnosticError" type="error" :message="diagnosticError"/>
<template v-if="diagnostic"><p>{{diagnostic.callId}} · {{diagnosticStates[diagnostic.state]||'未知归档状态'}} · 过期 UTC：{{diagnostic.expiresAtUtc||'—'}}</p>
<template v-if="diagnosticPayload"><h4>请求</h4><pre style="max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">{{diagnostic.requestJson??'此侧未归档'}}</pre><h4>响应</h4><pre style="max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere">{{diagnostic.responseJson??'此侧未归档'}}</pre></template></template></a-spin>
</a-modal>
<a-modal v-model:open="capacityOpen" title="模型并发容量" :footer="null" @cancel="capacityGeneration++">
<a-spin :spinning="capacityLoading"><template v-if="capacity"><a-alert v-if="profileBudget&&!profileBudget.capacity" type="info" message="预算账本尚未创建。保存后从零开始累计参与预算的调用，未参与预算的历史消耗不会补计。"/><p v-if="profileBudget">模型配置版本：{{profileBudget.modelVersion}}</p><p>当前占用：{{capacity.occupied}} · 配置版本：{{capacity.version}}</p><p>{{capacity.managed?'管理员配置生效':'沿用部署初始化配置'}}</p><a-form layout="vertical"><a-form-item label="并发上限（0表示不限）"><a-input-number v-model:value="limit" :min="0" :max="10000" :precision="0" :disabled="recoveringBudget||!canConfigureBudget"/></a-form-item></a-form><p>降低到当前占用以下会阻止新调用，已有调用继续执行。</p><a-divider>累计预算</a-divider>
<a-alert v-if="capacity.budget.breached" type="error" message="模型核定范围失效，已隔离后续调用；普通策略修改不会解除隔离。"/>
<p>Token限额：{{capacity.budget.tokenLimit??'未设置'}} · 承诺：{{capacity.budget.tokenCommitted??'未知'}} · 剩余：{{capacity.budget.tokenRemaining??'未设置限额'}}</p>
<p>金额限额：{{capacity.budget.costLimit??'未设置'}} · 承诺：{{capacity.budget.costCommitted??'未知'}} {{capacity.budget.currency??''}} · 剩余：{{capacity.budget.costRemaining??'未设置限额'}}</p>
<p>承诺包含实际核销和未知调用的预留。Token记录参与预算的调用，金额记录启用金额额度的调用；未参与历史不回填，不按自然日重置。</p>
<a-button v-if="capacity.budget.breached&&can('iqc:model-gateway:budget:recover')&&!recoveringBudget" :disabled="saving||capacity.occupied!=='0'" @click="beginBudgetRecovery">重新核定并恢复隔离</a-button>
<a-alert v-if="recoveringBudget" type="info" message="请先完成所有预算调用的最终核销或人工对账，再填写新核定政策和独立凭据。恢复不会清空累计消耗。"/>
<template v-if="canConfigureBudget||recoveringBudget"><a-checkbox v-if="!recoveringBudget&&!profileBudget" v-model:checked="editBudget">同时修改预算</a-checkbox>
<a-form v-if="editBudget" layout="vertical"><a-form-item label="累计Token限额（留空不限制，0阻止消耗）"><a-input v-model:value="tokenLimit"/></a-form-item><a-form-item label="累计金额限额（精确十进制，留空不限制）"><a-input v-model:value="costLimit"/></a-form-item><a-form-item label="币种（账本设定后不可更换）"><a-input v-model:value="budgetCurrency" :maxlength="3"/></a-form-item>
<a-form-item label="核定总上下文窗口Token"><a-input-number v-model:value="window" :min="1" :max="100000000" :precision="0"/></a-form-item><a-form-item label="核定部署参考"><a-input v-model:value="deployment" :maxlength="128"/></a-form-item><a-form-item label="核定输出参数"><a-select v-model:value="parameter" :options="[{value:'MAX_TOKENS',label:'max_tokens'},{value:'MAX_COMPLETION_TOKENS',label:'max_completion_tokens'}]"/></a-form-item>
<p>金额定价：{{priceHash===budgetSource?.pricingHash?`所选调用的模型配置版本 ${budgetSource?.modelProfileVersion??'未知'}`:'沿现有核定价格'}}</p><a-button :disabled="!budgetSource?.pricingHash" @click="bindSourcePrice">绑定所选调用的模型价格</a-button>
<a-form-item label="核定凭据编号"><a-input v-model:value="budgetEvidence" :maxlength="128"/></a-form-item><a-checkbox v-model:checked="contractVerified">已核定供应商的上下文、输出限制、超长拒绝计费及统一价格范围</a-checkbox><p>配置声明或一次响应不能替代供应商核定。至少保留一种限额，修改策略不重置承诺或隔离。</p></a-form></template>
<a-button v-if="recoveringBudget||canConfigureBudget" type="primary" :loading="saving" @click="saveCapacity">{{recoveringBudget?'核定并恢复预算隔离':profileBudget?'保存模型预算':'保存容量策略'}}</a-button></template></a-spin>
</a-modal>
<a-modal v-model:open="releaseOpen" title="核对并恢复占用" :confirm-loading="saving" @ok="saveRelease">
<a-alert type="warning" message="请先核对原发起进程不会继续发送请求，且远端已完成、取消或请求未发送。恢复只释放一次并发占用，保留原未知结果和用量；不能仅凭等待时长判断远端已停止。"/>
<a-form layout="vertical"><a-form-item label="核对结论"><a-select v-model:value="reason" :options="[{value:'REMOTE_COMPLETED',label:'远端已完成'},{value:'REMOTE_CANCELLED',label:'远端已取消'},{value:'REQUEST_NOT_SENT',label:'确认请求未发送'}]"/></a-form-item><a-form-item label="核对凭据编号"><a-input v-model:value="evidence" :maxlength="128" placeholder="工单、日志或核对记录编号"/></a-form-item><a-checkbox v-model:checked="remoteStopped">我已核对原调用不会再发送或在远端继续执行</a-checkbox></a-form>
</a-modal>
<a-modal v-model:open="reconciliationOpen" title="模型预算对账" :confirm-loading="reconciliationSaving" @ok="saveReconciliation" @cancel="reconciliationGeneration++">
<a-alert type="info" message="依据供应商最终凭据填写本次调用的用量和金额。原响应事实保留，预算承诺按核对值调整；保存后不可替换，不自动解除模型隔离。"/>
<a-form v-if="reconciliationCall" layout="vertical"><p>调用：{{reconciliationCall.callId}}</p><a-form-item label="最终总Token（精确非负整数）"><a-input v-model:value="reconciledTokens" :maxlength="19"/></a-form-item>
<a-form-item v-if="reconciliationCall.budgetReservedCost!=null" :label="`最终金额（${reconciliationCall.budgetCurrency}，精确十进制）`"><a-input v-model:value="reconciledCost" :maxlength="37"/></a-form-item>
<a-form-item label="供应商最终核对凭据编号"><a-input v-model:value="reconciliationEvidence" :maxlength="128"/></a-form-item><a-checkbox v-model:checked="reconciliationVerified">已核对本次调用的最终用量、金额和币种</a-checkbox></a-form>
</a-modal>

</section>
</template>
<style scoped>section{margin-top:24px}h3{margin:0}</style>
