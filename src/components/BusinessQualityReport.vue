<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { getBusinessQualityReport, type BusinessQualityReport } from "@/api/quality";
import { listTaskExecutions, listTasks, type TaskExecutionSummary } from "@/api/tasks";
import { usePermission } from "@/composables/permission";

// Reuses the task catalog and report endpoint; no implicit all-task aggregation.
const { can } = usePermission();
const selected = ref<string[]>([]), keyword = ref("");
const options = ref<{ value: string; label: string }[]>([]);
const executionOptions = ref<Record<string, TaskExecutionSummary[]>>({});
const executionSelections = ref<Record<string, string>>({});
const runPolicy = ref<BusinessQualityReport["runPolicy"] | "">("");
const loading = ref(false), searching = ref(false), error = ref(""), searchError = ref("");
const executionLoading = ref(false), executionError = ref("");
const report = ref<BusinessQualityReport>();
const includeModelUsage=ref(false),includeActionMetrics=ref(false);
const actionStateNames:Record<string,string>={PENDING:'待执行',RUNNING:'执行中',WAITING_RETRY:'等待重试',COMPLETE:'完成',FAILED:'失败',REQUIRES_RECONCILIATION:'待核对',BLOCKED_AUTHORIZATION:'授权阻塞',BLOCKED_ADAPTER:'适配器阻塞',BLOCKED_SOURCE:'来源阻塞',EXPIRED:'已过期'};
const actionOutcomeNames:Record<string,string>={CONFIRMED_SUCCESS:'已确认成功',CONFIRMED_FINAL_FAILURE:'已确认最终失败',CONFIRMED_RETRYABLE_FAILURE:'已确认可重试失败',UNKNOWN:'结果未知'};
const tokenKinds=[{key:'input',label:'输入'},{key:'output',label:'输出'},{key:'total',label:'总量'}] as const;
let reportRequest = 0, searchRequest = 0, executionRequest = 0;
const valid = computed(() => {
  if (selected.value.length === 0 || selected.value.length > 20 || !runPolicy.value
      || selected.value.some(id => id.trim() !== id || id.length === 0 || id.length > 64 || id.includes(","))) return false;
  if (runPolicy.value !== "SELECTED_RUNS") return true;
  return selected.value.every(id => !!executionSelections.value[id])
    && (!can("iqc:task:view") || !executionLoading.value && selected.value.every(id => Object.hasOwn(executionOptions.value, id)));
});
function clearReport() { reportRequest++; report.value = undefined; loading.value = false; error.value = ""; }
watch(selected, () => {
  clearReport(); executionError.value = "";
  const prior = executionSelections.value;
  executionSelections.value = Object.fromEntries(selected.value.map(id => [id, prior[id] || "LATEST"]));
  executionOptions.value = {};
  const request = ++executionRequest;
  executionLoading.value = false;
  if (!can("iqc:task:view") || selected.value.length === 0) return;
  executionLoading.value = true;
  void Promise.all(selected.value.map(async id => {
    try { return [id, await listTaskExecutions(id)] as const; }
    catch {
      if (request === executionRequest) executionError.value = "部分任务的执行记录未能加载，当前仍可按任务最新结果查询。";
      return [id, []] as const;
    }
  })).then(entries => {
    if (request !== executionRequest) return;
    executionOptions.value = Object.fromEntries(entries);
    executionLoading.value = false;
  });
}, { deep: true, flush: "sync" });
// Hiding the section is insufficient: restoration must not revive stale or late evidence.
watch(()=>can("iqc:report:view"),allowed=>{if(!allowed)clearReport();},{flush:"sync"});
watch([includeModelUsage,includeActionMetrics],clearReport,{flush:"sync"});
watch(()=>can("iqc:task:model-calls:view"),()=>{includeModelUsage.value=false;clearReport();},{flush:"sync"});
watch(()=>can("iqc:action:history:view"),()=>{includeActionMetrics.value=false;clearReport();},{flush:"sync"});
watch([runPolicy, executionSelections], clearReport, { deep: true, flush: "sync" });
onBeforeUnmount(() => { reportRequest++; searchRequest++; executionRequest++; });

