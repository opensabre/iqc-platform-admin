<script setup lang="ts">
import {computed} from 'vue';
import PipelineExecutionTrace from './PipelineExecutionTrace.vue';
import {parsePipelineExecutionTrace} from './pipeline-execution-trace';
import {parseRouteExecutionTrace,traceJson,traceStateLabel} from './route-execution-trace';
const props=defineProps<{traceJson?:string|null}>();
const pipeline=computed(()=>parsePipelineExecutionTrace(props.traceJson));
const parsed=computed(()=>parseRouteExecutionTrace(props.traceJson));
const color=(s:string)=>['ERROR','CONFLICT','FAILED'].includes(s)?'error':['UNKNOWN','NOT_EVALUATED','SKIPPED'].includes(s)?'warning':'default';
</script>
<template>
<PipelineExecutionTrace v-if="pipeline.status==='AVAILABLE'" :trace="pipeline.trace"/>
<a-alert v-else-if="pipeline.status==='INVALID'" type="warning" show-icon :message="pipeline.message"/>
<section v-else class="route-trace"><h3>原始节点执行轨迹</h3>
<a-alert v-if="parsed.status!=='AVAILABLE'" :type="parsed.status==='MISSING'?'info':'warning'" show-icon :message="parsed.message"/>
<template v-else><p>各轮原始检测输出；跳过、未知与错误均不代表检测通过。评分和人工复核结果见对应区域。</p>
<a-descriptions :column="1" size="small" bordered>
<a-descriptions-item label="执行实例">{{parsed.trace.executionId}}</a-descriptions-item>
<a-descriptions-item label="方案 / 事实协议">{{parsed.trace.planSchemaVersion}} / {{parsed.trace.findingSchemaVersion || '未记录统一事实协议'}}</a-descriptions-item>
<a-descriptions-item label="输入摘要">{{parsed.trace.inputHash}}</a-descriptions-item>
<a-descriptions-item label="规则 / Agent 快照摘要">{{parsed.trace.ruleSnapshotHash}} / {{parsed.trace.agentSnapshotHash || '未记录'}}</a-descriptions-item>
</a-descriptions>
<a-empty v-if="!parsed.rounds.length" description="轨迹没有记录节点"/>
<div v-for="round in parsed.rounds" :key="round.runIndex" class="round"><h4>第 {{round.runIndex}} 轮</h4><a-collapse>
<a-collapse-panel v-for="node in round.nodes" :key="node.nodeId" :header="`${node.engineType} · ${node.nodeId}`">
<template #extra><a-tag :color="color(node.executionStatus)">{{node.executed ? (node.executionStatus==='FAILED'?'已执行 · ERROR':'已执行'):'SKIPPED · 未执行'}}</a-tag><a-tag :color="color(node.factState)">{{traceStateLabel(node.factState)}}</a-tag></template>
<a-descriptions :column="1" size="small">
<a-descriptions-item label="规则 / 版本">{{node.ruleId}} / v{{node.ruleVersion}}</a-descriptions-item>
<a-descriptions-item label="阶段 / 输入范围">{{node.phase}} / {{node.inputScope}}</a-descriptions-item>
<a-descriptions-item label="上游节点">{{node.upstreamNodeId || '无'}}</a-descriptions-item>
<a-descriptions-item label="执行状态 / 检测结果">{{node.executionStatus}} / {{node.resultStatus}}</a-descriptions-item>
<a-descriptions-item label="开始时间 / 检测耗时">{{node.startedAt || '未记录'}} / {{node.executed ? `${(node.durationNanos/1_000_000).toFixed(3)} ms`:'未执行'}}</a-descriptions-item>
<a-descriptions-item label="输入摘要">{{node.inputHash || '未记录'}}</a-descriptions-item>
<a-descriptions-item label="判断原因">{{node.reason || '未记录'}}</a-descriptions-item>
</a-descriptions><h4>统一 Findings</h4>
<a-alert v-if="!node.findings?.length" type="info" message="此节点未记录统一 Finding，不能由旧输出补造事实"/>
<a-card v-for="fact in node.findings || []" :key="fact.id" size="small" class="finding"><template #title>{{fact.code}} · {{fact.valueType}}</template><template #extra><a-tag :color="color(fact.state)">{{traceStateLabel(fact.state)}}</a-tag></template>
<p>类别：{{fact.category}} · 严重度：{{fact.severity}} · 置信度：{{fact.confidence ?? '未记录'}}</p><p>来源：{{fact.source.engineType}} / {{fact.source.engineVersion}}</p><p>{{fact.reason || '未记录原因'}}</p>
<pre v-if="fact.state==='KNOWN'">{{traceJson(fact.value)}}</pre><p v-else>此状态没有确定事实值</p>
<details><summary>事实证据（{{fact.evidence.length}}）</summary><pre>{{traceJson(fact.evidence)}}</pre></details></a-card>
<details><summary>原始检测输出</summary><a-alert v-if="node.rawFindingParseError" type="warning" message="后端无法解析原始输出，已省略无效内容"/><pre>{{traceJson(node.rawFinding)}}</pre></details>
<details><summary>原始检测证据</summary><a-alert v-if="node.evidenceParseError" type="warning" message="后端无法解析证据，已省略无效内容"/><pre>{{traceJson(node.evidence)}}</pre></details>
</a-collapse-panel></a-collapse></div></template></section>
</template>
<style scoped>
.route-trace{margin-bottom:16px}.route-trace h3{margin-bottom:8px}.route-trace p{overflow-wrap:anywhere}.round{margin-top:16px}.finding{margin:8px 0}.route-trace pre{max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.route-trace :deep(.ant-descriptions-item-content){overflow-wrap:anywhere}
</style>
