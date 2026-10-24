<script setup lang="ts">
import { computed } from 'vue';
import type { FindingConfidenceDiagnostics,ConfidenceCalibrationCandidate } from '@/api/evaluation';
const props=withDefaults(defineProps<{metrics?:FindingConfidenceDiagnostics|null;title?:string;description?:string;calibrationCandidate?:ConfidenceCalibrationCandidate|null}>(),{
 title:'置信度误差诊断',
 description:'衡量带最终置信度的已知事实是否与冻结金标完整值匹配；不是正类概率，也不证明校准工件有效。缺少置信度、未知、错误及类型不符不填零，计入未测量。'
});
const candidate=computed(()=>props.calibrationCandidate?.schemaVersion==='iqc-confidence-calibration-candidate-v1'?props.calibrationCandidate:null);
const referenceJson=computed(()=>candidate.value?JSON.stringify([{taskId:candidate.value.source.taskId,executionId:candidate.value.source.executionId,nodeId:candidate.value.source.nodeId,contentHash:candidate.value.contentHash}]):'');
const percent=(value:number|null|undefined)=>value==null?'无分母':`${(value*100).toFixed(2)}%`;
</script>
<template>
<a-card v-if="metrics?.schemaVersion==='iqc-finding-confidence-diagnostics-v1'" :title="title" size="small" style="margin-top:16px">
 <a-alert type="info" show-icon :message="description" />
 <a-descriptions :column="3" style="margin-top:12px">
  <a-descriptions-item label="测量覆盖">{{metrics.scored}} / {{metrics.eligibleKnownGold}} · {{percent(metrics.coverage)}}</a-descriptions-item>
  <a-descriptions-item label="未测量">{{metrics.unscored}}</a-descriptions-item>
  <a-descriptions-item label="Brier（越低越好）">{{metrics.brierScore??'无可测量样本'}}</a-descriptions-item>
  <a-descriptions-item label="ECE（越低越好）">{{percent(metrics.expectedCalibrationError)}}</a-descriptions-item>
 </a-descriptions>
 <template v-if="candidate">
  <a-alert type="warning" show-icon message="经验校准候选尚未发布，也未用于融合。每箱样本不足时不输出候选值；仍需独立验证质量并绑定发布。" />
  <a-typography-paragraph :copyable="{text:referenceJson}">精确引用：{{referenceJson}}</a-typography-paragraph>
  <a-descriptions :column="2" style="margin-top:12px">
   <a-descriptions-item label="每箱最少样本">{{candidate.minimumBinSamples}}</a-descriptions-item>
   <a-descriptions-item label="已测量 / 已知金标">{{candidate.scored}} / {{candidate.eligibleKnownGold}}</a-descriptions-item>
   <a-descriptions-item label="来源执行">{{candidate.source.executionId}}</a-descriptions-item>
   <a-descriptions-item label="产物摘要">{{candidate.contentHash}}</a-descriptions-item>
  </a-descriptions>
 </template>
 <a-table :data-source="metrics.bins" row-key="index" :pagination="false" size="small">
  <a-table-column title="置信度区间"><template #default="{record}">[{{percent(record.lowerInclusive)}}, {{percent(record.upperBound)}}{{record.upperInclusive?']':')'}}</template></a-table-column>
  <a-table-column title="事实数" data-index="count" />
  <a-table-column title="平均置信度"><template #default="{record}">{{percent(record.meanConfidence)}}</template></a-table-column>
  <a-table-column title="实际完整值准确率"><template #default="{record}">{{percent(record.observedAccuracy)}}</template></a-table-column>
  <a-table-column v-if="candidate" title="校准样本 / 正确数"><template #default="{record}">{{candidate.bins[record.index]?.samples??0}} / {{candidate.bins[record.index]?.correct??0}}</template></a-table-column>
  <a-table-column v-if="candidate" title="候选经验率（未发布）"><template #default="{record}">{{candidate.bins[record.index]?.calibratedProbability==null?'样本不足':percent(candidate.bins[record.index]?.calibratedProbability)}}</template></a-table-column>
 </a-table>
</a-card>
</template>
