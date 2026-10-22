<script setup lang="ts">
import {onBeforeUnmount,ref,watch} from 'vue';
import {getScoreReviewContext,type ScoreAdjustment,type ScoreReviewContext} from '@/api/quality';
const props=defineProps<{resultId:string;disabled:boolean;refreshToken?:number}>();
const emit=defineEmits<{save:[adjustment:ScoreAdjustment]}>();
const context=ref<ScoreReviewContext>(),loading=ref(false),error=ref(''),score=ref(''),reason=ref('');let generation=0,disposed=false;
async function load(){if(disposed)return;const ticket=++generation,id=props.resultId;loading.value=true;context.value=undefined;error.value='';score.value='';reason.value='';
 try{const result=await getScoreReviewContext(id);if(disposed||ticket!==generation||id!==props.resultId)return;
  if(result.sourceResultId!==id||!/^[a-f0-9]{64}$/.test(result.computedScoringHash))throw Error();
  const p=result.privacy;
  context.value=p&&result.manualScore&&(p.policyVersion!=='iqc-score-review-context-read-v1'||!p.canonicalPayloadVisible||!p.canReadFull||!p.canReadPii)
   ?{...result,manualScore:{...result.manualScore,adjustment:{...result.manualScore.adjustment,reason:null}}}:result;
  score.value=result.manualScore?.status==='APPLIED'?result.manualScore.adjustment.finalScore:result.computedScore??'';
 }catch{if(ticket===generation)error.value='评分基准加载失败，请刷新后重试。';}
 finally{if(ticket===generation)loading.value=false;}}
onBeforeUnmount(()=>{disposed=true;generation++;context.value=undefined;score.value="";reason.value="";});
watch(()=>[props.resultId,props.refreshToken],()=>{void load();},{immediate:true});
function save(){if(disposed||props.disabled||loading.value||!context.value||!reason.value.trim())return;
 if(!/^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/.test(score.value)||Number(score.value)>100){error.value='分数须在0到100之间，最多两位小数';return;}
 error.value='';emit('save',{sourceResultId:props.resultId,expectedScoringHash:context.value.computedScoringHash,finalScore:score.value,reason:reason.value.trim()});}
</script>
<template>
 <a-card title="人工改分" size="small">
  <a-alert v-if="error" type="error" :message="error"/>
  <a-button :disabled="disabled||loading" :loading="loading" @click="load">刷新评分基准</a-button>
  <template v-if="context">
   <a-alert v-if="context.manualScore && context.privacy && (context.privacy.policyVersion!=='iqc-score-review-context-read-v1' || !context.privacy.canonicalPayloadVisible || !context.privacy.canReadFull || !context.privacy.canReadPii)" type="info" message="前轮改分原因未展示；评分基准仍可用，新一轮改分需填写新的原因。" />
   <p>复核计算分数：{{context.computedScore??'待定 / 不适用'}} · {{context.computedScoreStatus}}</p>
   <a-alert v-if="context.manualScore?.status==='STALE'" type="warning" message="前轮改分的计算基准已变化，当前不生效，请重新确认。"/>
   <p>人工数字单独保存，原计算明细、否决与未确认事实保留；不重新执行外部动作。</p>
   <a-form layout="vertical" :disabled="disabled||loading">
    <a-form-item label="人工覆盖分数（0–100，最多两位小数）"><a-input v-model:value="score" :maxlength="6" inputmode="decimal"/></a-form-item>
    <a-form-item label="改分原因（必填）"><a-textarea v-model:value="reason" :maxlength="1000" :rows="2"/></a-form-item>
    <a-button type="primary" :disabled="disabled||loading||!score||!reason.trim()" @click="save">保存人工改分</a-button>
   </a-form>
  </template>
 </a-card>
</template>
