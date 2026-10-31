<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {validateDecimalOperand} from '@/api/action-policy-editor';
import {getHumanFindingContext,type HumanFindingContext,type HumanFindingDecision,type HumanClaimSourceSupport,type HumanModelClaim} from '@/api/quality';
const props=defineProps<{resultId:string;disabled:boolean;refreshToken?:number|string}>();
const emit=defineEmits<{save:[decision:HumanFindingDecision]}>();
const context=ref<HumanFindingContext>(),loading=ref(false),error=ref(''),code=ref<string>();
const state=ref<'KNOWN'|'UNKNOWN'>('KNOWN'),valueJson=ref('null'),severity=ref<HumanFindingDecision['severity']>('NONE');
const reason=ref(''),retained=ref<string[]>([]),added=ref<string[]>([]);let generation=0,disposed=false;
interface ClaimDraft {claim:HumanModelClaim;enabled:boolean;verdict?:HumanClaimSourceSupport['verdict'];evidenceIds:string[];messageIds:string[];reason:string}
const claimDrafts=ref<ClaimDraft[]>([]);
const supportOptions=[{value:'SUPPORTED',label:'有来源支持'},{value:'CONTRADICTED',label:'与来源矛盾'},{value:'INSUFFICIENT_SOURCE',label:'来源不足'}];
const selected=computed(()=>context.value?.findings.find(finding=>finding.code===code.value));
function reset(){code.value=undefined;state.value='KNOWN';valueJson.value='null';severity.value='NONE';reason.value='';retained.value=[];added.value=[];claimDrafts.value=[];}
async function load(){if(disposed)return;const ticket=++generation,id=props.resultId;loading.value=true;error.value='';context.value=undefined;reset();
 try{const result=await getHumanFindingContext(id);if(!disposed&&ticket===generation&&id===props.resultId){if(result.sourceResultId!==id)throw Error();
 const p=result.privacy;
 context.value=p&&(p.policyVersion!=='iqc-finding-review-context-read-v1'||!p.canonicalPayloadVisible||!p.canReadFull||!p.canReadPii)
 ?{...result,available:false,message:result.message||'事实正文未展示，请重新读取授权上下文。',findings:[],messages:[]}:result;}}
 catch{if(ticket===generation)error.value='人工Finding上下文加载失败，请刷新后重试。';}
 finally{if(ticket===generation)loading.value=false;}}
onBeforeUnmount(()=>{disposed=true;generation++;context.value=undefined;reset();});
watch(()=>[props.resultId,props.refreshToken],()=>{void load();},{immediate:true,flush:'sync'});
watch(selected,finding=>{reason.value='';claimDrafts.value=[];if(!finding)return;state.value=finding.state==='KNOWN'?'KNOWN':'UNKNOWN';valueJson.value=finding.valueJson;severity.value=finding.severity;retained.value=[...finding.retainedEvidenceIds];added.value=[...finding.addedMessageIds];
 claimDrafts.value=(finding.modelClaims??[]).map(claim=>{const saved=finding.sourceSupport?.find(item=>item.rawFindingId===claim.rawFindingId);
  return {claim,enabled:!!saved,verdict:saved?.verdict,evidenceIds:[...(saved?.evidenceIds??[])],messageIds:[...(saved?.messageIds??[])],reason:saved?.reason??''};});});
