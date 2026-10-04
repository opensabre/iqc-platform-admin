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
    const value = await getBusinessQualityReport([...selected.value], selections, runPolicy.value as BusinessQualityReport["runPolicy"]);
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
      <a-button type="primary" :disabled="!valid || loading" :loading="loading" @click="refresh">查询业务统计</a-button>
    </a-form>
    <a-alert v-if="error" type="error" show-icon :message="error" />
    <p v-else-if="loading" role="status">正在校验任务范围并生成统计…</p>
    <p v-else-if="!report">请选择业务模板创建的任务后查询；不会自动统计全部任务。</p>
    <template v-if="report">
      <p>本次范围：{{ report.taskCount }} 个任务，{{ report.conversationCount }} 次会话评估，{{ report.groups.length }} 组冻结方案。统计口径：{{ runPolicyText }}。</p>
      <a-alert v-if="report.groups.length > 1" type="warning" show-icon
        :message="`当前按 ${report.groups.length} 个冻结标准分组，未混合计算。跨组分数不可直接比较；请逐组核对评分制、基础分、合格线、项目分值/否决及项目覆盖。`" />
      <a-card v-for="group in report.groups" :key="group.groupKey" style="margin-top:16px" :title="`方案 ${group.schemeId || '未记录'} · ${group.versionNo ? '发布版本 ' + group.versionNo : '试跑修订 ' + (group.draftRevision || '未记录')}`">
        <p>{{ group.mode === 'DEDUCTION' ? '扣分制' : '得分制' }}<template v-if="group.mode === 'DEDUCTION'"> · 基础分 {{ group.baseScore ?? '—' }}</template>
          · 合格线 {{ group.passingScore }} · {{ group.conversationCount }} 次评估</p>
        <p class="task-scope">任务范围：{{ group.taskIds.join('、') }}</p>
        <p class="task-scope">执行实例：{{ group.executionIds.length ? group.executionIds.join('、') : '所选范围暂无结果' }}</p>
        <a-space wrap><a-tag>缺失机器结果：{{ group.missingResultCount }}</a-tag><a-tag>无完成复核：{{ group.missingReviewCount }}</a-tag><a-tag>最新轮次待处理：{{ group.pendingReviewCount }}</a-tag></a-space>
        <a-table :columns="columns" :data-source="[{ ...group.machine, source: '机器评分' }, { ...group.reviewed, source: '人工复核' }]" row-key="source" :pagination="false" :scroll="{ x: 1000 }">
          <template #bodyCell="{ column, text }">
            <template v-if="column.dataIndex === 'averageScore'">{{ text == null ? '—' : text }}</template>
            <template v-else-if="column.dataIndex === 'qualifiedRate'">{{ text == null ? '—' : `${text}%` }}</template>
          </template>
        </a-table>
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
