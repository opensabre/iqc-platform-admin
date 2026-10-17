<script setup lang="ts">
import {computed,ref,watch,shallowRef} from 'vue';
import {message} from 'ant-design-vue';
import {segmentRange,confidenceLabel} from '@/utils/transcriptAlignment';
import {selectorJsonNeedsExactEditor} from '@/api/selectors';
import {usePermission} from '@/composables/permission';
import {getGoldSample,annotateGold,reviewGold,listGoldVersions,getGoldVersion,type GoldSample,type GoldDraft,type GoldFinding,type GoldVersion,type GoldDecision,type JsonValue} from '@/api/evaluation';
const props=defineProps<{sampleId:string}>(),emit=defineEmits<{changed:[]}>();const {can}=usePermission();
const sample=ref<GoldSample>(),draft=shallowRef<GoldDraft>(),findings=ref<Array<Omit<GoldFinding,'value'>&{value:boolean|string|number|null;objectText:string}>>([]),tags=ref<string[]>([]),difficulty=ref<GoldDraft['difficulty']>('BASIC'),context=ref('{}'),decisionEnabled=ref(false),decision=ref<Omit<GoldDecision,'labels'>>({}),labels=ref('{}'),reason=ref('');
const loading=ref(false),busy=ref(false),error=ref(''),baseline=ref(''),versions=ref<GoldVersion[]>([]),historyPage=ref(1),historyTotal=ref(0),snapshot=ref('');let generation=0,historyGeneration=0,snapshotGeneration=0;
const precisionRestricted=ref(false),scoreText=ref('');
const types=['BOOLEAN','STRING','NUMBER','ENUM','OBJECT'],states=['KNOWN','UNKNOWN','CONFLICT','ERROR','NOT_EVALUATED'];
const stateKey=()=>JSON.stringify([findings.value,tags.value,difficulty.value,context.value,decisionEnabled.value,decision.value,labels.value,scoreText.value]);const dirty=computed(()=>!!sample.value&&!error.value&&baseline.value!==stateKey());
defineExpose({hasUnsavedChanges:()=>dirty.value||!!reason.value.trim(),isBusy:()=>busy.value||loading.value});
const editable=computed(()=>can('iqc:gold:annotate')&&!precisionRestricted.value&&!busy.value&&!loading.value&&!error.value);
function populate(row:GoldSample){
 sample.value=row;draft.value=undefined;precisionRestricted.value=false;
 if(row.goldDraftJson){
  const d=JSON.parse(row.goldDraftJson) as GoldDraft;
  if(d.schemaVersion!=='iqc-gold-draft-v1'||d.sourceSampleId!==props.sampleId||!Array.isArray(d.messages)||!Array.isArray(d.findings))throw Error('草稿协议无效');
  precisionRestricted.value=selectorJsonNeedsExactEditor(row.goldDraftJson);
  if(precisionRestricted.value){
   findings.value=[];tags.value=[];difficulty.value='BASIC';context.value='{}';decisionEnabled.value=false;decision.value={};labels.value='{}';scoreText.value='';baseline.value=stateKey();return;
  }
  draft.value=d;
 }
 const d=draft.value;
 findings.value=(d?.findings??[]).map(f=>({...f,value:typeof f.value==='boolean'||typeof f.value==='string'||typeof f.value==='number'?f.value:null,evidenceMessageIds:[...f.evidenceMessageIds],objectText:JSON.stringify(f.value??{},null,2)}));
 tags.value=d?.tags??[];difficulty.value=d?.difficulty??'BASIC';context.value=JSON.stringify(d?.businessContext?.annotation??{},null,2);decisionEnabled.value=!!d?.decision;
 decision.value={score:d?.decision?.score,scoreStatus:d?.decision?.scoreStatus,risk:d?.decision?.risk};scoreText.value=d?.decision?.score==null?'':String(d.decision.score);
 labels.value=JSON.stringify(d?.decision?.labels??{},null,2);baseline.value=stateKey();
}
async function load(){const ticket=++generation;++historyGeneration;++snapshotGeneration;sample.value=undefined;draft.value=undefined;precisionRestricted.value=false;scoreText.value='';findings.value=[];versions.value=[];historyPage.value=1;historyTotal.value=0;snapshot.value='';reason.value='';tags.value=[];difficulty.value='BASIC';context.value='{}';decisionEnabled.value=false;decision.value={};labels.value='{}';baseline.value='';error.value='';loading.value=true;busy.value=false;try{const row=await getGoldSample(props.sampleId);if(ticket===generation)populate(row);}catch{if(ticket===generation)error.value='金标草稿加载失败或协议无效，请重试。';}finally{if(ticket===generation)loading.value=false;}}
watch(()=>props.sampleId,()=>void load(),{immediate:true});
class GoldPrecisionError extends Error {}
function exactJson(raw:string){
 if(selectorJsonNeedsExactEditor(raw))throw new GoldPrecisionError('此表单无法精确保留该数值，请使用原标注接口提交精确JSON；未保存或舍入。');
 return JSON.parse(raw);
}
function numeric(value:unknown):number{
 if(typeof value!=='string'&&typeof value!=='number')throw Error('需要数值');
 const parsed=exactJson(String(value).trim());
 if(typeof parsed!=='number'||!Number.isFinite(parsed))throw Error('需要有限JSON数值');
 return parsed;
}
function object(raw:string):Record<string,JsonValue>{const v=exactJson(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw Error('需要 JSON 对象');return v;}
function newFinding(){findings.value.push({code:'',valueType:'BOOLEAN',state:'KNOWN',value:false,evidenceMessageIds:[],objectText:'{}'});}
function changeType(f:typeof findings.value[number]){f.value=f.valueType==='BOOLEAN'?false:f.valueType==='NUMBER'?0:'';f.objectText='{}';}
async function save(){if(!editable.value||!sample.value)return;const id=props.sampleId,ticket=generation;try{const fs:GoldFinding[]=findings.value.map(f=>{let value:JsonValue=f.state==='KNOWN'?(f.valueType==='OBJECT'?object(f.objectText):f.valueType==='NUMBER'?numeric(f.value):f.value):null;if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(f.code)||f.state==='KNOWN'&&(value===null||f.valueType==='NUMBER'&&(typeof value!=='number'||!Number.isFinite(value))))throw Error('请检查事实编码和值');return {code:f.code,valueType:f.valueType,state:f.state,value,evidenceMessageIds:f.evidenceMessageIds};});if(!fs.length||new Set(fs.map(f=>f.code)).size!==fs.length)throw Error('至少一个事实，编码不得重复');const d=decisionEnabled.value?{...decision.value,score:decision.value.scoreStatus==='FINAL'?numeric(scoreText.value):null,labels:object(labels.value)}:undefined;if(d?.scoreStatus==='FINAL'&&(d.score==null||d.score<0||d.score>100))throw Error('最终分数须为0–100');const data={expectedRevision:sample.value.goldDraftRevision??0,findings:fs,businessContext:object(context.value),tags:tags.value,difficulty:difficulty.value,decision:d};busy.value=true;const row=await annotateGold(id,data);if(ticket===generation){populate(row);emit('changed');message.success('金标草稿已保存，等待独立审核');}}catch(e){if(ticket===generation)message.error(e instanceof GoldPrecisionError?e.message:e instanceof SyntaxError?'JSON 格式无效':'保存未成功，请检查字段，或重新加载核对修订。');}finally{if(ticket===generation)busy.value=false;}}
async function review(approve:boolean){if(!sample.value||dirty.value||busy.value||!reason.value.trim())return;const id=props.sampleId,ticket=generation;busy.value=true;try{await reviewGold(id,{expectedRevision:sample.value.goldDraftRevision,approve,reason:reason.value});const row=await getGoldSample(id);if(ticket===generation){populate(row);reason.value='';emit('changed');message.success('审核决定已保存');}}catch{if(ticket===generation)message.error('审核未成功，请核对独立审核人、修订和审核状态。');}finally{if(ticket===generation)busy.value=false;}}
async function history(page=1){const id=props.sampleId,ticket=generation,request=++historyGeneration;historyPage.value=page;try{const data=await listGoldVersions(id,page);if(ticket===generation&&request===historyGeneration){versions.value=data.records;historyTotal.value=data.total;}}catch{if(ticket===generation)message.error('历史加载失败');}}
async function view(v:GoldVersion){const ticket=generation,id=props.sampleId,request=++snapshotGeneration;try{const row=await getGoldVersion(id,v.versionNo);if(ticket===generation&&request===snapshotGeneration)snapshot.value=selectorJsonNeedsExactEditor(row.snapshotJson??'null')?(row.snapshotJson??'null'):JSON.stringify(JSON.parse(row.snapshotJson??'null'),null,2);}catch{if(ticket===generation)message.error('版本快照加载失败');}}
</script>
<template>
<a-spin :spinning="loading"><a-alert v-if="error" type="error" :message="error"/><a-button v-if="error" @click="load">重试</a-button><template v-if="sample">
<p>{{sample.name}} · 修订 {{sample.goldDraftRevision??0}} · {{sample.goldStatus??'未标注'}} <a-tag v-if="dirty" color="orange">未保存</a-tag></p>
<a-alert v-if="!draft&&!precisionRestricted" type="info" message="第一次保存标注时由服务器冻结完整会话。保存后可选取冻结消息作为证据，再由另一位用户审核。"/>
<template v-if="draft"><p>会话 {{draft.conversationId}} · 标注人 {{draft.annotatorId}}</p><a-collapse><a-collapse-panel key="messages" :header="`冻结会话（${draft.messages.length}条）`"><article v-for="m in draft.messages" :key="m.id"><strong>{{m.sequence}} · {{m.role}} · {{m.id}} · {{m.relativeTime}}</strong><p v-if="segmentRange(m)||confidenceLabel(m.confidence)"><span v-if="segmentRange(m)">转写区间 {{segmentRange(m)}}</span> <span v-if="confidenceLabel(m.confidence)">置信度 {{confidenceLabel(m.confidence)}}</span></p><p class="text">{{m.content}}</p></article></a-collapse-panel></a-collapse></template>
<template v-if="precisionRestricted"><a-alert type="warning" show-icon message="金标含本表单无法精确保留的数值，标注表单已只读，原始JSON保持不变。审核仍针对服务器保存的精确修订。"/><pre class="exact-snapshot">{{sample.goldDraftJson}}</pre></template>
<a-form v-if="!precisionRestricted" layout="vertical"><a-form-item label="难度"><a-select v-model:value="difficulty" :disabled="!editable" :options="['BASIC','INTERMEDIATE','HARD'].map(value=>({value,label:value}))"/></a-form-item><a-form-item label="标签"><a-select v-model:value="tags" mode="tags" :disabled="!editable"/></a-form-item><a-form-item label="补充业务上下文（JSON 对象）"><a-textarea v-model:value="context" :rows="3" :disabled="!editable"/></a-form-item>
<h3>期望事实</h3><a-card v-for="(f,i) in findings" :key="i" size="small" class="finding"><a-form-item label="稳定事实编码"><a-input v-model:value="f.code" :maxlength="64" :disabled="!editable"/></a-form-item><a-space><a-select v-model:value="f.valueType" :disabled="!editable" :options="types.map(value=>({value,label:value}))" @change="changeType(f)"/><a-select v-model:value="f.state" :disabled="!editable" :options="states.map(value=>({value,label:value}))"/></a-space>
<a-form-item v-if="f.state==='KNOWN'" label="期望值"><a-switch v-if="f.valueType==='BOOLEAN'" :checked="f.value===true" :disabled="!editable" @change="(v:boolean|string|number)=>f.value=!!v"/><a-input v-else-if="f.valueType==='NUMBER'" :value="typeof f.value==='number'||typeof f.value==='string'?String(f.value):''" :disabled="!editable" placeholder="JSON数值，保存前校验精度" @update:value="(v:string)=>f.value=v"/><a-textarea v-else-if="f.valueType==='OBJECT'" v-model:value="f.objectText" :disabled="!editable" :rows="3"/><a-input v-else :value="typeof f.value==='string'?f.value:''" :disabled="!editable" @update:value="(v:string)=>f.value=v"/></a-form-item>
<a-form-item label="证据消息 ID"><a-select v-model:value="f.evidenceMessageIds" mode="multiple" :disabled="!editable||!draft" :options="(draft?.messages??[]).map(m=>({value:m.id,label:`${m.sequence} · ${m.role} · ${m.id}`}))"/></a-form-item><a-button danger :disabled="!editable" @click="findings.splice(i,1)">删除事实</a-button></a-card><a-button :disabled="!editable||findings.length>=1000" @click="newFinding">添加事实</a-button>
<a-form-item label="标注业务结论（可选）"><a-switch v-model:checked="decisionEnabled" :disabled="!editable"/></a-form-item><template v-if="decisionEnabled"><a-form-item label="分数状态（留空表示未标注）"><a-select v-model:value="decision.scoreStatus" allow-clear :disabled="!editable" :options="['FINAL','PENDING','NOT_APPLICABLE'].map(value=>({value,label:value}))"/></a-form-item><a-form-item v-if="decision.scoreStatus==='FINAL'" label="分数"><a-input v-model:value="scoreText" :disabled="!editable" placeholder="0–100，保存前校验范围和精度"/></a-form-item><a-form-item label="风险（留空表示未标注）"><a-select v-model:value="decision.risk" allow-clear :disabled="!editable" :options="['NONE','LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN'].map(value=>({value,label:value}))"/></a-form-item><a-form-item label="高级标签期望（稳定标签码到 JSON 值）"><a-textarea v-model:value="labels" :rows="3" :disabled="!editable"/></a-form-item></template>
<a-button v-if="can('iqc:gold:annotate')" type="primary" :loading="busy" :disabled="!editable" @click="save">保存标注</a-button></a-form>
<template v-if="can('iqc:gold:review')&&sample.goldStatus==='PENDING_REVIEW'"><h3>独立审核</h3><p>需要另一位登录用户审核已保存的精确修订。</p><a-textarea v-model:value="reason" :maxlength="1000" :disabled="busy" placeholder="审核原因（必填）"/><a-space><a-button :disabled="busy||dirty||!reason.trim()" @click="review(true)">批准</a-button><a-button danger :disabled="busy||dirty||!reason.trim()" @click="review(false)">退回</a-button></a-space></template>
<template v-if="can('iqc:gold:versions:view')"><h3>审核历史</h3><a-button @click="history()">加载 / 刷新</a-button><a-list :data-source="versions"><template #renderItem="{item}"><a-list-item>v{{item.versionNo}} · {{item.decision}} · 修订 {{item.sourceDraftRevision}} · {{item.reviewerId}} · {{item.reason}}<a-button v-if="can('iqc:gold:version:view')" @click="view(item)">查看快照</a-button></a-list-item></template></a-list><a-pagination :current="historyPage" :total="historyTotal" :page-size="20" :show-size-changer="false" @change="history"/><pre v-if="snapshot">{{snapshot}}</pre></template>
</template></a-spin>
</template>
<style scoped>.finding{margin:12px 0}.text,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre{max-height:400px;overflow:auto}.ant-alert,.ant-space{margin:12px 0}</style>