function sourceSupport():HumanClaimSourceSupport[]{
 const messageIds=new Set(context.value?.messages.map(message=>message.id));
 const identities=new Set<string>();
 if(claimDrafts.value.filter(draft=>draft.enabled).length>1000)throw Error('每个 Finding 最多标注1000条模型事实');
 return claimDrafts.value.filter(draft=>draft.enabled).map(draft=>{
  if(!selected.value?.modelClaims?.some(claim=>claim.rawFindingId===draft.claim.rawFindingId)||identities.has(draft.claim.rawFindingId))throw Error('模型事实来源已变化，请刷新冻结事实');
  identities.add(draft.claim.rawFindingId);
  if(!draft.verdict||!supportOptions.some(option=>option.value===draft.verdict)||!draft.reason.trim()||draft.reason.trim().length>1000)throw Error('请为每条启用标注选择来源支持结论并填写原因');
  const evidenceIds=new Set(draft.claim.evidence.map(item=>item.id));
  if(draft.evidenceIds.length+draft.messageIds.length>100||new Set(draft.evidenceIds).size!==draft.evidenceIds.length||new Set(draft.messageIds).size!==draft.messageIds.length
    ||draft.evidenceIds.some(id=>!evidenceIds.has(id))||draft.messageIds.some(id=>!messageIds.has(id)))throw Error('来源标注须引用该模型事实的证据或冻结会话消息，最多100条且不能重复');
  if(draft.verdict!=='INSUFFICIENT_SOURCE'&&!draft.evidenceIds.length&&!draft.messageIds.length)throw Error('有来源支持或与来源矛盾的标注必须引用来源');
  return {rawFindingId:draft.claim.rawFindingId,verdict:draft.verdict,evidenceIds:[...draft.evidenceIds],messageIds:[...draft.messageIds],reason:draft.reason.trim()};
 });
}
function validateValue(raw:string){
 if(raw.length>100000)throw Error('JSON原文最多100000字符');
 // Inspect numeric tokens outside strings, without converting their values to browser numbers.
 for(const match of raw.matchAll(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)){
  const token=match[0];if(token.startsWith('"'))continue;
  const parts=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token)!;
  let digits=(parts[2]+(parts[3]??'')).replace(/^0+/,'');if(!digits){validateDecimalOperand('0');continue;}
  const exponentText=(parts[4]??'0').replace(/^([+-]?)0+/,'$1')||'0';
  if(exponentText.replace(/^[+-]/,'').length>5)throw Error('数值指数超出范围');
  let exponent=BigInt(exponentText==='+'||exponentText==='-'?'0':exponentText)-BigInt((parts[3]??'').length);
  const zeros=/0+$/.exec(digits)?.[0].length??0;digits=digits.slice(0,digits.length-zeros);exponent+=BigInt(zeros);
  if(digits.length>38||exponent>38n||exponent< -18n)throw Error('数值最多38位有效数字及18位小数');
  const position=digits.length+Number(exponent);
  const plain=exponent>=0n?digits+'0'.repeat(Number(exponent)):position>0?digits.slice(0,position)+'.'+digits.slice(position):'0.'+'0'.repeat(-position)+digits;
  validateDecimalOperand(parts[1]+plain);
 }
 const parsed:unknown=JSON.parse(raw);let nodes=0,characters=0;
 const visit=(value:unknown,depth:number)=>{if(depth>32||++nodes>10000)throw Error('JSON最多32层、10000节点');
  if(typeof value==='string')characters+=value.length;
  else if(Array.isArray(value))value.forEach(child=>visit(child,depth+1));
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){characters+=key.length;visit(child,depth+1);}
  if(characters>100000)throw Error('JSON文本过大');};visit(parsed,0);
 if(state.value==='KNOWN'&&selected.value){const type=selected.value.valueType;
  if(type==='BOOLEAN'&&typeof parsed!=='boolean'||type==='NUMBER'&&typeof parsed!=='number'
   ||['STRING','ENUM'].includes(type)&&typeof parsed!=='string'||type==='OBJECT'&&(!parsed||typeof parsed!=='object'||Array.isArray(parsed)))throw Error('值类型与冻结Finding定义不一致');
  if(type==='ENUM'&&!selected.value.allowedValues.includes(parsed as string))throw Error('值不在冻结枚举范围内');
 }
 return parsed;
}
function save(){if(disposed||props.disabled||loading.value||!selected.value||!context.value?.available||context.value.sourceResultId!==props.resultId||!reason.value.trim())return;
 // Keep the original JSON text: parsing and reserializing here would round high precision decimals.
 let support:HumanClaimSourceSupport[];
 try{validateValue(state.value==='UNKNOWN'?'null':valueJson.value);if(retained.value.length+added.value.length>100)throw Error('证据最多100条');support=sourceSupport();}
 catch(invalid){error.value=invalid instanceof Error?invalid.message:'值必须是合法JSON';return;}
 error.value='';emit('save',{sourceResultId:props.resultId,findingCode:selected.value.code,expectedFindingHash:selected.value.expectedFindingHash,
 state:state.value,valueJson:state.value==='UNKNOWN'?'null':valueJson.value,severity:severity.value,reason:reason.value.trim(),retainedEvidenceIds:[...retained.value],addedMessageIds:[...added.value],
 ...(support.length?{sourceSupport:support}:{})});}