async function searchTasks() {
  if (!can("iqc:report:view") || !can("iqc:task:view")) return;
  const request = ++searchRequest; searching.value = true; searchError.value = "";
  try {
    const page = await listTasks({ keyword: keyword.value.trim() || undefined, current: 1, size: 20 });
    if (request !== searchRequest) return;
    options.value = page.records.map(task => ({ value: task.id, label: `${task.name} · ${task.id}` }));
    if (!page.records.length) searchError.value = "未找到任务，请调整名称关键字。";
  } catch { if (request === searchRequest) { options.value = []; searchError.value = "任务搜索失败，请重试。"; } }
  finally { if (request === searchRequest) searching.value = false; }
}
async function refresh() {
  if (!can("iqc:report:view") || !valid.value) return;
  const request = ++reportRequest; report.value = undefined; loading.value = true; error.value = "";
  try {
    const selections = runPolicy.value === "SELECTED_RUNS" ? { ...executionSelections.value } : undefined;
    const usage=includeModelUsage.value&&can("iqc:task:model-calls:view");
    const actions=includeActionMetrics.value&&can("iqc:action:history:view");
    const value = actions?await getBusinessQualityReport([...selected.value],selections,runPolicy.value as BusinessQualityReport["runPolicy"],usage,true)
      :usage?await getBusinessQualityReport([...selected.value],selections,runPolicy.value as BusinessQualityReport["runPolicy"],true)
      :await getBusinessQualityReport([...selected.value],selections,runPolicy.value as BusinessQualityReport["runPolicy"]);
    if (request === reportRequest) report.value = value;
  } catch { if (request === reportRequest) error.value = "统计查询失败。请确认任务为业务模板任务、拥有查看权限，且合计不超过 500 个任务会话 / 50000 项，再重试。"; }
  finally { if (request === reportRequest) loading.value = false; }
}
const columns = [
  { title: "结果来源", dataIndex: "source" }, { title: "已有评分结果", dataIndex: "resultCount" },
  { title: "确定分数", dataIndex: "finalCount" }, { title: "待确认", dataIndex: "pendingCount" },
  { title: "不计分", dataIndex: "notApplicableCount" }, { title: "合格数", dataIndex: "qualifiedCount" },
  { title: "均分（仅确定分数）", dataIndex: "averageScore" }, { title: "合格率（仅确定分数）", dataIndex: "qualifiedRate" }
];
const itemColumns = [
  { title: "质检项", dataIndex: "name", width: 180 }, { title: "来源", dataIndex: "source", width: 110 },
  { title: "分值", dataIndex: "points", width: 80 }, { title: "否决", dataIndex: "veto", width: 80 },
  { title: "不满足率", dataIndex: "failureRate", width: 110 },
  { title: "满足", dataIndex: "passCount", width: 90 }, { title: "不满足", dataIndex: "failCount", width: 90 },
  { title: "不适用", dataIndex: "notApplicableCount", width: 90 }, { title: "未评估", dataIndex: "notEvaluatedCount", width: 90 },
  { title: "待复核", dataIndex: "reviewRequiredCount", width: 90 }, { title: "错误", dataIndex: "errorCount", width: 90 },
  { title: "已生成项结论", dataIndex: "resultCount", width: 120 }, { title: "计分", dataIndex: "scored", width: 90 }
];
const runPolicyText = computed(() => runPolicy.value === "SELECTED_RUNS" ? "按所选任务当前结果或指定执行实例分别统计；同一会话在多个任务中可能重复计数"
  : runPolicy.value === "FIRST_PER_CONVERSATION" ? "同一冻结标准内，从所选任务全部执行实例中取每个会话最早结果；不同标准仍分组展示"
    : runPolicy.value === "LATEST_PER_CONVERSATION" ? "同一冻结标准内，从所选任务全部执行实例中取每个会话最新结果；不同标准仍分组展示" : "请选择统计口径");
