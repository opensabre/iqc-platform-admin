<script setup lang="ts">
import {onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {getPipelineRollout,listPipelineRolloutRevisions,savePipelineRollout,type PipelineRolloutCurrent,type PipelineRolloutPolicy,type PipelineRolloutRevision} from '@/api/pipelines';
const props=defineProps<{pipelineId:string;policy?:PipelineRolloutPolicy;disabled?:boolean}>();
const emit=defineEmits<{usePolicy:[PipelineRolloutPolicy]}>();
const {can}=usePermission();
const current=ref<PipelineRolloutCurrent>(),history=ref<PipelineRolloutRevision[]>([]),busy=ref(false),error=ref(''),notice=ref(''),more=ref(false);
let generation=0;
function clear(){++generation;current.value=undefined;history.value=[];busy.value=false;error.value='';notice.value='';more.value=false;}
watch(()=>props.pipelineId,clear);onBeforeUnmount(clear);
const hash=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function valid(row:PipelineRolloutRevision){return row&&Number.isInteger(row.revisionNo)&&row.revisionNo>0&&hash(row.contentHash)
 &&row.snapshot?.schemaVersion==='iqc-pipeline-rollout-revision-v1'&&row.snapshot.pipelineId===props.pipelineId&&row.snapshot.revisionNo===row.revisionNo
 &&row.snapshot.policy?.schemaVersion==='iqc-pipeline-rollout-v1'&&row.snapshot.policy.pipelineId===props.pipelineId
 &&hash(row.snapshot.policyHash)&&hash(row.snapshot.baselineReleaseHash)&&hash(row.snapshot.candidateReleaseHash)
 &&(row.revisionNo===1?row.snapshot.previousContentHash===null:hash(row.snapshot.previousContentHash));}
function samePolicy(a:PipelineRolloutPolicy,b:PipelineRolloutPolicy){
 const fields=(p:PipelineRolloutPolicy)=>[p.schemaVersion,p.pipelineId,p.baselineVersionNo,p.candidateVersionNo,p.candidateBasisPoints,p.cohortSalt,p.state,
  p.variable.dimension,p.variable.nodeId??null,p.variable.slot??null];
 return JSON.stringify(fields(a))===JSON.stringify(fields(b));
}
async function readCurrent(){
 if(busy.value||props.disabled||!can('iqc:pipeline:rollout:view'))return;
 const ticket=++generation;busy.value=true;current.value=undefined;error.value='';notice.value='';
 try{const data=await getPipelineRollout(props.pipelineId);if(ticket!==generation)return;
  if(!Number.isInteger(data.revisionNo)||data.revisionNo<0||(data.revisionNo===0?data.revision!==null:!data.revision||!valid(data.revision)||data.revisionNo!==data.revision.revisionNo))throw Error();
  current.value=data;
 }catch{if(ticket===generation)error.value='当前策略读取失败，请重新读取。';}finally{if(ticket===generation)busy.value=false;}
}
async function readHistory(older=false){
 if(busy.value||props.disabled||!can('iqc:pipeline:rollout:history:view'))return;
 const before=older?history.value.at(-1)?.revisionNo:undefined;
 if(older&&!before)return;
 const ticket=++generation;busy.value=true;error.value='';
 if(!older)history.value=[];
 try{const rows=await listPipelineRolloutRevisions(props.pipelineId,before);if(ticket!==generation)return;
  if(!Array.isArray(rows)||rows.some((r,i)=>!valid(r)||before!==undefined&&r.revisionNo>=before||i>0&&rows[i-1]!.revisionNo<=r.revisionNo))throw Error();
  history.value=older?[...history.value,...rows]:rows;more.value=rows.length===20;
 }catch{if(ticket===generation){error.value='修订历史读取失败。';more.value=false;}}finally{if(ticket===generation)busy.value=false;}
}
async function save(){
 if(busy.value||props.disabled||!current.value||!props.policy||props.policy.pipelineId!==props.pipelineId||!can('iqc:pipeline:rollout:manage'))return;
 const id=props.pipelineId,policy=props.policy,expected=current.value.revisionNo,ticket=++generation;
 busy.value=true;error.value='';notice.value='';current.value=undefined;history.value=[];more.value=false;
 let saved=false;
 try{const row=await savePipelineRollout(id,expected,policy);if(ticket!==generation)return;
  if(!valid(row)||row.revisionNo!==expected+1||!samePolicy(row.snapshot.policy,policy))throw Error();
  saved=true;notice.value=`配置修订 r${row.revisionNo} 已保存；尚未接入任务路由。`;
  if(can('iqc:pipeline:rollout:view')){const data=await getPipelineRollout(id);if(ticket!==generation)return;
   if(!data.revision||!valid(data.revision)||data.revisionNo!==data.revision.revisionNo||data.revisionNo<row.revisionNo)throw Error();current.value=data;}
 }catch{if(ticket===generation)error.value=saved?'保存已成功，当前策略重读失败，请重新读取；不要重复保存。':'未确认保存结果或修订已变化，请重新读取当前策略后核对。';}
 finally{if(ticket===generation)busy.value=false;}
}
</script>
<template>
<a-divider>灰度策略配置与修订历史</a-divider>
<a-alert type="info" message="当前只持久化策略配置与修订历史，尚未接入实际任务路由。保存需要已通过服务端预览的当前表单。"/>
<a-space wrap>
<a-button v-if="can('iqc:pipeline:rollout:view')" :disabled="busy||disabled" @click="readCurrent">读取当前策略</a-button>
<a-button v-if="can('iqc:pipeline:rollout:history:view')" :disabled="busy||disabled" @click="readHistory(false)">读取修订历史</a-button>
<a-button v-if="can('iqc:pipeline:rollout:manage')" :disabled="busy||disabled||!current||!policy" :loading="busy" @click="save">保存配置修订</a-button>
</a-space>
<p v-if="current">当前配置修订 r{{current.revisionNo}} {{current.revision?'':'（尚未配置）'}}</p>
<a-button v-if="current?.revision" :disabled="busy||disabled" @click="emit('usePolicy',current.revision.snapshot.policy)">将当前策略填入预览表单</a-button>
<a-alert v-if="notice" type="success" :message="notice"/><a-alert v-if="error" type="warning" :message="error"/>
<details v-for="row in history" :key="row.id"><summary>r{{row.revisionNo}} · {{row.snapshot.change}} · {{row.createdTime}} · {{row.contentHash.slice(0,12)}}</summary><pre>{{JSON.stringify(row,null,2)}}</pre></details>
<a-button v-if="more" :disabled="busy||disabled" @click="readHistory(true)">更早修订</a-button>
</template>