</script>
<template>
 <a-card title="修正 Finding" size="small">
  <a-alert v-if="error" type="error" :message="error"/>
  <a-button :disabled="disabled||loading" :loading="loading" @click="load">刷新冻结事实</a-button>
  <a-alert v-if="context&&!context.available" type="info" :message="context.message||'该结果不支持Finding修正'"/>
  <a-form v-if="context?.available" layout="vertical" :disabled="disabled||loading">
   <p>基于冻结输入和事实摘要修正；人工项目裁决优先于Finding映射。原机器Finding保留，标签/风险仅重算人工投影。</p>
   <a-form-item label="事实"><a-select v-model:value="code" :options="context.findings.map(f=>({value:f.code,label:`${f.code} · ${f.valueType}`}))"/></a-form-item>
   <template v-if="selected">
    <p>允许证据：{{selected.allowedEvidenceTypes.join('、')||'按冻结定义'}}；{{selected.evidenceRequired?'需要证据':'高风险确定结论必须有证据'}}。</p>
    <p v-if="selected.allowedValues.length">枚举范围：{{selected.allowedValues.join('、')}}</p>
    <a-form-item label="事实状态"><a-select v-model:value="state" :options="[{value:'KNOWN',label:'已知'},{value:'UNKNOWN',label:'未知'}]"/></a-form-item>
    <a-form-item v-if="state==='KNOWN'" label="有效值（JSON原文，支持精确小数）"><a-textarea v-model:value="valueJson" :maxlength="100000" :rows="3"/></a-form-item>
    <a-form-item label="严重度"><a-select v-model:value="severity" :options="['NONE','LOW','MEDIUM','HIGH','CRITICAL'].map(value=>({value,label:value}))"/></a-form-item>
    <a-form-item label="保留原证据（取消选择即删除）"><a-select v-model:value="retained" mode="multiple" :options="selected.evidence.map(e=>({value:e.id,label:`${e.type} · ${e.reference}`}))"/></a-form-item>
    <a-form-item label="补充冻结会话证据"><a-select v-model:value="added" mode="multiple" option-filter-prop="label" :options="context.messages.map(m=>({value:m.id,label:`#${m.sequenceNo} ${m.speakerRole} ${m.content.slice(0,80)}`}))"/></a-form-item>
    <template v-if="claimDrafts.length">
     <a-divider>模型事实来源支持（可选）</a-divider>
     <p>逐条核对原模型事实与冻结来源；这些人工标注不等于自动幻觉率。未勾选的事实不计为已标注。保存会同时提交本次 Finding 裁决并重算人工投影。</p>
     <a-collapse>
      <a-collapse-panel v-for="draft in claimDrafts" :key="draft.claim.rawFindingId" :header="`${draft.claim.nodeId} · ${draft.claim.engineVersion} · 第${draft.claim.runIndex}次`">
       <p>模型原值（{{draft.claim.valueType}}）：<code>{{draft.claim.valueJson}}</code></p>
       <p v-if="draft.claim.reason">模型原原因：{{draft.claim.reason}}</p>
       <a-checkbox v-model:checked="draft.enabled">标注此模型事实</a-checkbox>
       <template v-if="draft.enabled">
        <a-form-item label="来源支持结论"><a-select v-model:value="draft.verdict" :options="supportOptions" placeholder="请选择，系统不预判"/></a-form-item>
        <a-form-item label="该模型事实的原证据"><a-select v-model:value="draft.evidenceIds" mode="multiple" :options="draft.claim.evidence.map(e=>({value:e.id,label:`${e.type} · ${e.reference}`}))"/></a-form-item>
        <a-form-item label="冻结会话来源"><a-select v-model:value="draft.messageIds" mode="multiple" option-filter-prop="label" :options="context.messages.map(m=>({value:m.id,label:`#${m.sequenceNo} ${m.speakerRole} ${m.content.slice(0,80)}`}))"/></a-form-item>
        <a-form-item label="来源标注原因"><a-textarea v-model:value="draft.reason" :maxlength="1000" :rows="2"/></a-form-item>
       </template>
      </a-collapse-panel>
     </a-collapse>
    </template>
    <a-form-item label="本次复核原因"><a-textarea v-model:value="reason" :maxlength="1000" :rows="2"/></a-form-item>
    <a-button type="primary" :disabled="disabled||loading||!reason.trim()" @click="save">保存Finding修正并重算</a-button>
   </template>
  </a-form>
 </a-card>
</template>
