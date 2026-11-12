<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { getResultHierarchy, type BatchResultSummary, type ResultHierarchy, type TaskProcessedItem } from "@/api/results";
import { listTaskExecutions, type InspectionTask, type TaskExecutionSummary } from "@/api/tasks";
const props = defineProps<{summary:BatchResultSummary;task:InspectionTask}>();
const conversationId = ref<string>(), executionId = ref<string>(), tab = ref("inspection");
const executions = ref<TaskExecutionSummary[]>([]), hierarchy = ref<ResultHierarchy>();
const loading = ref(false), error = ref(""), historyError = ref(false);
let generation = 0;
const raw = computed(() => hierarchy.value?.engineResultSet);
const output = computed(() => hierarchy.value?.processedResult?.output);
const inspectionEnabled = computed(() => {
  try { return JSON.parse(props.task.ruleSnapshotJson || "{}").enginePlan.engines.some((engine:{operation:string}) => engine.operation === "INSPECTION"); }
  catch { return false; }
});
const labelingEnabled = computed(() => {
  try { return JSON.parse(props.task.ruleSnapshotJson || "{}").enginePlan.engines.some((engine:{operation:string}) => engine.operation === "LABELING"); }
  catch { return false; }
});
const score = computed(() => output.value?.scoring);
const engines = computed(() => [...raw.value?.engines || []].sort((a,b) => a.operation.localeCompare(b.operation) || a.sequence-b.sequence));
function labelName(id:string) { return raw.value?.taskConfiguration.resultProcessing.labelSnapshot?.labels?.find(label => label.id === id)?.name || id; }
function display(value:unknown):string { return value === undefined || value === null ? "未知" : typeof value === "object" ? JSON.stringify(value) : String(value); }
function state(value:string) { return ({KNOWN:"已确定",CONFLICT:"冲突",UNKNOWN:"未知",ERROR:"错误",SUCCEEDED:"成功",FAILED:"失败",SKIPPED:"已跳过",MISSING:"无结果",DETERMINED:"已判断",INVALID:"无效"} as Record<string,string>)[value] || value; }
function judgment(item:TaskProcessedItem) { return item.status !== "KNOWN" ? state(item.status) : item.value === "PASS" ? "通过" : item.value === "FAIL" ? "不通过" : display(item.value); }
function contribution(id:string) { if (!score.value) return "待确认"; const line = score.value?.lines.find(line => line.itemCode === id); return !line ? "不计分" : line.contribution == null ? "待确认" : `${score.value?.mode === 'DEDUCTION' ? '扣' : '得'} ${line.contribution} 分${line.vetoTriggered ? '（一票否决）' : ''}`; }
function engineName(candidate:TaskProcessedItem["candidates"][number]) {
  return raw.value?.engines.find(engine => engine.engineResultId === candidate.sourceEngineResultId)?.configuration.engineName || candidate.engineInstanceId;
}
function evidence(candidate:TaskProcessedItem["candidates"][number]) {
  const engine = raw.value?.engines.find(engine => engine.engineResultId === candidate.sourceEngineResultId);
  return engine?.evidence.filter(item => candidate.evidenceIds?.includes(item.evidenceId)) || [];
}
async function load() {
  const request = ++generation;
  hierarchy.value = undefined; error.value = "";
  if (!conversationId.value) { loading.value = false; return; }
  loading.value = true;
  try {
    const result = await getResultHierarchy(props.task.id, conversationId.value, executionId.value);
    if (request === generation) hierarchy.value = result;
  } catch { if (request === generation) error.value = "结果加载失败，请重试"; }
  finally { if (request === generation) loading.value = false; }
}
watch(() => props.task.id, async id => {
  executions.value = []; historyError.value = false;
  try { const rows = await listTaskExecutions(id); if (props.task.id === id) executions.value = rows; }
  catch { if (props.task.id === id) historyError.value = true; }
}, {immediate:true});
watch(() => props.summary, summary => { conversationId.value = summary.conversations[0]?.conversationId; executionId.value = undefined; tab.value = inspectionEnabled.value ? "inspection" : labelingEnabled.value ? "labels" : "trace"; }, {immediate:true});
watch([conversationId, executionId], load, {immediate:true});
onBeforeUnmount(() => { generation++; });
</script>
<template>
  <section aria-label="任务执行结果">
    <a-row :gutter="16" class="result-controls">
      <a-col :xs="24" :md="14"><label for="result-conversation">会话</label><a-select id="result-conversation" v-model:value="conversationId" style="width:100%" placeholder="选择会话" :options="summary.conversations.map(row => ({value:row.conversationId,label:row.sourceFileName || row.conversationId}))" /></a-col>
      <a-col :xs="24" :md="10"><label for="result-execution">执行记录</label><a-select id="result-execution" v-model:value="executionId" allow-clear placeholder="最新可用结果" style="width:100%" :options="executions.map(run => ({value:run.id,label:`第 ${run.attemptNo} 次 · ${run.status}`}))" /></a-col>
    </a-row>
    <p v-if="historyError">执行历史加载失败，仍可查看最新可用结果。</p>
    <a-alert v-if="error" type="error" :message="error" show-icon><template #action><a-button size="small" @click="load">重试</a-button></template></a-alert>
    <a-spin :spinning="loading">
      <a-empty v-if="!summary.conversations.length" description="尚未确定执行数据，请运行任务后查看" />
      <template v-else-if="!loading && !error">
        <a-empty v-if="!raw" description="本次执行尚无该会话的引擎记录" />
        <template v-else>
          <p class="source">来源执行：{{ hierarchy?.executionId }} · 输入消息 {{ raw.input.messages.length }} 条</p>
          <a-alert v-if="!output" type="info" show-icon message="结果处理尚未完成，以下保留已保存的引擎记录。" />
          <a-alert v-if="engines.some(engine => engine.status === 'FAILED')" type="warning" show-icon message="存在引擎失败，原始记录已保留，请结合处理结果查看。" />
          <a-tabs v-model:activeKey="tab">
            <a-tab-pane v-if="inspectionEnabled" key="inspection" tab="质检评分">
              <a-statistic v-if="score?.scoreStatus === 'FINAL' && score.finalScore != null" title="最终评分" :value="score.finalScore" :precision="2" suffix="分" />
              <p v-else>最终评分：{{ score?.scoreStatus === 'NOT_APPLICABLE' ? '不计分' : '待确认' }}</p>
              <article v-for="item in output?.inspectionItems || []" :key="item.targetId" class="result-item">
                <h3>{{ item.targetId }} <a-tag>{{ judgment(item) }}</a-tag></h3><p>{{ contribution(item.targetId) }}</p>
                <details><summary>查看各引擎判断和证据</summary><div v-for="candidate in item.candidates" :key="candidate.engineInstanceId" class="candidate">
                  <strong>{{ engineName(candidate) }} · {{ state(candidate.status) }}</strong><p>映射判断：{{ candidate.mappedValue === 'PASS' ? '通过' : candidate.mappedValue === 'FAIL' ? '不通过' : display(candidate.mappedValue) }}</p>
                  <p v-if="candidate.reason || candidate.failure">{{ candidate.reason || candidate.failure?.message }}</p>
                  <blockquote v-for="quote in evidence(candidate)" :key="quote.evidenceId">{{ quote.messageId }}：“{{ quote.quote }}”</blockquote>
                </div></details>
              </article>
            </a-tab-pane>
            <a-tab-pane v-if="labelingEnabled" key="labels" tab="打标标签">
              <a-empty v-if="!output?.labels.length" description="尚无打标处理结果" />
              <article v-for="item in output?.labels || []" :key="`${item.targetId}:${item.valueCode}`" class="result-item">
                <h3>{{ labelName(item.targetId) }} <a-tag>{{ state(item.status) }}</a-tag></h3>
                <p>{{ item.valueCode }}：{{ item.status === 'KNOWN' ? display(item.value) : state(item.status) }}</p>
                <details><summary>查看各引擎候选和证据</summary><div v-for="candidate in item.candidates" :key="candidate.engineInstanceId" class="candidate">
                  <strong>{{ engineName(candidate) }} · {{ state(candidate.status) }}</strong><p>候选值：{{ display(candidate.mappedValue) }}</p>
                  <p v-if="candidate.reason || candidate.failure">{{ candidate.reason || candidate.failure?.message }}</p>
                  <blockquote v-for="quote in evidence(candidate)" :key="quote.evidenceId">{{ quote.messageId }}：“{{ quote.quote }}”</blockquote>
                </div></details>
              </article>
            </a-tab-pane>
            <a-tab-pane key="trace" tab="引擎记录">
              <a-empty v-if="!engines.length" description="已固定输入，等待引擎执行" />
              <article v-for="engine in engines" :key="engine.engineResultId" class="result-item">
                <h3>{{ engine.operation === 'INSPECTION' ? '质检' : '打标' }} · {{ engine.sequence }}. {{ engine.configuration.engineName || engine.engineInstanceId }} · {{ engine.engineType }} <a-tag :color="engine.status === 'FAILED' ? 'error' : engine.status === 'SUCCEEDED' ? 'success' : 'default'">{{ state(engine.status) }}</a-tag></h3>
                <small>{{ engine.engineInstanceId }}</small><p v-if="engine.failure">{{ engine.failure.code }}：{{ engine.failure.message }}</p>
                <p v-for="(observation,index) in engine.observations" :key="index">{{ observation.targetId }} · {{ state(observation.status) }} · {{ display(observation.value) }}<span v-if="observation.reason"> · {{ observation.reason }}</span></p>
                <blockquote v-for="quote in engine.evidence" :key="quote.evidenceId">{{ quote.messageId }}（{{ quote.start }}–{{ quote.end }}）：“{{ quote.quote }}”</blockquote>
                <details><summary>原始输出</summary><pre>{{ engine.rawOutput ?? '未记录原始输出' }}</pre></details>
                <details><summary>本次引擎配置</summary><pre>{{ JSON.stringify(engine.configuration,null,2) }}</pre></details>
              </article>
              <details><summary>本次执行的会话原文</summary><article v-for="item in raw.input.messages" :key="item.messageId" class="candidate"><strong>#{{ item.sequence }} · {{ item.speakerRole }} · {{ item.relativeTime }}</strong><p>{{ item.content }}</p></article></details>
            </a-tab-pane>
          </a-tabs>
        </template>
      </template>
    </a-spin>
  </section>
</template>
<style scoped>
.result-controls{margin-bottom:20px}.result-controls label{display:block;margin-bottom:8px}.result-item{padding:16px 0;border-bottom:1px solid #e8edf4}.result-item h3{margin:0 0 8px}.candidate{margin:12px 0;padding:12px;background:#f6f8fb}.source,small{color:#64748b;overflow-wrap:anywhere}pre,p,blockquote{white-space:pre-wrap;overflow-wrap:anywhere}pre{max-height:320px;overflow:auto}summary{cursor:pointer;color:#1677ff}blockquote{border-left:3px solid #dbeafe;padding-left:12px;margin:12px 0}
</style>
