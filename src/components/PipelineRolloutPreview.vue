<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {usePermission} from '@/composables/permission';
import {listPipelineVersions,previewPipelineRollout,type PipelineRolloutPolicy,type PipelineRolloutDecision} from '@/api/pipelines';
import type {BenchmarkDimension} from '@/api/benchmarks';
const props=defineProps<{pipelineId:string;disabled?:boolean}>();
const {can}=usePermission();
const versions=ref<Array<{versionNo:number;contentHash:string}>>([]),loading=ref(false),busy=ref(false),error=ref('');
const baseline=ref<number>(),candidate=ref<number>(),basisPoints=ref(1000),salt=ref('iqc-rollout-v1'),requestKey=ref<string>(crypto.randomUUID());
const state=ref<PipelineRolloutPolicy['state']>('ACTIVE'),dimension=ref<BenchmarkDimension>('PROMPT'),nodeId=ref(''),slot=ref<number|null>(null),decision=ref<PipelineRolloutDecision>();
let generation=0,versionGeneration=0;
const dimensions=[{value:'PROMPT',label:'Prompt'},{value:'MODEL',label:'模型'},{value:'SKILL',label:'Skill'},{value:'FUSION',label:'融合策略'},{value:'PIPELINE',label:'流水线'}];
const needsNode=computed(()=>['PROMPT','MODEL','SKILL'].includes(dimension.value));
const allowsSlot=computed(()=>['MODEL','SKILL'].includes(dimension.value));
const blocked=computed(()=>!!props.disabled||busy.value||loading.value);
watch(()=>JSON.stringify([props.pipelineId,baseline.value,candidate.value,basisPoints.value,salt.value,requestKey.value,state.value,dimension.value,nodeId.value,slot.value]),()=>{++generation;decision.value=undefined;error.value='';});
watch(()=>props.pipelineId,()=>{++versionGeneration;loading.value=false;busy.value=false;versions.value=[];baseline.value=undefined;candidate.value=undefined;});
onBeforeUnmount(()=>{++generation;++versionGeneration;decision.value=undefined;});
async function loadVersions(){
 if(blocked.value||!can('iqc:pipeline:versions:view'))return;
 const ticket=++versionGeneration;loading.value=true;error.value='';
 try{const data=await listPipelineVersions(props.pipelineId);if(ticket===versionGeneration)versions.value=data.filter(v=>Number.isInteger(v.versionNo)&&v.versionNo>0&&typeof v.contentHash==='string'&&/^[a-f0-9]{64}$/.test(v.contentHash)).map(v=>({versionNo:v.versionNo,contentHash:v.contentHash}));}
 catch{if(ticket===versionGeneration)error.value='发布版本加载失败，请核对权限。';}finally{if(ticket===versionGeneration)loading.value=false;}
}
async function preview(){
 if(blocked.value||!can('iqc:pipeline:rollout:preview'))return;
 if(!baseline.value||!candidate.value||baseline.value===candidate.value||!Number.isInteger(basisPoints.value)||basisPoints.value<0||basisPoints.value>10000
  ||!versions.value.some(v=>v.versionNo===baseline.value)||!versions.value.some(v=>v.versionNo===candidate.value)
  ||!/^[-A-Za-z0-9_]{8,64}$/.test(salt.value)||!/^[-A-Za-z0-9:_]{1,128}$/.test(requestKey.value)||needsNode.value&&!nodeId.value.trim()){
  error.value='请选择两个不同发布版本，填写有效分桶盐、请求键、比例及实际节点。';return;
 }
 if(allowsSlot.value&&slot.value!=null&&(!Number.isInteger(slot.value)||slot.value<0||slot.value>255)){error.value='槽位须为0至255整数或留空。';return;}
 const id=props.pipelineId,ticket=++generation;busy.value=true;decision.value=undefined;error.value='';
 const policy:PipelineRolloutPolicy={schemaVersion:'iqc-pipeline-rollout-v1',pipelineId:id,baselineVersionNo:baseline.value,candidateVersionNo:candidate.value,
  candidateBasisPoints:basisPoints.value,cohortSalt:salt.value,state:state.value,variable:{dimension:dimension.value,...(needsNode.value?{nodeId:nodeId.value.trim()}:{}),...(allowsSlot.value&&slot.value!=null?{slot:slot.value}:{})}};
 try{const data=await previewPipelineRollout(id,policy,requestKey.value);
  if(ticket!==generation||id!==props.pipelineId)return;
  const expectedSide=policy.state==='ACTIVE'&&data.bucket<policy.candidateBasisPoints?'CANDIDATE':'BASELINE';
  const expectedVersion=expectedSide==='CANDIDATE'?policy.candidateVersionNo:policy.baselineVersionNo;
  if(data.schemaVersion!=='iqc-pipeline-rollout-v1'||data.pipelineId!==id||data.state!==policy.state||data.baselineVersionNo!==policy.baselineVersionNo
   ||data.candidateVersionNo!==policy.candidateVersionNo||data.candidateBasisPoints!==policy.candidateBasisPoints||!Number.isInteger(data.bucket)||data.bucket<0||data.bucket>=10000
   ||data.side!==expectedSide||data.selectedVersionNo!==expectedVersion||versions.value.find(v=>v.versionNo===expectedVersion)?.contentHash!==data.selectedReleaseHash
   ||!/^[a-f0-9]{64}$/.test(data.policyHash)||!/^[a-f0-9]{64}$/.test(data.cohortHash)){error.value='预览协议或来源不匹配，请重新读取。';return;}
  decision.value=data;
 }catch{if(ticket===generation)error.value='预览未通过，请核对版本可用性、当前权限和单变量声明；不会修改任务路由。';}
 finally{if(ticket===generation)busy.value=false;}
}
</script>
<template>
<a-collapse><a-collapse-panel key="rollout" header="灰度与回退分配预览">
<a-alert type="info" message="仅预览已发布版本的分配，不保存灰度策略、不创建任务、不改变实际路由。未保存草稿不参与。"/>
<p>按当前账号和请求键稳定分桶；扩量时保持盐不变。模型、Prompt、Skill、融合或流水线以外的变化会由服务端拒绝。</p>
<a-button :loading="loading" :disabled="blocked||!can('iqc:pipeline:versions:view')" @click="loadVersions">加载已发布版本</a-button>
<a-form layout="vertical"><a-form-item label="基线与候选版本"><a-space><a-select v-model:value="baseline" :disabled="blocked" placeholder="基线版本" :options="versions.map(v=>({value:v.versionNo,label:`v${v.versionNo} · ${v.contentHash.slice(0,12)}`}))" style="width:220px"/><a-select v-model:value="candidate" :disabled="blocked" placeholder="候选版本" :options="versions.map(v=>({value:v.versionNo,label:`v${v.versionNo} · ${v.contentHash.slice(0,12)}`}))" style="width:220px"/></a-space></a-form-item>
<a-form-item label="变化维度"><a-select v-model:value="dimension" :disabled="blocked" :options="dimensions"/></a-form-item>
<a-form-item v-if="needsNode" label="实际节点 ID 与可选槽位"><a-space><a-input v-model:value="nodeId" :disabled="blocked" :maxlength="64" placeholder="已发布版本中的节点 ID"/><a-input-number v-if="allowsSlot" v-model:value="slot" :disabled="blocked" :min="0" :max="255" :precision="0" placeholder="独立引擎可留空"/></a-space></a-form-item>
<a-form-item label="候选比例（万分比整数）"><a-input-number v-model:value="basisPoints" :disabled="blocked" :min="0" :max="10000" :precision="0"/> {{basisPoints/100}}%</a-form-item>
<a-form-item label="预览模式"><a-radio-group v-model:value="state" :disabled="blocked"><a-radio value="ACTIVE">按比例分配</a-radio><a-radio value="ROLLED_BACK">全部回到基线</a-radio></a-radio-group></a-form-item>
<a-form-item label="分桶盐（8至64位字母、数字、下划线或短横线）"><a-input v-model:value="salt" :disabled="blocked" :maxlength="64"/></a-form-item>
<a-form-item label="请求键"><a-input v-model:value="requestKey" :disabled="blocked" :maxlength="128"/></a-form-item></a-form>
<a-button :loading="busy" :disabled="blocked" @click="preview">计算预览</a-button><a-alert v-if="error" type="warning" :message="error"/>
<template v-if="decision"><p>桶 {{decision.bucket}} / 10000 · {{decision.side==='CANDIDATE'?'候选':'基线'}} · 精确版本 v{{decision.selectedVersionNo}}</p><p>发布摘要 {{decision.selectedReleaseHash}}</p><details><summary>策略、分桶及单变量比较摘要</summary><pre>{{JSON.stringify(decision,null,2)}}</pre></details></template>
</a-collapse-panel></a-collapse>
</template>
<style scoped>.ant-alert{margin:12px 0}pre{max-height:320px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}</style>
