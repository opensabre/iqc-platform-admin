<script setup lang="ts">
import type { FindingConfidenceDiagnostics } from '@/api/evaluation';
withDefaults(defineProps<{metrics?:FindingConfidenceDiagnostics|null;title?:string;description?:string}>(),{
 title:'置信度误差诊断',
 description:'衡量带最终置信度的已知事实是否与冻结金标完整值匹配；不是正类概率，也不证明校准工件有效。缺少置信度、未知、错误及类型不符不填零，计入未测量。'
});
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
 <a-table :data-source="metrics.bins" row-key="index" :pagination="false" size="small">
  <a-table-column title="置信度区间"><template #default="{record}">[{{percent(record.lowerInclusive)}}, {{percent(record.upperBound)}}{{record.upperInclusive?']':')'}}</template></a-table-column>
  <a-table-column title="事实数" data-index="count" />
  <a-table-column title="平均置信度"><template #default="{record}">{{percent(record.meanConfidence)}}</template></a-table-column>
  <a-table-column title="实际完整值准确率"><template #default="{record}">{{percent(record.observedAccuracy)}}</template></a-table-column>
 </a-table>
</a-card>
</template>
