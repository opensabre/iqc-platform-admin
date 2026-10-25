<script setup lang="ts">
import { computed } from 'vue';
import type { FindingConfidenceDiagnostics,ConfidenceCalibrationCandidate,CalibrationComparison } from '@/api/evaluation';
const props=withDefaults(defineProps<{metrics?:FindingConfidenceDiagnostics|null;title?:string;description?:string;calibrationCandidate?:ConfidenceCalibrationCandidate|null;calibrationComparison?:CalibrationComparison|null}>(),{
 title:'置信度误差诊断',
 description:'衡量带最终置信度的已知事实是否与冻结金标完整值匹配；不是正类概率，也不证明校准工件有效。缺少置信度、未知、错误及类型不符不填零，计入未测量。'
});
const candidate=computed(()=>props.calibrationCandidate?.schemaVersion==='iqc-confidence-calibration-candidate-v1'?props.calibrationCandidate:null);
const candidateBound=computed(()=>!!candidate.value&&typeof candidate.value.source.modelKey==='string'&&/^[a-f0-9]{64}$/.test(candidate.value.source.modelKey)&&typeof candidate.value.source.deploymentRef==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,127}$/.test(candidate.value.source.deploymentRef));
const referenceJson=computed(()=>candidateBound.value&&candidate.value?JSON.stringify([{taskId:candidate.value.source.taskId,executionId:candidate.value.source.executionId,nodeId:candidate.value.source.nodeId,contentHash:candidate.value.contentHash}]):'');
const comparison=computed(()=>props.calibrationComparison?.schemaVersion==='iqc-calibration-paired-diagnostics-v1'?props.calibrationComparison:null);
const comparisonRows=computed(()=>comparison.value?[
 {metric:'Brier',before:comparison.value.pairedRaw.brierScore,after:comparison.value.pairedCalibrated.brierScore,delta:comparison.value.brierDelta},
 {metric:'ECE',before:comparison.value.pairedRaw.expectedCalibrationError,after:comparison.value.pairedCalibrated.expectedCalibrationError,delta:comparison.value.expectedCalibrationErrorDelta}
]:[]);
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
  <a-alert type="warning" show-icon message="拟合候选不代表经过独立验证或发布。是否用于融合取决于流水线和任务的精确引用；每箱样本不足时不输出候选值。" />
  <a-alert v-if="!candidateBound" type="warning" show-icon message="该候选未绑定唯一的模型与部署调用身份，仅供诊断，不能用于执行。请使用具备部署证据且来源一致的评测重新拟合。" />
  <a-typography-paragraph v-if="candidateBound" :copyable="{text:referenceJson}">精确引用：{{referenceJson}}</a-typography-paragraph>
  <a-descriptions :column="2" style="margin-top:12px">
   <a-descriptions-item label="每箱最少样本">{{candidate.minimumBinSamples}}</a-descriptions-item>
   <a-descriptions-item label="已测量 / 已知金标">{{candidate.scored}} / {{candidate.eligibleKnownGold}}</a-descriptions-item>
   <a-descriptions-item label="来源执行">{{candidate.source.executionId}}</a-descriptions-item>
   <a-descriptions-item label="新拟合候选摘要">{{candidate.contentHash}}</a-descriptions-item>
   <a-descriptions-item v-if="candidateBound" label="模型身份摘要">{{candidate.source.modelKey}}</a-descriptions-item>
   <a-descriptions-item v-if="candidateBound" label="部署引用">{{candidate.source.deploymentRef}}</a-descriptions-item>
  </a-descriptions>
 </template>
 <template v-if="comparison">
  <h4>同一批样本的校准前后误差</h4>
  <a-alert type="info" show-icon message="仅对原始与校准值同时可测的相同样本比较；差值为校准后减原始，负值表示该误差下降。缺失或未支持仍保留在覆盖分母，不表示拟合与验证数据独立，也不代表发布通过。" />
  <a-descriptions :column="2" style="margin-top:12px">
   <a-descriptions-item label="配对 / 已知金标">{{comparison.pairedRaw.scored}} / {{comparison.pairedRaw.eligibleKnownGold}} · {{percent(comparison.pairedRaw.coverage)}}</a-descriptions-item>
   <a-descriptions-item label="可转换 / 原始已测">{{comparison.pairedRaw.scored}} / {{comparison.originalMeasured}} · {{percent(comparison.mappedCoverage)}}</a-descriptions-item>
   <a-descriptions-item label="本次使用产物摘要" :span="2">{{comparison.artifactHash}}</a-descriptions-item>
  </a-descriptions>
  <a-table :data-source="comparisonRows" row-key="metric" :pagination="false" size="small">
   <a-table-column title="误差（0–1）" data-index="metric" />
   <a-table-column title="配对原始值"><template #default="{record}">{{record.before??'无可比较样本'}}</template></a-table-column>
   <a-table-column title="配对校准值"><template #default="{record}">{{record.after??'无可比较样本'}}</template></a-table-column>
   <a-table-column title="差值"><template #default="{record}">{{record.delta??'无可比较样本'}}</template></a-table-column>
  </a-table>
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
