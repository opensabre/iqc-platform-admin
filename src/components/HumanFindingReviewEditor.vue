<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {getHumanFindingContext,type HumanFindingContext,type HumanFindingDecision} from '@/api/quality';
const props=defineProps<{resultId:string;disabled:boolean;refreshToken?:number}>();
const emit=defineEmits<{save:[decision:HumanFindingDecision]}>();
const context=ref<HumanFindingContext>(),loading=ref(false),error=ref(''),code=ref<string>();
const state=ref<'KNOWN'|'UNKNOWN'>('KNOWN'),valueJson=ref('null'),severity=ref<HumanFindingDecision['severity']>('NONE');
const reason=ref(''),retained=ref<string[]>([]),added=ref<string[]>([]);let generation=0;
const selected=computed(()=>context.value?.findings.find(finding=>finding.code===code.value));
function reset(){code.value=undefined;state.value='KNOWN';valueJson.value='null';severity.value='NONE';reason.value='';retained.value=[];added.value=[];}
async function load(){const ticket=++generation,id=props.resultId;loading.value=true;error.value='';context.value=undefined;reset();
 try{const result=await getHumanFindingContext(id);if(ticket===generation&&id===props.resultId){if(result.sourceResultId!==id)throw Error();context.value=result;}}
 catch{if(ticket===generation)error.value='人工Finding上下文加载失败，请刷新后重试。';}
 finally{if(ticket===generation)loading.value=false;}}
watch(()=>[props.resultId,props.refreshToken],()=>{void load();},{immediate:true});
watch(selected,finding=>{reason.value='';if(!finding)return;state.value=finding.state==='KNOWN'?'KNOWN':'UNKNOWN';valueJson.value=finding.valueJson;severity.value=finding.severity;retained.value=[...finding.retainedEvidenceIds];added.value=[...finding.addedMessageIds];});
function save(){if(props.disabled||loading.value||!selected.value||!context.value?.available||!reason.value.trim())return;
 // Keep the original JSON text: parsing and reserializing here would round high precision decimals.
 try{JSON.parse(state.value==='UNKNOWN'?'null':valueJson.value);}catch{error.value='值必须是合法JSON；字符串须带双引号。';return;}
 error.value='';emit('save',{sourceResultId:props.resultId,findingCode:selected.value.code,expectedFindingHash:selected.value.expectedFindingHash,
 state:state.value,valueJson:state.value==='UNKNOWN'?'null':valueJson.value,severity:severity.value,reason:reason.value.trim(),retainedEvidenceIds:[...retained.value],addedMessageIds:[...added.value]});}
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
    <a-form-item label="修正原因"><a-textarea v-model:value="reason" :maxlength="1000" :rows="2"/></a-form-item>
    <a-button type="primary" :disabled="disabled||loading||!reason.trim()" @click="save">保存Finding修正并重算</a-button>
   </template>
  </a-form>
 </a-card>
</template>