defineExpose({ refresh });
</script>

<template>
  <a-alert v-if="!can('iqc:report:view')" type="warning" message="暂无质检报表查看权限。" show-icon />
  <section v-else aria-label="业务评分统计">
    <a-alert type="info" show-icon message="不同冻结方案分别统计，机器与人工复核不混算。只有确定分数进入均分和合格率；人工统计取当前结果最近已完成复核。" />
    <a-form layout="vertical" style="margin-top:16px">
      <a-form-item v-if="can('iqc:task:view')" label="搜索任务名称">
        <a-space><a-input v-model:value="keyword" placeholder="输入名称关键字" @press-enter="searchTasks" />
          <a-button :loading="searching" @click="searchTasks">搜索任务</a-button></a-space>
        <p v-if="searchError" role="status">{{ searchError }}</p>
      </a-form-item>
      <a-form-item label="选择业务任务（最多 20 个，也可输入任务 ID 后回车）">
        <a-select v-model:value="selected" mode="tags" :options="options" option-filter-prop="label" placeholder="先搜索任务，或输入已知任务 ID" aria-label="选择业务任务" />
      </a-form-item>
      <a-form-item label="运行统计口径">
        <select v-model="runPolicy" aria-label="运行统计口径">
          <option disabled value="">请选择统计口径</option>
          <option value="SELECTED_RUNS">按所选执行轮次分别统计</option>
          <option value="FIRST_PER_CONVERSATION">同一冻结标准取每个会话最早结果</option>
          <option value="LATEST_PER_CONVERSATION">同一冻结标准取每个会话最新结果</option>
        </select>
        <p>{{ runPolicyText }}</p>
      </a-form-item>
      <a-form-item v-if="can('iqc:task:view') && selected.length && runPolicy === 'SELECTED_RUNS'" label="每个任务使用的执行轮次">
        <p v-if="executionLoading" role="status">正在读取任务执行记录…</p>
        <label v-for="id in selected" :key="id" class="run-selection">
          {{ options.find(option => option.value === id)?.label || id }}
          <select v-model="executionSelections[id]" :aria-label="`执行轮次 ${id}`">
            <option value="LATEST">当前结果：每个会话取该任务的最新结果（可能来自不同执行轮次）</option>
            <option v-for="run in executionOptions[id] || []" :key="run.id" :value="run.id">
              第 {{ run.attemptNo }} 次 · {{ run.status }} · {{ run.createdTime || run.id }}
            </option>
          </select>
        </label>
        <p v-if="executionError" role="status">{{ executionError }}</p>
      </a-form-item>
      <a-form-item v-if="can('iqc:task:model-calls:view')" label="模型调用统计"><a-checkbox v-model:checked="includeModelUsage">包含所选结果轮次的调用费用与耗时</a-checkbox></a-form-item>
      <a-form-item v-if="can('iqc:action:history:view')" label="动作统计"><a-checkbox v-model:checked="includeActionMetrics">包含所选结果轮次的动作状态与已确认失败率</a-checkbox></a-form-item>
      <a-button type="primary" :disabled="!valid || loading" :loading="loading" @click="refresh">查询业务统计</a-button>
    </a-form>
    <a-alert v-if="error" type="error" show-icon :message="error" />
    <p v-else-if="loading" role="status">正在校验任务范围并生成统计…</p>
    <p v-else-if="!report">请选择业务方案或流水线任务后查询；不会自动统计全部任务。</p>
    <template v-if="report">
      <p>本次范围：{{ report.taskCount }} 个任务，{{ report.conversationCount }} 次会话评估，{{ report.groups.length }} 组冻结标准与分配来源。统计口径：{{ runPolicyText }}。</p>
      <a-card v-if="can('iqc:action:history:view')&&report.actionMetrics?.schemaVersion==='iqc-business-action-metrics-v1'" title="所选结果动作状态" size="small" style="margin:12px 0">
        <p>可绑定结果轮次 {{report.actionMetrics.boundResults}} / {{report.actionMetrics.selectedResults}} · 缺结果或轮次 {{report.actionMetrics.unboundResults}}</p>
        <p>动作记录 {{report.actionMetrics.actionCount}} · 已确认成功 {{report.actionMetrics.confirmedSuccessCount}} · 已确认失败 {{report.actionMetrics.confirmedFailureCount}} · 尚未最终确认 {{report.actionMetrics.unresolvedCount}}</p>
        <p>已确认动作失败率：{{report.actionMetrics.confirmedFailureRate==null?'未测量':`${report.actionMetrics.confirmedFailureRate}%`}}</p>
        <p v-if="report.actionMetrics.actionCount==='0'">所选结果没有匹配动作记录，不代表动作已经执行成功。</p>
        <p>失败率以已确认成功和已确认失败的最终动作记录为分母；等待重试、阻塞及结果未知不计入。当前快照按原查询范围合计，不表示每次尝试失败率或外部业务履约结果。</p>
        <p v-for="(state,index) in report.actionMetrics.states" :key="index">{{actionStateNames[state.status]||state.status}} · {{state.outcome?(actionOutcomeNames[state.outcome]||state.outcome):'未记录结果'}}：{{state.actionCount}}</p>
      </a-card>
      <a-alert v-else-if="includeActionMetrics&&can('iqc:action:history:view')" type="warning" show-icon message="本次响应未提供受支持的动作统计，无法确认动作失败率。" />
      <a-alert v-if="report.groups.length > 1" type="warning" show-icon
        :message="`当前按 ${report.groups.length} 个冻结标准与分配来源分组，未混合计算。跨组分数不可直接比较；请逐组核对评分制、基础分、合格线、项目分值/否决及项目覆盖。`" />
      <a-card v-for="group in report.groups" :key="group.groupKey" style="margin-top:16px" :title="`${group.pipelineId?'流水线':'方案'} ${group.pipelineId || group.schemeId || '未记录'} · ${group.versionNo ? '发布版本 ' + group.versionNo : '试跑修订 ' + (group.draftRevision || '未记录')}`">
        <p>{{ group.mode === 'DEDUCTION' ? '扣分制' : '得分制' }}<template v-if="group.mode === 'DEDUCTION'"> · 基础分 {{ group.baseScore ?? '—' }}</template>
          · 合格线 {{ group.passingScore }} · {{ group.conversationCount }} 次评估</p>
        <a-card v-if="group.rollout?.schemaVersion==='iqc-business-rollout-attribution-v1'" title="生产灰度观测" size="small" style="margin:12px 0">
          <p>原分配：{{group.rollout.side==='CANDIDATE'?'候选':'基线'}} · 策略修订 {{group.rollout.revisionNo}} · {{group.rollout.state==='ROLLED_BACK'?'已回退策略':'启用策略'}}</p>
          <p>基线 v{{group.rollout.baselineVersionNo}} / 候选 v{{group.rollout.candidateVersionNo}} · 原候选分配比例 {{(group.rollout.candidateBasisPoints/100).toFixed(2)}}% · 实际所选 v{{group.rollout.selectedVersionNo}}</p>
          <p>{{group.taskIds.length}} 个所选任务 · {{group.conversationCount}} 次会话评估；任务分配比例不等于会话比例。</p>
          <details><summary>冻结来源摘要</summary><p>修订 {{group.rollout.revisionId}} · {{group.rollout.revisionHash}}</p><p>策略 {{group.rollout.policyHash}}</p><p>发布 {{group.rollout.selectedReleaseHash}}</p></details>
          <a-alert type="info" show-icon message="仅统计所选任务与执行，按原灰度修订、侧别和冻结评分标准拆组。分桶以任务为单位，语料与执行时段可能不同；请结合下方缺失结果及复核覆盖解释观测，受控对照请使用同数据集 Benchmark。"/>
        </a-card>
        <a-card v-if="can('iqc:task:model-calls:view')&&group.modelUsage?.schemaVersion==='iqc-business-model-usage-v1'" title="模型调用用量、费用与耗时" size="small" style="margin:12px 0">
          <p>可绑定结果轮次 {{group.modelUsage.boundResults}} / {{group.modelUsage.selectedResults}} · 缺结果或轮次 {{group.modelUsage.unboundResults}}</p>
          <p>调用记录 {{group.modelUsage.costs.callCount}} · 可按声明价格计算 {{group.modelUsage.costs.knownCount}} · 费用未知 {{group.modelUsage.costs.unknownCount}}</p>
          <p v-if="group.modelUsage.costs.callCount==='0'">所选轮次没有匹配调用记录，费用尚无法确认。</p>
          <p v-for="cost in group.modelUsage.costs.currencies" :key="cost.currency??'unknown'">{{cost.currency??'未记录币种'}}：已知费用小计 {{cost.knownSubtotal??'未知'}} · {{cost.knownCount}} 条可计算 / {{cost.unknownCount}} 条费用未知</p>
          <p>已确认调用接收至结算平均耗时 {{group.modelUsage.latency.averageMillis==null?'未测量':`${group.modelUsage.latency.averageMillis} ms`}} · 已测量 {{group.modelUsage.latency.measuredCount}} / {{group.modelUsage.latency.callCount}} · 未测量 {{group.modelUsage.latency.unknownCount}}</p>
          <template v-if="group.modelUsage.tokens">
            <p v-for="kind in tokenKinds" :key="kind.key">供应商已报告{{kind.label}} Token：已知小计 {{group.modelUsage.tokens[kind.key].knownSubtotal??'未测量'}} · 已知 {{group.modelUsage.tokens[kind.key].knownCount}} / 未知 {{group.modelUsage.tokens[kind.key].unknownCount}} 条调用</p>
            <p>三项独立统计，不由输入/输出推算缺失总量；未测量与合法零值区分。</p>
          </template>
          <a-alert type="info" message="按最终所选结果的任务、执行轮次和会话匹配账本，包含该范围实际记录的重试及工具调用。继承旧结果可能没有本轮调用；缺轮次不会扩大到全部历史。费用为声明价格计算，币种分别列示；调用耗时不含任务排队与完整流程时间。"/>
        </a-card>
        <p class="task-scope">任务范围：{{ group.taskIds.join('、') }}</p>
        <p class="task-scope">执行实例：{{ group.executionIds.length ? group.executionIds.join('、') : '所选范围暂无结果' }}</p>
        <a-space wrap><a-tag>缺失机器结果：{{ group.missingResultCount }}</a-tag><a-tag>无完成复核：{{ group.missingReviewCount }}</a-tag><a-tag>最新轮次待处理：{{ group.pendingReviewCount }}</a-tag></a-space>
        <a-card v-if="group.reviewChanges?.schemaVersion==='iqc-business-review-changes-v1'" title="业务结果人工修改率" size="small" style="margin:12px 0">
          <p>已完成复核：{{group.reviewChanges.reviewedResults}} / {{group.conversationCount}} · 覆盖率 {{group.reviewChanges.reviewCoverage==null?'无样本':`${(group.reviewChanges.reviewCoverage*100).toFixed(2)}%`}}</p>
          <p>相对机器结果有变更：{{group.reviewChanges.modifiedResults}} / {{group.reviewChanges.reviewedResults}} · 修改率 {{group.reviewChanges.modificationRate==null?'无完成复核':`${(group.reviewChanges.modificationRate*100).toFixed(2)}%`}}</p>
          <p>项目、证据或计算评分变更：{{group.reviewChanges.itemOrScoreChangedResults}} · 事实值、状态、严重度或证据变更：{{group.reviewChanges.findingChangedResults}} · 人工覆盖数字变更：{{group.reviewChanges.effectiveNumericScoreChangedResults}}</p>
          <a-alert type="info" show-icon message="按所选执行与冻结标准分组，比较最近完成复核和原机器结果；未复核不当作未修改，分类可重叠。单改原因、反馈分类或证据顺序不计变更；不含独立标签复核。" />
        </a-card>
        <a-table :columns="columns" :data-source="[{ ...group.machine, source: '机器评分' }, { ...group.reviewed, source: group.reviewed.manualOverrides?'复核计算评分':'人工复核' }]" row-key="source" :pagination="false" :scroll="{ x: 1000 }">
          <template #bodyCell="{ column, text }">
            <template v-if="column.dataIndex === 'averageScore'">{{ text == null ? '—' : text }}</template>
            <template v-else-if="column.dataIndex === 'qualifiedRate'">{{ text == null ? '—' : `${text}%` }}</template>
          </template>
        </a-table>
        <a-card v-if="group.reviewed.manualOverrides" size="small" title="人工改分统计">
          <p>已生效：{{group.reviewed.manualOverrides.appliedCount}} · 基准变化待确认：{{group.reviewed.manualOverrides.staleCount}}</p>
          <p>已生效人工覆盖均分：{{group.reviewed.manualOverrides.averageOverrideScore??'—'}}（仅已生效覆盖进入分母）</p>
          <p>有效数字均分（覆盖优先）：{{group.reviewed.manualOverrides.averageEffectiveScore??'—'}} · 有效数字数量：{{group.reviewed.manualOverrides.effectiveNumericCount}}</p>
          <p>每个已完成复核优先采用已生效人工分数，否则仅纳入最终计算分数；待定、不适用和缺失计算分数不补零。数字覆盖不代表否决解除或合格率变化。</p>
        </a-card>
        <details class="item-analysis" :open="report.groups.length > 1">
        <summary>质检项分析{{ group.items ? `（${group.items.length} 项）` : '' }}</summary>
        <p>分值和否决来自该任务冻结评分标准。不满足率 = 不满足 ÷（满足 + 不满足）；不适用、未评估、待复核、错误和缺失结论不进入分母；人工仅统计最近已完成复核，不用机器值补齐。</p>
        <a-table v-if="group.items?.length" :columns="itemColumns" :data-source="group.items.flatMap(item => [
          { ...item.machine, name: item.name, source: '机器结论', scored: item.scored, points: item.points, veto: item.veto, key: `${item.itemCode}:machine` },
          { ...item.reviewed, name: item.name, source: '人工复核', scored: item.scored, points: item.points, veto: item.veto, key: `${item.itemCode}:reviewed` }
        ])" row-key="key" :pagination="{ pageSize: 20 }" :scroll="{ x: 1400 }" table-layout="fixed">
          <template #bodyCell="{ column, text }">
            <template v-if="column.dataIndex === 'failureRate'">{{ text == null ? '—' : `${text}%` }}</template>
            <template v-else-if="column.dataIndex === 'points'">{{ text == null ? '—' : text }}</template>
            <template v-else-if="column.dataIndex === 'veto'">{{ text ? '一票否决' : '否' }}</template>
            <template v-else-if="column.dataIndex === 'scored'">{{ text ? '计分' : '不计分' }}</template>
          </template>
        </a-table>
        <p v-else>{{ group.items ? '此方案没有质检项，仅识别标签。' : '当前响应未提供质检项统计，请确认后端版本。' }}</p>
        </details>
      </a-card>
    </template>
  </section>
</template>

<style scoped>
.task-scope { overflow-wrap: anywhere; }
.run-selection { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 8px 0; }
.item-analysis { margin-top: 16px; }
.item-analysis summary { cursor: pointer; }
</style>
