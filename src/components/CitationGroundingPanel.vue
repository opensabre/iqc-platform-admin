<script setup lang="ts">
import type {CitationGroundingSummary} from '@/api/evaluation';
defineProps<{metrics?:CitationGroundingSummary|null}>();
const percent=(value:number|null)=>value==null?'未测量':`${(value*100).toFixed(2)}%`;
</script>
<template>
 <a-card v-if="metrics?.schemaVersion==='iqc-citation-grounding-report-v1'" title="会话引用来源校验" size="small" style="margin-top:16px">
  <a-alert type="info" show-icon message="检查模型明确引用的消息、逐字内容及声明的会话和角色是否匹配冻结输入。引用匹配不证明事实判断正确；错误率仅覆盖已观测引用。" />
  <a-descriptions :column="3" style="margin-top:12px">
   <a-descriptions-item label="完整测量覆盖">{{percent(metrics.measurementCoverage)}} · {{metrics.measuredNodeSamples}} / {{metrics.expectedNodeSamples}} 样本节点</a-descriptions-item>
   <a-descriptions-item label="部分测量">{{metrics.partialNodeSamples}} 样本节点</a-descriptions-item>
   <a-descriptions-item label="未测量">{{metrics.unmeasuredNodeSamples}} 样本节点</a-descriptions-item>
   <a-descriptions-item label="已观测引用错误率">{{percent(metrics.observedQuoteErrorRate)}} · {{metrics.invalidQuotes}} / {{metrics.claimedQuotes}} 条引用</a-descriptions-item>
   <a-descriptions-item label="引用容器格式异常">{{metrics.malformedContainers}}</a-descriptions-item>
   <a-descriptions-item label="无法识别的输出">{{metrics.unmeasuredOutputs}} / {{metrics.outputs}}</a-descriptions-item>
   <a-descriptions-item label="已执行样本节点">{{metrics.observedNodeSamples}}</a-descriptions-item>
   <a-descriptions-item label="无效诊断记录">{{metrics.invalidDiagnosticNodeSamples}}</a-descriptions-item>
  </a-descriptions>
  <p v-if="metrics.expectedNodeSamples===0">当前报告不适用引用测量：冻结流水线没有 LLM 节点或数据集没有样本。</p>
  <p v-else>每个样本的每个 LLM 节点取最后轨迹。缺失样本、跳过节点及旧产物缺少诊断均保留为未测量；零条引用时错误率未测量。容器格式异常无法推算引用数。</p>
 </a-card>
</template>
