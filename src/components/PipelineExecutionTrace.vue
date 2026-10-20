<script setup lang="ts">
import type {PipelineTrace,PipelineNodeTrace} from './pipeline-execution-trace';
import {traceJson,traceStateLabel} from './route-execution-trace';
const props=defineProps<{trace:PipelineTrace}>();
function plannedStop(node:PipelineNodeTrace){
 return props.trace.run.completionReason==='POLICY_SATISFIED' && ['CANCELLED','SKIPPED'].includes(node.result.status) && node.result.error==='Completion policy satisfied';
}
const color=(s:string)=>['ERROR','CONFLICT','FAILED','TIMEOUT','CANCELLED','FAIL','UNQUALIFIED'].includes(s)?'error':['UNKNOWN','NOT_EVALUATED','SKIPPED','REVIEW_REQUIRED','PENDING','PARTIAL_SUCCESS'].includes(s)?'warning':'default';
</script>
<template>
<section class="pipeline-trace"><h3>流水线执行轨迹</h3>
<a-descriptions :column="1" size="small" bordered>
<a-descriptions-item label="执行状态"><a-tag :color="color(trace.run.status)">{{trace.run.status}}</a-tag>{{trace.mode==='EVALUATION'?'评测执行':'生产执行'}} · {{trace.run.reviewRequired?'运行时标记需复核':'无运行时复核标记'}}</a-descriptions-item>
<a-descriptions-item v-if="trace.run.completionReason==='POLICY_SATISFIED'" label="停止策略">已满足提前融合策略；未完成节点保留取消或未执行状态，评分及复核状态仍以实际结果为准。</a-descriptions-item>
<a-descriptions-item label="输入摘要">{{trace.inputHash}}</a-descriptions-item>
<a-descriptions-item label="机器评分">{{trace.scoring.finalScore ?? '待定 / 不适用'}} · {{trace.scoring.scoreStatus}} · {{trace.scoring.conclusion}}</a-descriptions-item>
<a-descriptions-item v-if="trace.reviewDecision" label="复核政策决定">{{trace.reviewDecision.status==='REQUIRED'?'要求复核':trace.reviewDecision.status==='NOT_REQUIRED'?'本政策不要求复核':'需人工确认'}}</a-descriptions-item>
<a-descriptions-item label="风险投影">{{trace.riskLevel}}</a-descriptions-item>
<a-descriptions-item label="检测覆盖">已完成 {{trace.scoring.coverage.completed}} / {{trace.scoring.coverage.expected}}；不适用 {{trace.scoring.coverage.notApplicable}}；待定 {{trace.scoring.coverage.pending}}</a-descriptions-item>
</a-descriptions>
<p>跳过、错误和未知保留各自状态；机器评分与人工复核、政策重算分别展示。</p>
<h4>节点尝试</h4><a-empty v-if="!trace.run.trace.length" description="未记录节点尝试"/>
<a-collapse><a-collapse-panel v-for="(node,index) in trace.run.trace" :key="index" :header="`${node.nodeId} · ${node.attempt===0?'未调用':`尝试 ${node.attempt}`}`">
<template #extra><a-tag :color="plannedStop(node)?'warning':color(node.result.status)">{{plannedStop(node)?(node.result.status==='CANCELLED'?'策略满足后取消':'策略满足后未执行'):node.result.status}}</a-tag></template>
<p>{{node.startedAt}} · {{node.durationMs}} ms</p><p>{{node.result.error || '未记录错误'}}</p>
<a-card v-for="fact in node.result.findings" :key="fact.id" size="small" class="fact"><template #title>{{fact.code}}</template><a-tag :color="color(fact.state)">{{traceStateLabel(fact.state)}}</a-tag><p>来源：{{fact.source.nodeId}} / {{fact.source.engineType}} / {{fact.source.engineVersion}}</p><p>{{fact.reason || '未记录原因'}}</p><pre>{{traceJson(fact.value)}}</pre><details><summary>证据（{{fact.evidence.length}}）</summary><pre>{{traceJson(fact.evidence)}}</pre></details></a-card>
<details><summary>输出变量与指标</summary><pre>{{traceJson({variables:node.result.variables,metrics:node.result.metrics})}}</pre></details>
</a-collapse-panel></a-collapse>
<h4>融合事实</h4><a-empty v-if="!trace.fusion.length" description="未记录融合事实"/>
<a-card v-for="fact in trace.fusion" :key="fact.code" size="small" class="fact"><template #title>{{fact.code}} · {{fact.valueType}}</template><template #extra><a-tag :color="color(fact.state)">{{traceStateLabel(fact.state)}}</a-tag></template>
<p>政策：{{fact.policyId}} / v{{fact.policyVersion}} · 严重度：{{fact.severity}}</p><p>{{fact.explanation}}</p><pre v-if="fact.state==='KNOWN'">{{traceJson(fact.value)}}</pre><p v-else>没有确定的事实值</p>
<p>最终校准置信度：{{fact.finalConfidence == null ? '未提供' : fact.finalConfidence}}</p>
<p>选中：{{fact.selectedIds.join('、') || '无'}}；未选中：{{fact.rejectedIds.join('、') || '无'}}</p>
<details><summary>原始候选事实（{{fact.rawFindings.length}}）</summary><pre>{{traceJson(fact.rawFindings)}}</pre></details><details><summary>融合证据（{{fact.evidence.length}}）</summary><pre>{{traceJson(fact.evidence)}}</pre></details></a-card>
<h4>评分明细</h4><p>{{trace.scoring.policyVersion}} · {{trace.scoring.mode}} · {{trace.scoring.vetoTriggered?'触发一票否决':'未触发一票否决'}}</p>
<a-table v-if="!trace.scoring.advanced" :data-source="trace.scoring.lines" row-key="itemCode" size="small" :pagination="false" :scroll="{x:650}"><a-table-column title="质检项" data-index="itemCode"/><a-table-column title="结论" data-index="status"/><a-table-column title="配置分值" data-index="configuredPoints"/><a-table-column title="计分贡献"><template #default="{record}">{{record.contribution ?? '待定'}}</template></a-table-column><a-table-column title="否决"><template #default="{record}">{{record.vetoTriggered?'已触发':'未触发'}}</template></a-table-column></a-table>
<template v-if="trace.scoring.advanced"><p>等级：{{trace.scoring.advanced.grade ?? '待定 / 未配置'}} · {{trace.scoring.mode==='POINTS'?'原始分（近似显示）':'原始分'}}：{{trace.scoring.advanced.rawScore ?? '待定 / 不适用'}}</p><a-table :data-source="trace.scoring.advanced.lines" row-key="itemCode" :pagination="false" size="small" :scroll="{x:900}"><a-table-column title="项目" data-index="itemCode"/><a-table-column title="原项目结论" data-index="originalStatus"/><a-table-column title="评分状态" data-index="status"/><a-table-column title="适用匹配" data-index="applicability"/><a-table-column title="权重" data-index="weight"/><a-table-column title="加权基准贡献" data-index="baseContribution"/><a-table-column title="额外调整贡献" data-index="adjustment"/><a-table-column title="维度" data-index="dimensionCode"/></a-table><h4>维度分</h4><a-table :data-source="trace.scoring.advanced.dimensions" row-key="code" :pagination="false" size="small"><a-table-column title="维度" data-index="code"/><a-table-column title="状态" data-index="scoreStatus"/><a-table-column :title="trace.scoring.mode==='POINTS'?'原始分（近似）':'原始分'" data-index="rawScore"/><a-table-column title="最终分" data-index="finalScore"/><a-table-column title="结论" data-index="conclusion"/></a-table></template>
<template v-if="trace.reviewDecision"><h4>复核政策明细</h4><a-table :data-source="trace.reviewDecision.rules" row-key="ruleId" :pagination="false" size="small"><a-table-column title="规则" data-index="ruleId"/><a-table-column title="条件匹配" data-index="conditionMatch"/><a-table-column title="校准置信度"><template #default="{record}">{{record.calibratedConfidence ?? '不可确认 / 未引用'}}</template></a-table-column><a-table-column title="抽样选中"><template #default="{record}">{{record.selected==null?'身份未确认':record.selected?'是':'否'}}</template></a-table-column><a-table-column title="普通抽样已让位"><template #default="{record}">{{record.suppressed?'是':'否'}}</template></a-table-column><a-table-column title="有效命中" data-index="effectiveMatch"/></a-table><details><summary>复核决定与抽样核对数据</summary><pre>{{traceJson(trace.reviewDecision)}}</pre></details></template>
</section>
</template>
<style scoped>.pipeline-trace{margin-bottom:16px}.pipeline-trace p{overflow-wrap:anywhere}.fact{margin:8px 0}.pipeline-trace pre{max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.pipeline-trace :deep(.ant-descriptions-item-content){overflow-wrap:anywhere}</style>
