<script setup lang="ts">
import {computed,ref,watch,shallowRef,onBeforeUnmount} from 'vue';
import {message} from 'ant-design-vue';
import {segmentRange,confidenceLabel} from '@/utils/transcriptAlignment';
import {selectorJsonNeedsExactEditor} from '@/api/selectors';
import {usePermission} from '@/composables/permission';
import {getGoldSample,annotateGold,reviewGold,listGoldVersions,getGoldVersion,type GoldSample,type GoldDraft,type GoldFinding,type GoldVersion,type GoldDecision,type JsonValue} from '@/api/evaluation';
const props=defineProps<{sampleId:string}>(),emit=defineEmits<{changed:[]}>();const {can}=usePermission();
const sample=ref<GoldSample>(),draft=shallowRef<GoldDraft>(),findings=ref<Array<Omit<GoldFinding,'value'>&{value:boolean|string|number|null;objectText:string}>>([]),tags=ref<string[]>([]),difficulty=ref<GoldDraft['difficulty']>('BASIC'),context=ref('{}'),decisionEnabled=ref(false),decision=ref<Omit<GoldDecision,'labels'>>({}),labels=ref('{}'),reason=ref('');
const loading=ref(false),busy=ref(false),error=ref(''),baseline=ref(''),versions=ref<GoldVersion[]>([]),historyPage=ref(1),historyTotal=ref(0),snapshot=ref('');let disposed=false,generation=0,historyGeneration=0,snapshotGeneration=0,commandGeneration=0;
const precisionRestricted=ref(false),scoreText=ref(''),snapshotProjected=ref(false);
function isProjected(privacy:GoldSample['privacy']){return privacy!=null&&(privacy.policyVersion!=='iqc-gold-read-v1'||privacy.canonicalPayloadVisible!==true||privacy.canReadFull!==true||privacy.canReadPii!==true);}
const projectedGold=computed(()=>isProjected(sample.value?.privacy));
function clearAuxiliary(){++historyGeneration;++snapshotGeneration;versions.value=[];historyTotal.value=0;historyPage.value=1;snapshot.value='';snapshotProjected.value=false;}
const goldPreview=computed(()=>sample.value?.privacy?.policyVersion==='iqc-gold-read-v1'?sample.value.privacy.preview:undefined);
const types=['BOOLEAN','STRING','NUMBER','ENUM','OBJECT'],states=['KNOWN','UNKNOWN','CONFLICT','ERROR','NOT_EVALUATED'];
const stateKey=()=>JSON.stringify([findings.value,tags.value,difficulty.value,context.value,decisionEnabled.value,decision.value,labels.value,scoreText.value]);const dirty=computed(()=>!!sample.value&&!error.value&&baseline.value!==stateKey());
defineExpose({hasUnsavedChanges:()=>dirty.value||!!reason.value.trim(),isBusy:()=>busy.value||loading.value});
const editable=computed(()=>!disposed&&can('iqc:gold:annotate')&&!projectedGold.value&&!precisionRestricted.value&&!busy.value&&!loading.value&&!error.value);
function populate(row:GoldSample){
 sample.value=row;draft.value=undefined;precisionRestricted.value=false;
 if(projectedGold.value){
  findings.value=[];tags.value=[];difficulty.value='BASIC';context.value='{}';decisionEnabled.value=false;decision.value={};labels.value='{}';scoreText.value='';baseline.value=stateKey();return;
 }
 if(row.goldDraftJson){
  const d=JSON.parse(row.goldDraftJson) as GoldDraft;
  if(!['iqc-gold-draft-v1','iqc-gold-draft-v2'].includes(d.schemaVersion)||d.sourceSampleId!==props.sampleId||!Array.isArray(d.messages)||!Array.isArray(d.findings))throw Error('草稿协议无效');
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
async function load(){if(disposed)return;const ticket=++generation;++historyGeneration;++snapshotGeneration;sample.value=undefined;draft.value=undefined;precisionRestricted.value=false;scoreText.value='';findings.value=[];versions.value=[];historyPage.value=1;historyTotal.value=0;snapshot.value='';snapshotProjected.value=false;reason.value='';tags.value=[];difficulty.value='BASIC';context.value='{}';decisionEnabled.value=false;decision.value={};labels.value='{}';baseline.value='';error.value='';loading.value=true;busy.value=false;if(!can('iqc:gold:view')){loading.value=false;return;}try{const row=await getGoldSample(props.sampleId);if(!disposed&&ticket===generation&&can('iqc:gold:view'))populate(row);}catch{if(ticket===generation)error.value='金标草稿加载失败或协议无效，请重试。';}finally{if(ticket===generation)loading.value=false;}}
const readScope=computed(()=>JSON.stringify([can('iqc:sensitive:conversation:read'),can('iqc:sensitive:pii:read')]));
watch(()=>JSON.stringify([props.sampleId,can('iqc:gold:view'),readScope.value]),()=>void load(),{immediate:true,flush:'sync'});
watch(()=>JSON.stringify([can('iqc:gold:annotate'),can('iqc:gold:review')]),()=>{++commandGeneration;busy.value=false;},{flush:'sync'});
watch(()=>JSON.stringify([can('iqc:gold:versions:view'),readScope.value]),()=>{++historyGeneration;versions.value=[];historyTotal.value=0;},{flush:'sync'});
watch(()=>JSON.stringify([can('iqc:gold:version:view'),readScope.value]),()=>{++snapshotGeneration;snapshot.value='';snapshotProjected.value=false;},{flush:'sync'});
// Invalidate pending loads and commands when the editor leaves its owning page.
onBeforeUnmount(()=>{disposed=true;++generation;++commandGeneration;clearAuxiliary();});
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
async function save(){if(!editable.value||!sample.value)return;const id=props.sampleId,ticket=generation,request=++commandGeneration;const current=()=>!disposed&&ticket===generation&&request===commandGeneration&&can('iqc:gold:annotate');try{const fs:GoldFinding[]=findings.value.map(f=>{let value:JsonValue=f.state==='KNOWN'?(f.valueType==='OBJECT'?object(f.objectText):f.valueType==='NUMBER'?numeric(f.value):f.value):null;if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(f.code)||f.state==='KNOWN'&&(value===null||f.valueType==='NUMBER'&&(typeof value!=='number'||!Number.isFinite(value))))throw Error('请检查事实编码和值');return {code:f.code,valueType:f.valueType,state:f.state,value,evidenceMessageIds:f.evidenceMessageIds};});if(!fs.length||new Set(fs.map(f=>f.code)).size!==fs.length)throw Error('至少一个事实，编码不得重复');const d=decisionEnabled.value?{...decision.value,score:decision.value.scoreStatus==='FINAL'?numeric(scoreText.value):null,labels:object(labels.value)}:undefined;if(d?.scoreStatus==='FINAL'&&(d.score==null||d.score<0||d.score>100))throw Error('最终分数须为0–100');const data={expectedRevision:sample.value.goldDraftRevision??0,findings:fs,businessContext:object(context.value),tags:tags.value,difficulty:difficulty.value,decision:d};busy.value=true;const receipt=await annotateGold(id,data);if(current()){
 clearAuxiliary();populate(receipt);emit('changed');
 try{if(!can('iqc:gold:view'))return;const row=await getGoldSample(id);if(current()&&can('iqc:gold:view')){populate(row);message.success('金标草稿已保存，等待独立审核');}}
 catch{if(current()){error.value='标注已保存，但完整草稿未重新取得，请刷新核对修订。';message.warning('标注已保存，重新加载失败；请刷新后继续。');}}
 }}catch(e){if(current())message.error(e instanceof GoldPrecisionError?e.message:e instanceof SyntaxError?'JSON 格式无效':'保存未成功，请检查字段，或重新加载核对修订。');}finally{if(current())busy.value=false;}}
async function review(approve:boolean){
 if(disposed||!can('iqc:gold:review')||!sample.value||projectedGold.value||dirty.value||busy.value||!reason.value.trim())return;
 const id=props.sampleId,ticket=generation,request=++commandGeneration;const current=()=>!disposed&&ticket===generation&&request===commandGeneration&&can('iqc:gold:review');busy.value=true;
 try{
  await reviewGold(id,{expectedRevision:sample.value.goldDraftRevision,approve,reason:reason.value});
  if(!current())return;
  clearAuxiliary();sample.value=undefined;draft.value=undefined;findings.value=[];reason.value='';baseline.value='';emit('changed');
  try{if(!can('iqc:gold:view'))return;const row=await getGoldSample(id);if(current()&&can('iqc:gold:view')){populate(row);message.success('审核决定已保存');}}
  catch{if(current()){error.value='审核已保存，但当前草稿未重新取得，请刷新核对状态。';message.warning('审核已保存，重新加载失败；请刷新后继续。');}}
 }catch{if(current())message.error('审核未成功，请核对独立审核人、修订和审核状态。');}
 finally{if(current())busy.value=false;}
}
async function history(page=1){if(disposed||!can('iqc:gold:versions:view'))return;const id=props.sampleId,ticket=generation,request=++historyGeneration;historyPage.value=page;versions.value=[];historyTotal.value=0;try{const data=await listGoldVersions(id,page);if(!disposed&&ticket===generation&&request===historyGeneration&&can('iqc:gold:versions:view')){versions.value=data.records;historyTotal.value=data.total;}}catch{if(!disposed&&ticket===generation&&request===historyGeneration&&can('iqc:gold:versions:view'))message.error('历史加载失败');}}
async function view(v:GoldVersion){
 if(disposed||!can('iqc:gold:version:view'))return;
 const ticket=generation,id=props.sampleId,request=++snapshotGeneration;
 snapshot.value='';snapshotProjected.value=false;
 try{
  const row=await getGoldVersion(id,v.versionNo);if(disposed||ticket!==generation||request!==snapshotGeneration||!can('iqc:gold:version:view'))return;
  snapshotProjected.value=isProjected(row.privacy);
  if(snapshotProjected.value)snapshot.value=JSON.stringify(row.privacy?.policyVersion==='iqc-gold-read-v1'?{previewState:row.privacy.previewState,withheldFields:row.privacy.withheldFields,preview:row.privacy.preview}:{previewState:'UNSUPPORTED_PRIVACY_POLICY'},null,2);
  else snapshot.value=selectorJsonNeedsExactEditor(row.snapshotJson??'null')?(row.snapshotJson??'null'):JSON.stringify(JSON.parse(row.snapshotJson??'null'),null,2);
 }catch{if(!disposed&&ticket===generation&&request===snapshotGeneration&&can('iqc:gold:version:view'))message.error('版本快照加载失败');}
}
</script>
<template>
<a-spin :spinning="loading"><a-alert v-if="error" type="error" :message="error"/><a-button v-if="error" @click="load">重试</a-button><template v-if="sample">
<p>{{sample.name}} · 修订 {{sample.goldDraftRevision??0}} · {{sample.goldStatus??'未标注'}} <a-tag v-if="dirty" color="orange">未保存</a-tag></p>
<a-alert v-if="!draft&&!precisionRestricted&&!projectedGold" type="info" message="第一次保存标注时由服务器冻结完整会话。保存后可选取冻结消息作为证据，再由另一位用户审核。"/>
<template v-if="projectedGold">
<a-alert type="info" show-icon message="当前响应仅含受限展示或操作回执，不能据此标注或审核。请重新加载已授权的原始金标；完整内容需完整会话和PII读取授权。"/>
<template v-if="goldPreview"><p>冻结输入预览：{{goldPreview.privacy.visibleMessageCount}} / {{goldPreview.privacy.totalMessageCount}} 条 · 已按现有规则脱敏{{goldPreview.privacy.contentLimited?' · 正文受限':''}}</p>
<article v-for="m in goldPreview.messages" :key="m.id"><strong>消息 #{{m.sequenceNo}} · {{m.speakerRole}} · {{m.id}}</strong><p class="text">{{m.content??'正文未展示'}}</p></article>
<h3>期望事实元数据（值未展示）</h3><a-list :data-source="goldPreview.findings"><template #renderItem="{item}"><a-list-item>{{item.code}} · {{item.valueType}} · {{item.state}} · 证据 {{item.evidenceMessageIds.join('、')||'无引用'}}</a-list-item></template></a-list>
</template>
<p v-else>{{sample.privacy?.previewState==='INVALID_GOLD'?'冻结金标不能可靠预览，请核对原版本；不能据此推断无事实。':'当前未提供冻结金标预览，原始来源字段未在此响应返回。'}}</p>
</template>
<template v-if="draft"><p>会话 {{draft.conversationId}} · 标注人 {{draft.annotatorId}}</p><a-collapse><a-collapse-panel key="messages" :header="`冻结会话（${draft.messages.length}条）`"><article v-for="m in draft.messages" :key="m.id"><strong>{{m.sequence}} · {{m.role}} · {{m.id}} · {{m.relativeTime}}</strong><p v-if="segmentRange(m)||confidenceLabel(m.confidence)"><span v-if="segmentRange(m)">转写区间 {{segmentRange(m)}}</span> <span v-if="confidenceLabel(m.confidence)">置信度 {{confidenceLabel(m.confidence)}}</span></p><p class="text">{{m.content}}</p></article></a-collapse-panel></a-collapse></template>
<template v-if="precisionRestricted&&!projectedGold"><a-alert type="warning" show-icon message="金标含本表单无法精确保留的数值，标注表单已只读，原始JSON保持不变。审核仍针对服务器保存的精确修订。"/><pre class="exact-snapshot">{{sample.goldDraftJson}}</pre></template>
<a-form v-if="!precisionRestricted&&!projectedGold" layout="vertical"><a-form-item label="难度"><a-select v-model:value="difficulty" :disabled="!editable" :options="['BASIC','INTERMEDIATE','HARD'].map(value=>({value,label:value}))"/></a-form-item><a-form-item label="标签"><a-select v-model:value="tags" mode="tags" :disabled="!editable"/></a-form-item><a-form-item label="补充业务上下文（JSON 对象）"><a-textarea v-model:value="context" :rows="3" :disabled="!editable"/></a-form-item>
<h3>期望事实</h3><a-card v-for="(f,i) in findings" :key="i" size="small" class="finding"><a-form-item label="稳定事实编码"><a-input v-model:value="f.code" :maxlength="64" :disabled="!editable"/></a-form-item><a-space><a-select v-model:value="f.valueType" :disabled="!editable" :options="types.map(value=>({value,label:value}))" @change="changeType(f)"/><a-select v-model:value="f.state" :disabled="!editable" :options="states.map(value=>({value,label:value}))"/></a-space>
<a-form-item v-if="f.state==='KNOWN'" label="期望值"><a-switch v-if="f.valueType==='BOOLEAN'" :checked="f.value===true" :disabled="!editable" @change="(v:boolean|string|number)=>f.value=!!v"/><a-input v-else-if="f.valueType==='NUMBER'" :value="typeof f.value==='number'||typeof f.value==='string'?String(f.value):''" :disabled="!editable" placeholder="JSON数值，保存前校验精度" @update:value="(v:string)=>f.value=v"/><a-textarea v-else-if="f.valueType==='OBJECT'" v-model:value="f.objectText" :disabled="!editable" :rows="3"/><a-input v-else :value="typeof f.value==='string'?f.value:''" :disabled="!editable" @update:value="(v:string)=>f.value=v"/></a-form-item>
<a-form-item label="证据消息 ID"><a-select v-model:value="f.evidenceMessageIds" mode="multiple" :disabled="!editable||!draft" :options="(draft?.messages??[]).map(m=>({value:m.id,label:`${m.sequence} · ${m.role} · ${m.id}`}))"/></a-form-item><a-button danger :disabled="!editable" @click="findings.splice(i,1)">删除事实</a-button></a-card><a-button :disabled="!editable||findings.length>=1000" @click="newFinding">添加事实</a-button>
<a-form-item label="标注业务结论（可选）"><a-switch v-model:checked="decisionEnabled" :disabled="!editable"/></a-form-item><template v-if="decisionEnabled"><a-form-item label="分数状态（留空表示未标注）"><a-select v-model:value="decision.scoreStatus" allow-clear :disabled="!editable" :options="['FINAL','PENDING','NOT_APPLICABLE'].map(value=>({value,label:value}))"/></a-form-item><a-form-item v-if="decision.scoreStatus==='FINAL'" label="分数"><a-input v-model:value="scoreText" :disabled="!editable" placeholder="0–100，保存前校验范围和精度"/></a-form-item><a-form-item label="风险（留空表示未标注）"><a-select v-model:value="decision.risk" allow-clear :disabled="!editable" :options="['NONE','LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN'].map(value=>({value,label:value}))"/></a-form-item><a-form-item label="高级标签期望（绑定地址到 JSON 值）" extra="例如 {&quot;/labelId/valueCode&quot;: true}；地址中的 ~ 写作 ~0，/ 写作 ~1。须对应流水线冻结绑定；旧名称键保留为未测量。"><a-textarea v-model:value="labels" :rows="3" :disabled="!editable"/></a-form-item></template>
<a-button v-if="can('iqc:gold:annotate')" type="primary" :loading="busy" :disabled="!editable" @click="save">保存标注</a-button></a-form>
<template v-if="can('iqc:gold:review')&&sample.goldStatus==='PENDING_REVIEW'&&!projectedGold"><h3>独立审核</h3><p>需要另一位登录用户审核已保存的精确修订。</p><a-textarea v-model:value="reason" :maxlength="1000" :disabled="busy" placeholder="审核原因（必填）"/><a-space><a-button :disabled="busy||dirty||!reason.trim()" @click="review(true)">批准</a-button><a-button danger :disabled="busy||dirty||!reason.trim()" @click="review(false)">退回</a-button></a-space></template>
<template v-if="can('iqc:gold:versions:view')"><h3>审核历史</h3><a-button @click="history()">加载 / 刷新</a-button><a-list :data-source="versions"><template #renderItem="{item}"><a-list-item>v{{item.versionNo}} · {{item.decision}} · 修订 {{item.sourceDraftRevision}} · {{item.reviewerId}} · {{item.reason??(item.privacy?.withheldFields?.includes("reason")?"原因未展示":"")}}<a-button v-if="can('iqc:gold:version:view')" @click="view(item)">查看快照</a-button></a-list-item></template></a-list><a-pagination :current="historyPage" :total="historyTotal" :page-size="20" :show-size-changer="false" @change="history"/><a-alert v-if="snapshot&&snapshotProjected" type="info" message="以下是受限展示预览，不是原始金标快照；原版本摘要不按预览重新计算。"/><pre v-if="snapshot">{{snapshot}}</pre></template>
</template></a-spin>
</template>
<style scoped>.finding{margin:12px 0}.text,pre{white-space:pre-wrap;overflow-wrap:anywhere}pre{max-height:400px;overflow:auto}.ant-alert,.ant-space{margin:12px 0}</style>
