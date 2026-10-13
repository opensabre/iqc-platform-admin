<script setup lang="ts">
import {ref,watch} from 'vue';
import PublishedAssetReference from './PublishedAssetReference.vue';
import FindingLabelPolicyEditor from './FindingLabelPolicyEditor.vue';
import ActionPolicyEditor from './ActionPolicyEditor.vue';
import {validateActionPolicy} from '@/api/action-policy-editor';
import {validateFindingLabelPolicy,validateLabelActionTargets} from '@/api/finding-label-policy';
import type {PipelineRelease,PipelineNode,NumericPredicate} from '@/api/pipelines';
const props=defineProps<{initial:PipelineRelease;disabled?:boolean}>();
type NodeDraft=PipelineNode & {inputJson:string;outputJson:string;conditionJson:string;factCode:string};
type ItemDraft=PipelineRelease['items'][number] & {points:number;veto:boolean};
const publicationGate=ref<PipelineRelease['publicationGate']>();
const actionPolicy=ref<PipelineRelease['actionPolicy']>();
const labelPolicy=ref<PipelineRelease['labelPolicy']>();
const policyEditorGeneration=ref(0);
const actionError=ref('');
function configurePublicationGate(enabled:boolean){publicationGate.value=enabled?{schemaVersion:'iqc-publication-gate-v1',minimumRiskRecall:0.95,minimumOverallF1:0.92,minimumRegressionPass:1,minimumStructuredSuccess:0.995,maximumP95Ms:5000,minimumSamples:1}:undefined;}
const nodes=ref<NodeDraft[]>([]),items=ref<ItemDraft[]>([]),fusion=ref<PipelineRelease['fusion']>(),scoring=ref<PipelineRelease['scoring']>();
const priorities=ref('{}'),overrides=ref('{}');
const parallel=ref(false);
const options=(values:string[])=>values.map(value=>({value,label:value}));
watch(()=>props.initial,value=>{
 const copy=JSON.parse(JSON.stringify(value)) as PipelineRelease;
 parallel.value=copy.pipeline.schemaVersion==='iqc-pipeline-parallel-v1';
 policyEditorGeneration.value++;actionError.value='';
 publicationGate.value=copy.publicationGate;actionPolicy.value=copy.actionPolicy;labelPolicy.value=copy.labelPolicy;
 nodes.value=copy.pipeline.nodes.map(n=>({...n,inputJson:JSON.stringify(n.inputMapping,null,2),outputJson:JSON.stringify(n.outputSchema,null,2),conditionJson:JSON.stringify(n.condition?.value ?? null),factCode:String((n.config.findingDefinition as {code?:string}|undefined)?.code || '')}));
 items.value=copy.items.map(i=>({...i,points:copy.scoring.items.find(s=>s.itemCode===i.itemCode)?.points ?? 0,veto:copy.scoring.items.find(s=>s.itemCode===i.itemCode)?.veto ?? false}));
 fusion.value=copy.fusion;scoring.value=copy.scoring;priorities.value=JSON.stringify(copy.fusion.nodePriority,null,2);overrides.value=JSON.stringify(copy.fusion.overrideNodeByCode,null,2);
},{immediate:true});
function addNode() {
 let index=nodes.value.length+1;while(nodes.value.some(n=>n.nodeId===`node_${index}`))index++;
 nodes.value.push({nodeId:`node_${index}`,type:'RULE',name:'新检测节点',version:'1',dependsOn:[],inputMapping:{},config:{inputScope:'MESSAGE',phase:'DIRECT'},condition:null,timeoutMs:30000,retries:0,onError:'FAIL_PIPELINE',fallbackNodeId:null,outputSchema:null,enabled:true,inputJson:'{}',outputJson:'null',conditionJson:'null',factCode:''});
}
const metricOptions=[{value:'TRANSCRIPT_GAP_MS',label:'转写区间间隙（毫秒）'},{value:'CUSTOMER_TO_AGENT_MEAN_GAP_MS',label:'相邻客户到坐席平均间隙（毫秒）'},{value:'AGENT_TRANSCRIPT_TIME_SHARE',label:'坐席转写时间份额'},{value:'CROSS_ROLE_OVERLAP_PAIRS',label:'跨角色重叠片段对数'}];
const sessionOptions=[{value:'DLS_ENTRY_MATCH',label:'DLS流程是否满足（布尔）'},{value:'MATCHED_MESSAGE_COUNT',label:'指定子规则命中消息数（数字）'}];
function changeEngine(node:NodeDraft){
 if(props.disabled)return;
 const findingReference=node.config.findingReference;
 if(node.type==='METRIC'){node.version='transcript-timing-v1';node.config={findingReference,metric:'TRANSCRIPT_GAP_MS',agentRole:'agent',customerRole:'customer'};}
 else if(node.type==='SESSION'){node.version='dls-session-v1';node.config={findingReference,ruleReference:node.config.ruleReference,aggregation:'DLS_ENTRY_MATCH'};}
 else {node.version='1';node.config={findingReference,ruleReference:node.config.ruleReference,inputScope:node.type==='RULE'?'MESSAGE':'CONVERSATION',phase:'DIRECT',...(node.type==='LLM'?{agentReference:node.config.agentReference}:{})};}
}
function initializeParallelSchemas(){
 for(const node of nodes.value){
  const number=node.type==='METRIC' || node.type==='SESSION'&&node.config.aggregation==='MATCHED_MESSAGE_COUNT';
  node.outputJson=JSON.stringify({type:'object',properties:{[`${node.nodeId}_state`]:{type:'string'},[`${node.nodeId}_value`]:{type:number?'number':'boolean'}},required:[`${node.nodeId}_state`],additionalProperties:false},null,2);
 }
}
function move(index:number,delta:number) {const target=index+delta;if(target<0||target>=nodes.value.length)return;[nodes.value[index],nodes.value[target]]=[nodes.value[target]!,nodes.value[index]!];}
function remove(index:number) {nodes.value.splice(index,1);}
function addItem() {items.value.push({itemCode:'',findingCode:'',hitMeaning:'VIOLATION',appliesWhenFindingCode:null,points:10,veto:false});}
const numericOperators=['EQUALS','NOT_EQUALS','GREATER_OR_EQUAL','LESS_OR_EQUAL','GREATER_THAN','LESS_THAN'];
function numeric(item:ItemDraft,gate:boolean,checked:boolean){const key=gate?'appliesWhenNumericPredicate':'numericPredicate';if(checked)item[key]={operator:'GREATER_OR_EQUAL',threshold:''};else delete item[key];}
function clearNumericGate(item:ItemDraft,value?:string|null){if(!value?.trim())delete item.appliesWhenNumericPredicate;}
function validateNumeric(predicate?:NumericPredicate|null){
 if(!predicate)return;
 if(!numericOperators.includes(predicate.operator) || typeof predicate.threshold!=='string' || predicate.threshold.length>64 || !/^[-+]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(predicate.threshold))throw Error('数值比较须选择运算符及精确十进制阈值，不使用科学记数或空值');
 const decimal=predicate.threshold.replace(/^[+-]/,'');const precision=(decimal.replace('.','').replace(/^0+/,'')||'0').length;
 if(precision>38 || (decimal.split('.')[1]?.length??0)>18)throw Error('阈值最多38位有效数字及18位小数');
}
function condition(node:NodeDraft,checked:boolean) {node.condition=checked?{pointer:'/input/messages',operator:'EXISTS',value:null}:null;}
function object(raw:string,label:string):Record<string,unknown> {const value=JSON.parse(raw);if(value===null||typeof value!=='object'||Array.isArray(value))throw Error(`${label}必须为对象`);return value;}
function addLabelAction(binding:NonNullable<PipelineRelease['labelPolicy']>['bindings'][number]) {
 if(props.disabled)return;
 const actions=actionPolicy.value?.actions || [];
 actionError.value='';
 if(actions.some(action=>action.type==='UPDATE_LABEL' && (action.adapterVersion ?? 1)===1
   && action.configuration.labelId===binding.labelId && action.configuration.valueCode===binding.valueCode)){actionError.value='该标签值已有打标动作，请查看已有策略。';return;}
 if(actions.length>=100){actionError.value='动作不能超过100项';return;}
 let suffix=1;while(actions.some(action=>action.actionId===`label_${suffix}`))suffix++;
 actionPolicy.value={schemaVersion:'iqc-action-policy-v1',actions:[...actions,{actionId:`label_${suffix}`,type:'UPDATE_LABEL',adapterVersion:1,
   condition:{kind:'ALWAYS',code:null,value:null,children:[]},idempotency:'PRODUCTION_SOURCE_V1',retry:null,failureHandling:'RECORD_ONLY',
   configuration:{labelId:binding.labelId,valueCode:binding.valueCode}}]};
}
function release():PipelineRelease {
 if(!fusion.value||!scoring.value)throw Error('政策未加载');
 const converted=nodes.value.map(n=>{
  const input=object(n.inputJson,'输入映射');if(Object.values(input).some(v=>typeof v!=='string'))throw Error('输入映射的值必须为JSON pointer');
  const output=JSON.parse(n.outputJson);if(output!==null&&(typeof output!=='object'||Array.isArray(output)))throw Error('输出schema必须为对象或null');
  let config:PipelineNode['config'];
  if(n.type==='METRIC'){
   if(!metricOptions.some(option=>option.value===n.config.metric) || typeof n.config.agentRole!=='string' || typeof n.config.customerRole!=='string'
      || !n.config.agentRole.trim() || !n.config.customerRole.trim() || n.config.agentRole.length>64 || n.config.customerRole.length>64 || n.config.agentRole===n.config.customerRole)throw Error('请选择指标和不同的显式参与者角色（最多64字）');
   if(n.version!=='transcript-timing-v1')throw Error('转写指标版本须为transcript-timing-v1');
   config={metric:n.config.metric,agentRole:n.config.agentRole,customerRole:n.config.customerRole,findingReference:n.config.findingReference};
  }else if(n.type==='SESSION'){
   if(n.version!=='dls-session-v1' || !sessionOptions.some(option=>option.value===n.config.aggregation))throw Error('请选择会话聚合和dls-session-v1版本');
   if(n.config.aggregation==='MATCHED_MESSAGE_COUNT' && (typeof n.config.countDefinition!=='string' || !n.config.countDefinition.trim() || n.config.countDefinition.length>256))throw Error('计数须声明已发布DLS中的RULE子规则名称');
   config={ruleReference:n.config.ruleReference,findingReference:n.config.findingReference,aggregation:n.config.aggregation,...(n.config.aggregation==='MATCHED_MESSAGE_COUNT'?{countDefinition:n.config.countDefinition}:{})};
   if(!config.ruleReference?.id || !Number.isInteger(config.ruleReference.versionNo) || config.ruleReference.versionNo<1 || config.ruleReference.versionNo>2147483647)throw Error('会话聚合须选择已发布DLS规则版本');
  }else{
   config={ruleReference:n.config.ruleReference,findingReference:n.config.findingReference,inputScope:n.config.inputScope,phase:n.config.phase,...(n.type==='LLM'?{agentReference:n.config.agentReference}:{})};
   if(!config.ruleReference?.id || !config.ruleReference.versionNo || n.type==='LLM'&&(!n.config.agentReference?.id || !n.config.agentReference.versionNo))throw Error('检测节点须选择已发布规则，LLM另需已发布智能体');
  }
  if(!config.findingReference?.id || !Number.isInteger(config.findingReference.versionNo) || config.findingReference.versionNo<1 || config.findingReference.versionNo>2147483647)throw Error('每个节点须选择明确的已发布事实版本');
  return {nodeId:n.nodeId,type:n.type,name:n.name,version:n.version,dependsOn:[...n.dependsOn],inputMapping:input as Record<string,string>,config,condition:n.condition?{...n.condition,value:n.condition.operator==='EXISTS'?null:JSON.parse(n.conditionJson)}:null,timeoutMs:n.timeoutMs,retries:n.retries,onError:n.onError,fallbackNodeId:n.onError==='FALLBACK'?n.fallbackNodeId:null,outputSchema:output,enabled:n.enabled};
 });
 if(parallel.value)for(const node of converted){
  if(!node.enabled && !converted.some(source=>source.enabled&&source.onError==='FALLBACK'&&source.fallbackNodeId===node.nodeId))continue;
  const schema=node.outputSchema;
  if(!schema || schema.type!=='object' || schema.additionalProperties!==false || !schema.properties || typeof schema.properties!=='object' || Array.isArray(schema.properties))throw Error('并行节点及备用节点须声明关闭额外字段的对象输出schema');
 }
 const ids=new Set<string>();for(const n of converted){if(!n.nodeId.trim()||ids.has(n.nodeId)||n.dependsOn.some(id=>!ids.has(id)))throw Error('节点编码须唯一，依赖须指向前序节点');ids.add(n.nodeId);}
 if(!converted.length||converted.length>200)throw Error('需要1到200个节点');
 for(const n of converted)if(n.onError==='FALLBACK'){const f=converted.find(v=>v.nodeId===n.fallbackNodeId);if(!f||f.enabled||f.nodeId===n.nodeId||f.onError==='FALLBACK'||f.dependsOn.some(id=>!n.dependsOn.includes(id)))throw Error('备用节点须停用、非递归，且依赖属于源节点依赖');}
 const priority=object(priorities.value,'优先级'),override=object(overrides.value,'覆盖映射');
 if(Object.values(priority).some(v=>!Number.isSafeInteger(v))||Object.values(override).some(v=>typeof v!=='string'))throw Error('优先级必须为整数，覆盖映射必须为节点编码');
 if(publicationGate.value){const p=publicationGate.value;for(const ratio of [p.minimumRiskRecall,p.minimumOverallF1,p.minimumRegressionPass,p.minimumStructuredSuccess])if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<0||ratio>1)throw Error('发布门禁比率必须为0–1');if(!Number.isInteger(p.maximumP95Ms)||p.maximumP95Ms<1||p.maximumP95Ms>300000||!Number.isInteger(p.minimumSamples)||p.minimumSamples<1||p.minimumSamples>1000)throw Error('发布门禁样本/耗时阈值无效');}
 for(const item of items.value){validateNumeric(item.numericPredicate);validateNumeric(item.appliesWhenNumericPredicate);if(item.appliesWhenNumericPredicate&&!item.appliesWhenFindingCode?.trim())throw Error('数值适用条件需要选择事实编码');}
 const labels=validateFindingLabelPolicy(labelPolicy.value);
 const actions=validateActionPolicy(actionPolicy.value);
 validateLabelActionTargets(actions,labels);
 return {...(labels?{labelPolicy:labels}:{}),...(actions?{actionPolicy:actions}:{}),...(publicationGate.value?{publicationGate:{...publicationGate.value}}:{}),schemaVersion:'iqc-pipeline-release-v1',pipeline:{schemaVersion:parallel.value?'iqc-pipeline-parallel-v1':'iqc-pipeline-v1',nodes:converted},fusion:{...fusion.value,nodePriority:priority as Record<string,number>,overrideNodeByCode:override as Record<string,string>},items:items.value.map(({points,veto,...i})=>({...i,appliesWhenFindingCode:i.appliesWhenFindingCode?.trim()||null})),scoring:{...scoring.value,items:items.value.map(i=>({itemCode:i.itemCode,points:i.points,veto:i.veto}))}};
}
defineExpose({release});
</script>
<template>
<section><h3>检测节点</h3>
<a-form layout="vertical"><a-form-item label="并行执行"><a-switch v-model:checked="parallel" :disabled="disabled"/></a-form-item></a-form>
<p v-if="!parallel">按顺序执行，依赖必须指向前序节点。错误和未执行保留状态。</p>
<template v-else><p>按依赖波次并发，等待全部终态后汇总。只读取显式依赖祖先的输出；变量名称不得跨分支重复。依赖仍指向列表前序节点。</p><a-button :disabled="disabled" @click="initializeParallelSchemas">按当前节点生成输出声明（覆盖现有声明）</a-button><p>修改节点编码或事实类型后需更新声明；自定义输出可在高级配置编辑。服务器会校验变量归属和读取依赖。</p></template><a-button :disabled="disabled || nodes.length>=200" @click="addNode">添加节点</a-button>
<a-collapse><a-collapse-panel v-for="(node,index) in nodes" :key="index" :header="`${index+1}. ${node.name} (${node.nodeId})`">
<a-space wrap><a-button :disabled="disabled || index===0" @click="move(index,-1)">上移</a-button><a-button :disabled="disabled || index===nodes.length-1" @click="move(index,1)">下移</a-button><a-button danger :disabled="disabled" @click="remove(index)">移除</a-button><a-switch v-model:checked="node.enabled" :disabled="disabled"/> <span>正常执行（关闭后可作备用节点）</span></a-space>
<a-form layout="vertical"><a-form-item label="节点编码 / 名称"><a-space><a-input v-model:value="node.nodeId" :disabled="disabled"/><a-input v-model:value="node.name" :disabled="disabled"/></a-space></a-form-item>
<a-form-item label="引擎"><a-select v-model:value="node.type" :options="options(['RULE','DLS','LLM','METRIC','SESSION'])" :disabled="disabled" @change="changeEngine(node)"/></a-form-item>
<a-form-item v-if="node.type!=='METRIC'" label="已发布规则"><PublishedAssetReference v-model="node.config.ruleReference" kind="RULE" :disabled="disabled"/></a-form-item>
<a-form-item label="已发布事实定义"><PublishedAssetReference v-model="node.config.findingReference" kind="FINDING" :disabled="disabled" @code="node.factCode=$event"/><p v-if="node.factCode">输出事实编码：{{node.factCode}}</p></a-form-item>
<template v-if="node.type==='METRIC'">
<p>选择NUMBER且允许METRIC证据的已发布事实定义。使用完整冻结转写区间；缺坐标保留未知，不推断声学静默或真实抢话。</p>
<a-form-item label="指标"><a-select v-model:value="node.config.metric" :options="metricOptions" :disabled="disabled"/></a-form-item>
<a-form-item label="坐席角色 / 客户角色"><a-space><a-input v-model:value="node.config.agentRole" :maxlength="64" :disabled="disabled"/><a-input v-model:value="node.config.customerRole" :maxlength="64" :disabled="disabled"/></a-space><p>角色需与原消息一致，区分大小写。份额按双方区间分别合并计算；均值与份额保留6位小数。</p></a-form-item>
<p>固定引擎版本：{{node.version}}。转写间隙不包含录音首尾；重叠对数不等同抢话次数。</p>
</template>
<template v-if="node.type==='SESSION'">
<p>选择已发布DLS规则。流程判断对应BOOLEAN事实，命中消息数对应NUMBER事实，均需允许RULE_MATCH证据。</p>
<a-form-item label="会话聚合"><a-select v-model:value="node.config.aggregation" :options="sessionOptions" :disabled="disabled" @change="delete node.config.countDefinition"/></a-form-item>
<a-form-item v-if="node.config.aggregation==='MATCHED_MESSAGE_COUNT'" label="DLS RULE子规则名称"><a-input v-model:value="node.config.countDefinition" :maxlength="256" :disabled="disabled" placeholder="rule_example"/></a-form-item>
<p>固定版本：{{node.version}}。使用完整冻结会话；同消息重复命中只计一次，消息数不等于真实行为次数。空会话或规则参与者缺失保留未知。</p>
</template>
<a-form-item v-if="node.type==='LLM'" label="已发布智能体"><PublishedAssetReference v-model="node.config.agentReference" kind="AGENT" :disabled="disabled"/></a-form-item>
<a-form-item v-if="node.type!=='METRIC' && node.type!=='SESSION'" label="阶段 / 输入范围"><a-space><a-select v-model:value="node.config.phase" :options="options(['DIRECT','REVIEW','VERIFY'])" :disabled="disabled" style="width:150px"/><a-select v-model:value="node.config.inputScope" :options="options(['MESSAGE','CONVERSATION'])" :disabled="disabled" style="width:180px"/></a-space></a-form-item>
<a-form-item label="依赖节点"><a-select v-model:value="node.dependsOn" mode="multiple" :options="options(nodes.slice(0,index).map(n=>n.nodeId))" :disabled="disabled"/></a-form-item>
<a-form-item label="条件执行"><a-switch :checked="!!node.condition" :disabled="disabled" @change="condition(node,Boolean($event))"/></a-form-item>
<template v-if="node.condition"><a-form-item label="条件路径"><a-input v-model:value="node.condition.pointer" :disabled="disabled" placeholder="/variables/node_1_value"/></a-form-item><a-form-item label="比较"><a-select v-model:value="node.condition.operator" :options="options(['EXISTS',...numericOperators])" :disabled="disabled"/></a-form-item><a-form-item v-if="node.condition.operator!=='EXISTS'" label="比较值（JSON）"><a-input v-model:value="node.conditionJson" :disabled="disabled" placeholder="true"/></a-form-item></template>
<a-form-item label="超时毫秒 / 重试次数"><a-space><a-input-number v-model:value="node.timeoutMs" :min="1" :max="300000" :precision="0" :disabled="disabled"/><a-input-number v-model:value="node.retries" :min="0" :max="3" :precision="0" :disabled="disabled"/></a-space></a-form-item>
<a-form-item label="错误政策"><a-select v-model:value="node.onError" :options="options(['FAIL_PIPELINE','CONTINUE','MARK_REVIEW','FALLBACK'])" :disabled="disabled"/></a-form-item>
<a-form-item v-if="node.onError==='FALLBACK'" label="备用节点"><a-select v-model:value="node.fallbackNodeId" :options="options(nodes.filter(n=>!n.enabled&&n!==node).map(n=>n.nodeId))" :disabled="disabled"/></a-form-item>
<a-collapse><a-collapse-panel key="mapping" header="高级输入映射与输出校验"><a-form-item label="输入映射（目标字段 → JSON pointer）"><a-textarea v-model:value="node.inputJson" :rows="3" :disabled="disabled"/></a-form-item><a-form-item label="输出变量 schema（JSON 或 null）"><a-textarea v-model:value="node.outputJson" :rows="3" :disabled="disabled"/></a-form-item><p>路径使用 /input、/variables、/upstream。保留空映射时使用原始输入。</p></a-collapse-panel></a-collapse>
</a-form></a-collapse-panel></a-collapse>
<h3>事实融合</h3><a-form v-if="fusion" layout="vertical"><a-form-item label="政策标识 / 版本"><a-space><a-input v-model:value="fusion.id" :disabled="disabled"/><a-input-number v-model:value="fusion.version" :min="1" :precision="0" :disabled="disabled"/></a-space></a-form-item><a-form-item label="融合方式"><a-select v-model:value="fusion.method" :options="options(['PRIORITY','VOTING','OVERRIDE','CONFIDENCE'])" :disabled="disabled"/></a-form-item><a-form-item label="节点优先级（JSON）"><a-textarea v-model:value="priorities" :rows="2" :disabled="disabled"/></a-form-item><a-form-item v-if="fusion.method==='OVERRIDE'" label="事实编码 → 覆盖节点（JSON）"><a-textarea v-model:value="overrides" :rows="2" :disabled="disabled"/></a-form-item><template v-if="fusion.method==='CONFIDENCE'"><a-form-item label="校准标识"><a-input v-model:value="fusion.confidenceCalibrationId" :disabled="disabled"/></a-form-item><a-form-item label="已校准节点"><a-select v-model:value="fusion.calibratedNodeIds" mode="multiple" :options="options(nodes.map(n=>n.nodeId))" :disabled="disabled"/></a-form-item><a-alert type="info" message="当前RULE/DLS/LLM/METRIC适配器未输出已校准置信度，选择此政策不会产生确定的融合值。"/></template></a-form>
<FindingLabelPolicyEditor :key="policyEditorGeneration" v-model="labelPolicy" :finding-codes="nodes.map(node=>node.factCode).filter(Boolean)" :disabled="disabled" @action="addLabelAction"/>
<a-alert v-if="actionError" type="error" :message="actionError" show-icon/><ActionPolicyEditor :key="`actions-${policyEditorGeneration}`" v-model="actionPolicy" :labels="labelPolicy" :finding-codes="nodes.map(node=>node.factCode).filter(Boolean)" :item-codes="items.map(item=>item.itemCode).filter(Boolean)" :disabled="disabled"/>
<h3>发布门禁政策</h3><a-switch :checked="!!publicationGate" :disabled="disabled" @change="configurePublicationGate"/> 自定义阈值；未启用时采用95%风险召回、92%F1、100%回归、99.5%结构化成功和5000ms P95默认值。
<a-form v-if="publicationGate" layout="vertical"><a-form-item label="风险召回 / Overall F1 最低比率（0–1）"><a-space><a-input-number v-model:value="publicationGate.minimumRiskRecall" :min="0" :max="1" :step="0.01" :disabled="disabled"/><a-input-number v-model:value="publicationGate.minimumOverallF1" :min="0" :max="1" :step="0.01" :disabled="disabled"/></a-space></a-form-item><a-form-item label="回归通过 / 结构化输出最低比率（0–1）"><a-space><a-input-number v-model:value="publicationGate.minimumRegressionPass" :min="0" :max="1" :step="0.01" :disabled="disabled"/><a-input-number v-model:value="publicationGate.minimumStructuredSuccess" :min="0" :max="1" :step="0.001" :disabled="disabled"/></a-space></a-form-item><a-form-item label="评测计算P95毫秒 / 每类金标最少样本"><a-space><a-input-number v-model:value="publicationGate.maximumP95Ms" :min="1" :max="300000" :precision="0" :disabled="disabled"/><a-input-number v-model:value="publicationGate.minimumSamples" :min="1" :max="1000" :precision="0" :disabled="disabled"/></a-space></a-form-item></a-form>
<h3>业务映射与评分</h3><a-form v-if="scoring" layout="vertical"><a-form-item label="计分方式"><a-select v-model:value="scoring.mode" :options="options(['DEDUCTION','POINTS'])" :disabled="disabled"/></a-form-item><a-form-item label="基础分 / 合格线"><a-space><a-input-number v-model:value="scoring.baseScore" :min="1" :max="100" :precision="0" :disabled="disabled"/><a-input-number v-model:value="scoring.passingScore" :min="0" :max="100" :precision="0" :disabled="disabled"/></a-space></a-form-item></a-form>
<a-button :disabled="disabled" @click="addItem">添加质检项</a-button><a-card v-for="(item,index) in items" :key="index" size="small" style="margin:12px 0"><a-form layout="vertical"><a-form-item label="质检项编码"><a-input v-model:value="item.itemCode" :disabled="disabled"/></a-form-item><a-form-item label="事实编码"><a-select v-model:value="item.findingCode" show-search option-filter-prop="label" :options="options(nodes.map(n=>n.factCode).filter(Boolean))" :disabled="disabled"/></a-form-item><a-form-item label="数值事实阈值"><a-switch :checked="!!item.numericPredicate" :disabled="disabled" @change="numeric(item,false,Boolean($event))"/><p>布尔事实直接判断；NUMBER事实需启用比较。未知/冲突/错误不转换为0或false。</p></a-form-item><template v-if="item.numericPredicate"><a-form-item label="比较 / 精确阈值"><a-space><a-select v-model:value="item.numericPredicate.operator" :options="options(numericOperators)" :disabled="disabled" style="width:210px"/><a-input v-model:value="item.numericPredicate.threshold" :maxlength="64" :disabled="disabled" placeholder="十进制字符串，例如 0.500000"/></a-space></a-form-item></template><a-form-item label="命中含义"><a-select v-model:value="item.hitMeaning" :options="[{value:'VIOLATION',label:'命中代表违规'},{value:'COMPLIANCE',label:'命中代表满足'}]" :disabled="disabled"/></a-form-item><a-form-item label="适用条件事实编码（可空）"><a-input v-model:value="item.appliesWhenFindingCode" :disabled="disabled" @update:value="clearNumericGate(item,$event)"/></a-form-item><template v-if="item.appliesWhenFindingCode"><a-form-item label="适用条件使用数值阈值"><a-switch :checked="!!item.appliesWhenNumericPredicate" :disabled="disabled" @change="numeric(item,true,Boolean($event))"/></a-form-item><a-form-item v-if="item.appliesWhenNumericPredicate" label="适用比较 / 精确阈值"><a-space><a-select v-model:value="item.appliesWhenNumericPredicate.operator" :options="options(numericOperators)" :disabled="disabled" style="width:210px"/><a-input v-model:value="item.appliesWhenNumericPredicate.threshold" :maxlength="64" :disabled="disabled"/></a-space><p>已知比较不满足为不适用，未知保持待复核。</p></a-form-item></template><a-form-item label="分值 / 一票否决"><a-space><a-input-number v-model:value="item.points" :min="scoring?.mode==='POINTS'?1:0" :max="100" :precision="0" :disabled="disabled"/><a-switch v-model:checked="item.veto" :disabled="disabled"/><a-button danger :disabled="disabled" @click="items.splice(index,1)">移除</a-button></a-space></a-form-item></a-form></a-card>
</section>
</template>
