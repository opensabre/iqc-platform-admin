<script setup lang="ts">
import {ref,watch} from 'vue';
import PublishedAssetReference from './PublishedAssetReference.vue';
import type {PipelineRelease,PipelineNode} from '@/api/pipelines';
const props=defineProps<{initial:PipelineRelease;disabled?:boolean}>();
type NodeDraft=PipelineNode & {inputJson:string;outputJson:string;conditionJson:string;factCode:string};
type ItemDraft=PipelineRelease['items'][number] & {points:number;veto:boolean};
const publicationGate=ref<PipelineRelease['publicationGate']>();
const actionPolicy=ref<PipelineRelease['actionPolicy']>();
function configurePublicationGate(enabled:boolean){publicationGate.value=enabled?{schemaVersion:'iqc-publication-gate-v1',minimumRiskRecall:0.95,minimumOverallF1:0.92,minimumRegressionPass:1,minimumStructuredSuccess:0.995,maximumP95Ms:5000,minimumSamples:1}:undefined;}
const nodes=ref<NodeDraft[]>([]),items=ref<ItemDraft[]>([]),fusion=ref<PipelineRelease['fusion']>(),scoring=ref<PipelineRelease['scoring']>();
const priorities=ref('{}'),overrides=ref('{}');
const options=(values:string[])=>values.map(value=>({value,label:value}));
watch(()=>props.initial,value=>{
 const copy=JSON.parse(JSON.stringify(value)) as PipelineRelease;
 publicationGate.value=copy.publicationGate;actionPolicy.value=copy.actionPolicy;
 nodes.value=copy.pipeline.nodes.map(n=>({...n,inputJson:JSON.stringify(n.inputMapping,null,2),outputJson:JSON.stringify(n.outputSchema,null,2),conditionJson:JSON.stringify(n.condition?.value ?? null),factCode:String((n.config.findingDefinition as {code?:string}|undefined)?.code || '')}));
 items.value=copy.items.map(i=>({...i,points:copy.scoring.items.find(s=>s.itemCode===i.itemCode)?.points ?? 0,veto:copy.scoring.items.find(s=>s.itemCode===i.itemCode)?.veto ?? false}));
 fusion.value=copy.fusion;scoring.value=copy.scoring;priorities.value=JSON.stringify(copy.fusion.nodePriority,null,2);overrides.value=JSON.stringify(copy.fusion.overrideNodeByCode,null,2);
},{immediate:true});
function addNode() {
 let index=nodes.value.length+1;while(nodes.value.some(n=>n.nodeId===`node_${index}`))index++;
 nodes.value.push({nodeId:`node_${index}`,type:'RULE',name:'新检测节点',version:'1',dependsOn:[],inputMapping:{},config:{inputScope:'MESSAGE',phase:'DIRECT'},condition:null,timeoutMs:30000,retries:0,onError:'FAIL_PIPELINE',fallbackNodeId:null,outputSchema:null,enabled:true,inputJson:'{}',outputJson:'null',conditionJson:'null',factCode:''});
}
function move(index:number,delta:number) {const target=index+delta;if(target<0||target>=nodes.value.length)return;[nodes.value[index],nodes.value[target]]=[nodes.value[target]!,nodes.value[index]!];}
function remove(index:number) {nodes.value.splice(index,1);}
function addItem() {items.value.push({itemCode:'',findingCode:'',hitMeaning:'VIOLATION',appliesWhenFindingCode:null,points:10,veto:false});}
function condition(node:NodeDraft,checked:boolean) {node.condition=checked?{pointer:'/input/messages',operator:'EXISTS',value:null}:null;}
function object(raw:string,label:string):Record<string,unknown> {const value=JSON.parse(raw);if(value===null||typeof value!=='object'||Array.isArray(value))throw Error(`${label}必须为对象`);return value;}
function release():PipelineRelease {
 if(!fusion.value||!scoring.value)throw Error('政策未加载');
 const converted=nodes.value.map(n=>{
  const input=object(n.inputJson,'输入映射');if(Object.values(input).some(v=>typeof v!=='string'))throw Error('输入映射的值必须为JSON pointer');
  const output=JSON.parse(n.outputJson);if(output!==null&&(typeof output!=='object'||Array.isArray(output)))throw Error('输出schema必须为对象或null');
  const config={ruleReference:n.config.ruleReference,findingReference:n.config.findingReference,inputScope:n.config.inputScope,phase:n.config.phase,...(n.type==='LLM'?{agentReference:n.config.agentReference}:{})};
  if(!config.ruleReference?.id||!config.ruleReference.versionNo||!config.findingReference?.id||!config.findingReference.versionNo||n.type==='LLM'&&(!n.config.agentReference?.id||!n.config.agentReference.versionNo))throw Error('每个节点须选择已发布规则/事实，LLM另需已发布智能体');
  return {nodeId:n.nodeId,type:n.type,name:n.name,version:n.version,dependsOn:[...n.dependsOn],inputMapping:input as Record<string,string>,config,condition:n.condition?{...n.condition,value:n.condition.operator==='EXISTS'?null:JSON.parse(n.conditionJson)}:null,timeoutMs:n.timeoutMs,retries:n.retries,onError:n.onError,fallbackNodeId:n.onError==='FALLBACK'?n.fallbackNodeId:null,outputSchema:output,enabled:n.enabled};
 });
 const ids=new Set<string>();for(const n of converted){if(!n.nodeId.trim()||ids.has(n.nodeId)||n.dependsOn.some(id=>!ids.has(id)))throw Error('节点编码须唯一，依赖须指向前序节点');ids.add(n.nodeId);}
 if(!converted.length||converted.length>200)throw Error('需要1到200个节点');
 for(const n of converted)if(n.onError==='FALLBACK'){const f=converted.find(v=>v.nodeId===n.fallbackNodeId);if(!f||f.enabled||f.nodeId===n.nodeId||f.onError==='FALLBACK'||f.dependsOn.some(id=>!n.dependsOn.includes(id)))throw Error('备用节点须停用、非递归，且依赖属于源节点依赖');}
 const priority=object(priorities.value,'优先级'),override=object(overrides.value,'覆盖映射');
 if(Object.values(priority).some(v=>!Number.isSafeInteger(v))||Object.values(override).some(v=>typeof v!=='string'))throw Error('优先级必须为整数，覆盖映射必须为节点编码');
 if(publicationGate.value){const p=publicationGate.value;for(const ratio of [p.minimumRiskRecall,p.minimumOverallF1,p.minimumRegressionPass,p.minimumStructuredSuccess])if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<0||ratio>1)throw Error('发布门禁比率必须为0–1');if(!Number.isInteger(p.maximumP95Ms)||p.maximumP95Ms<1||p.maximumP95Ms>300000||!Number.isInteger(p.minimumSamples)||p.minimumSamples<1||p.minimumSamples>1000)throw Error('发布门禁样本/耗时阈值无效');}
 return {...(actionPolicy.value?{actionPolicy:JSON.parse(JSON.stringify(actionPolicy.value)) as NonNullable<PipelineRelease['actionPolicy']>}:{}),...(publicationGate.value?{publicationGate:{...publicationGate.value}}:{}),schemaVersion:'iqc-pipeline-release-v1',pipeline:{schemaVersion:'iqc-pipeline-v1',nodes:converted},fusion:{...fusion.value,nodePriority:priority as Record<string,number>,overrideNodeByCode:override as Record<string,string>},items:items.value.map(({points,veto,...i})=>i),scoring:{...scoring.value,items:items.value.map(i=>({itemCode:i.itemCode,points:i.points,veto:i.veto}))}};
}
defineExpose({release});
</script>
<template>
<section><h3>检测节点</h3><p>按顺序执行，依赖必须指向前序节点。错误和未执行保留状态。</p><a-button :disabled="disabled || nodes.length>=200" @click="addNode">添加节点</a-button>
<a-collapse><a-collapse-panel v-for="(node,index) in nodes" :key="index" :header="`${index+1}. ${node.name} (${node.nodeId})`">
<a-space wrap><a-button :disabled="disabled || index===0" @click="move(index,-1)">上移</a-button><a-button :disabled="disabled || index===nodes.length-1" @click="move(index,1)">下移</a-button><a-button danger :disabled="disabled" @click="remove(index)">移除</a-button><a-switch v-model:checked="node.enabled" :disabled="disabled"/> <span>正常执行（关闭后可作备用节点）</span></a-space>
<a-form layout="vertical"><a-form-item label="节点编码 / 名称"><a-space><a-input v-model:value="node.nodeId" :disabled="disabled"/><a-input v-model:value="node.name" :disabled="disabled"/></a-space></a-form-item>
<a-form-item label="引擎"><a-select v-model:value="node.type" :options="options(['RULE','DLS','LLM'])" :disabled="disabled"/></a-form-item>
<a-form-item label="已发布规则"><PublishedAssetReference v-model="node.config.ruleReference" kind="RULE" :disabled="disabled"/></a-form-item>
<a-form-item label="已发布事实定义"><PublishedAssetReference v-model="node.config.findingReference" kind="FINDING" :disabled="disabled" @code="node.factCode=$event"/><p v-if="node.factCode">输出事实编码：{{node.factCode}}</p></a-form-item>
<a-form-item v-if="node.type==='LLM'" label="已发布智能体"><PublishedAssetReference v-model="node.config.agentReference" kind="AGENT" :disabled="disabled"/></a-form-item>
<a-form-item label="阶段 / 输入范围"><a-space><a-select v-model:value="node.config.phase" :options="options(['DIRECT','REVIEW','VERIFY'])" :disabled="disabled" style="width:150px"/><a-select v-model:value="node.config.inputScope" :options="options(['MESSAGE','CONVERSATION'])" :disabled="disabled" style="width:180px"/></a-space></a-form-item>
<a-form-item label="依赖节点"><a-select v-model:value="node.dependsOn" mode="multiple" :options="options(nodes.slice(0,index).map(n=>n.nodeId))" :disabled="disabled"/></a-form-item>
<a-form-item label="条件执行"><a-switch :checked="!!node.condition" :disabled="disabled" @change="condition(node,Boolean($event))"/></a-form-item>
<template v-if="node.condition"><a-form-item label="条件路径"><a-input v-model:value="node.condition.pointer" :disabled="disabled" placeholder="/variables/node_1_value"/></a-form-item><a-form-item label="比较"><a-select v-model:value="node.condition.operator" :options="options(['EXISTS','EQUALS','NOT_EQUALS','GREATER_OR_EQUAL','LESS_OR_EQUAL'])" :disabled="disabled"/></a-form-item><a-form-item v-if="node.condition.operator!=='EXISTS'" label="比较值（JSON）"><a-input v-model:value="node.conditionJson" :disabled="disabled" placeholder="true"/></a-form-item></template>
<a-form-item label="超时毫秒 / 重试次数"><a-space><a-input-number v-model:value="node.timeoutMs" :min="1" :max="300000" :precision="0" :disabled="disabled"/><a-input-number v-model:value="node.retries" :min="0" :max="3" :precision="0" :disabled="disabled"/></a-space></a-form-item>
<a-form-item label="错误政策"><a-select v-model:value="node.onError" :options="options(['FAIL_PIPELINE','CONTINUE','MARK_REVIEW','FALLBACK'])" :disabled="disabled"/></a-form-item>
<a-form-item v-if="node.onError==='FALLBACK'" label="备用节点"><a-select v-model:value="node.fallbackNodeId" :options="options(nodes.filter(n=>!n.enabled&&n!==node).map(n=>n.nodeId))" :disabled="disabled"/></a-form-item>
<a-collapse><a-collapse-panel key="mapping" header="高级输入映射与输出校验"><a-form-item label="输入映射（目标字段 → JSON pointer）"><a-textarea v-model:value="node.inputJson" :rows="3" :disabled="disabled"/></a-form-item><a-form-item label="输出变量 schema（JSON 或 null）"><a-textarea v-model:value="node.outputJson" :rows="3" :disabled="disabled"/></a-form-item><p>路径使用 /input、/variables、/upstream。保留空映射时使用原始输入。</p></a-collapse-panel></a-collapse>
</a-form></a-collapse-panel></a-collapse>
<h3>事实融合</h3><a-form v-if="fusion" layout="vertical"><a-form-item label="政策标识 / 版本"><a-space><a-input v-model:value="fusion.id" :disabled="disabled"/><a-input-number v-model:value="fusion.version" :min="1" :precision="0" :disabled="disabled"/></a-space></a-form-item><a-form-item label="融合方式"><a-select v-model:value="fusion.method" :options="options(['PRIORITY','VOTING','OVERRIDE','CONFIDENCE'])" :disabled="disabled"/></a-form-item><a-form-item label="节点优先级（JSON）"><a-textarea v-model:value="priorities" :rows="2" :disabled="disabled"/></a-form-item><a-form-item v-if="fusion.method==='OVERRIDE'" label="事实编码 → 覆盖节点（JSON）"><a-textarea v-model:value="overrides" :rows="2" :disabled="disabled"/></a-form-item><template v-if="fusion.method==='CONFIDENCE'"><a-form-item label="校准标识"><a-input v-model:value="fusion.confidenceCalibrationId" :disabled="disabled"/></a-form-item><a-form-item label="已校准节点"><a-select v-model:value="fusion.calibratedNodeIds" mode="multiple" :options="options(nodes.map(n=>n.nodeId))" :disabled="disabled"/></a-form-item><a-alert type="info" message="当前RULE/DLS/LLM适配器未输出已校准置信度，选择此政策不会产生确定的融合值。"/></template></a-form>
<section v-if="actionPolicy"><h3>动作策略</h3><p>策略随流水线版本保存。当前仅支持查看，动作执行尚未开放。</p><a-card v-for="action in actionPolicy.actions" :key="action.actionId" size="small" style="margin:8px 0"><strong>{{action.actionId}}</strong> · {{action.type}} · 版本 {{action.adapterVersion ?? 1}}<p>失败处理：{{action.failureHandling==='ESCALATE_REVIEW'?'升级复核':'仅记录'}}；最多尝试 {{action.retry?.maximumAttempts ?? 1}} 次。</p></a-card><p v-if="!actionPolicy.actions.length">此版本未配置动作。</p></section>
<h3>发布门禁政策</h3><a-switch :checked="!!publicationGate" :disabled="disabled" @change="configurePublicationGate"/> 自定义阈值；未启用时采用95%风险召回、92%F1、100%回归、99.5%结构化成功和5000ms P95默认值。
<a-form v-if="publicationGate" layout="vertical"><a-form-item label="风险召回 / Overall F1 最低比率（0–1）"><a-space><a-input-number v-model:value="publicationGate.minimumRiskRecall" :min="0" :max="1" :step="0.01" :disabled="disabled"/><a-input-number v-model:value="publicationGate.minimumOverallF1" :min="0" :max="1" :step="0.01" :disabled="disabled"/></a-space></a-form-item><a-form-item label="回归通过 / 结构化输出最低比率（0–1）"><a-space><a-input-number v-model:value="publicationGate.minimumRegressionPass" :min="0" :max="1" :step="0.01" :disabled="disabled"/><a-input-number v-model:value="publicationGate.minimumStructuredSuccess" :min="0" :max="1" :step="0.001" :disabled="disabled"/></a-space></a-form-item><a-form-item label="评测计算P95毫秒 / 每类金标最少样本"><a-space><a-input-number v-model:value="publicationGate.maximumP95Ms" :min="1" :max="300000" :precision="0" :disabled="disabled"/><a-input-number v-model:value="publicationGate.minimumSamples" :min="1" :max="1000" :precision="0" :disabled="disabled"/></a-space></a-form-item></a-form>
<h3>业务映射与评分</h3><a-form v-if="scoring" layout="vertical"><a-form-item label="计分方式"><a-select v-model:value="scoring.mode" :options="options(['DEDUCTION','POINTS'])" :disabled="disabled"/></a-form-item><a-form-item label="基础分 / 合格线"><a-space><a-input-number v-model:value="scoring.baseScore" :min="1" :max="100" :precision="0" :disabled="disabled"/><a-input-number v-model:value="scoring.passingScore" :min="0" :max="100" :precision="0" :disabled="disabled"/></a-space></a-form-item></a-form>
<a-button :disabled="disabled" @click="addItem">添加质检项</a-button><a-card v-for="(item,index) in items" :key="index" size="small" style="margin:12px 0"><a-form layout="vertical"><a-form-item label="质检项编码"><a-input v-model:value="item.itemCode" :disabled="disabled"/></a-form-item><a-form-item label="事实编码"><a-select v-model:value="item.findingCode" show-search option-filter-prop="label" :options="options(nodes.map(n=>n.factCode).filter(Boolean))" :disabled="disabled"/></a-form-item><a-form-item label="命中含义"><a-select v-model:value="item.hitMeaning" :options="[{value:'VIOLATION',label:'命中代表违规'},{value:'COMPLIANCE',label:'命中代表满足'}]" :disabled="disabled"/></a-form-item><a-form-item label="适用条件事实编码（可空）"><a-input v-model:value="item.appliesWhenFindingCode" :disabled="disabled"/></a-form-item><a-form-item label="分值 / 一票否决"><a-space><a-input-number v-model:value="item.points" :min="scoring?.mode==='POINTS'?1:0" :max="100" :precision="0" :disabled="disabled"/><a-switch v-model:checked="item.veto" :disabled="disabled"/><a-button danger :disabled="disabled" @click="items.splice(index,1)">移除</a-button></a-space></a-form-item></a-form></a-card>
</section>
</template>
