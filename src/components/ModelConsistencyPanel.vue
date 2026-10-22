<script setup lang="ts">
import {onBeforeUnmount,ref,shallowRef,watch} from 'vue';
import {getModelConsistency,type ModelConsistencyReport} from '@/api/evaluation';
const props=defineProps<{taskId:string;executionId:string;allowed:boolean}>();
const referenceTaskId=ref(''),referenceExecutionId=ref(''),report=shallowRef<ModelConsistencyReport>(),busy=ref(false),error=ref('');
let generation=0,disposed=false;
function clear(){generation++;report.value=undefined;error.value='';busy.value=false;}
watch(()=>[props.taskId,props.executionId,props.allowed,referenceTaskId.value,referenceExecutionId.value],clear);
onBeforeUnmount(()=>{disposed=true;clear();});
const percent=(n:number|null)=>n==null?'未测量':`${(n*100).toFixed(2)}%`;
const reasonNames:Record<string,string>={MISSING_ARTIFACT:'缺少样本产物',SAME_ARTIFACT:'重复引用同一产物',MISSING_NODE:'缺少节点产物',UNSUCCESSFUL_NODE:'节点未成功',UNRESOLVED_OUTPUT:'事实值未确认',UNMEASURED_INVOCATION:'调用指纹缺测',DIFFERENT_MODEL_OR_INPUT:'模型或输入不同'};
async function compare(){
 if(disposed||busy.value||!props.allowed||!referenceTaskId.value.trim()||!referenceExecutionId.value.trim())return;
 const ticket=++generation;busy.value=true;report.value=undefined;error.value='';
 try{const value=await getModelConsistency(props.taskId,props.executionId,referenceTaskId.value.trim(),referenceExecutionId.value.trim());
  if(disposed||ticket!==generation)return;
  if(value.schemaVersion!=='iqc-model-consistency-v1')throw Error();report.value=value;
 }catch{if(!disposed&&ticket===generation)error.value='一致性比较失败，请核对双方权限、执行轮次及相同冻结数据集和流水线版本。';}
 finally{if(!disposed&&ticket===generation)busy.value=false;}
}
</script>
<template>
 <a-card title="模型重复运行一致性" size="small" style="margin-top:16px">
  <a-alert type="info" message="比较两次独立执行中同模型、同输入的节点事实值、状态与严重度；不比较解释或证据措辞，不代表准确率。缺测与不同输入单独列出，不填成一致。"/>
  <a-form layout="inline" style="margin-top:12px">
   <a-form-item label="参考任务 ID"><a-input v-model:value="referenceTaskId" :disabled="busy||!allowed" :maxlength="64"/></a-form-item>
   <a-form-item label="参考执行轮次 ID"><a-input v-model:value="referenceExecutionId" :disabled="busy||!allowed" :maxlength="64"/></a-form-item>
   <a-button :loading="busy" :disabled="busy||!allowed||!referenceTaskId.trim()||!referenceExecutionId.trim()" @click="compare">比较一致性</a-button>
  </a-form>
  <a-alert v-if="error" type="error" :message="error"/>
  <a-descriptions v-if="report" style="margin-top:12px">
   <a-descriptions-item label="可比较覆盖率">{{percent(report.comparisonCoverage)}} · {{report.comparablePairs}} / {{report.expectedPairs}}</a-descriptions-item>
   <a-descriptions-item label="语义一致率">{{percent(report.agreementRate)}} · {{report.agreeingPairs}} / {{report.comparablePairs}}</a-descriptions-item>
   <a-descriptions-item v-for="(count,reason) in report.excludedReasons" :key="reason" :label="reasonNames[reason]||reason">{{count}}</a-descriptions-item>
  </a-descriptions>
 </a-card>
</template>
