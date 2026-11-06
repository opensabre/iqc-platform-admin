<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import { useRouter } from "vue-router";
import {
  cancelTask,
  getTask,
  listTasks,
  runTask,
  pauseTask,
  resumeTask,
  changeTaskPriority,
  deleteTask,
  type TaskAgentConfigSnapshot,
  type TaskAgentSnapshot,
  type TaskRuleSnapshot,
  type TaskWizardSnapshot,
  type TaskDataSelection,
  type InspectionTask,
  type ExecutionMode,
} from "@/api/tasks";
import {
  listAgents,
  listRules,
  listRuleSets,
  type QualityAgent,
  type QualityRule,
  type QualityRuleSet,
} from "@/api/config";
import { usePermission } from "@/composables/permission";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import {
  getBatchResultSummary,
  getConversationResultDetail,
  getTaskLabelResults,
  getTaskLabelInsights,
  exportTaskLabelResults,
  type BatchResultSummary,
  type ConversationResultDetail,
  type InspectionResult,
  type LabelResult,
  type LabelInsightSummary,
} from "@/api/results";
import {
  getLabelTree,
  type LabelTree,
} from "@/api/labels";
import TaskCreateWizard from "@/components/TaskCreateWizard.vue";
import LabelValueReviewPanel from "@/components/LabelValueReviewPanel.vue";
import { countConversationLabelStates, presentEffectiveLabel, presentLabel } from "./label-results";

const tasks = ref<InspectionTask[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const modalOpen = ref(false);
const router = useRouter();
const agents = ref<QualityAgent[]>([]);
const rules = ref<QualityRule[]>([]);
const ruleSets = ref<QualityRuleSet[]>([]);
const labelTree = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const detailOpen = ref(false);
const detail = ref<InspectionTask>();
const resultOpen = ref(false),
  conversationResultOpen = ref(false),
  resultLoading = ref(false);
const batchResult = ref<BatchResultSummary>();
const labelResults = ref<LabelResult[]>([]);
const selectedLabelReview = ref<LabelResult>();
const labelRows = computed(() => labelResults.value.map(result => ({ ...result, presentation: presentLabel(result) })));
const resultTab = ref("inspection");
const selectedLabelConversationId = ref<string>();
const visibleLabelRows = computed(() => selectedLabelConversationId.value
  ? labelRows.value.filter(row => row.conversationId === selectedLabelConversationId.value)
  : labelRows.value);
const conversationLabelCounts = computed(() => countConversationLabelStates(labelResults.value));
function showConversationLabels(conversationId: string) {
  selectedLabelConversationId.value = conversationId;
  resultTab.value = "labels";
}
const labelStateCounts = computed(() => ["KNOWN", "UNKNOWN", "CONFLICT", "ERROR", "HIT"].map(state => ({
  state, name: ({ KNOWN: "确定", UNKNOWN: "未知", CONFLICT: "冲突", ERROR: "错误", HIT: "兼容命中" } as Record<string, string>)[state],
  count: labelRows.value.filter(row => row.presentation.state === state).length,
})));
const labelInsights = ref<LabelInsightSummary>();
const conversationResult = ref<ConversationResultDetail>();
const taskStatuses = ref<DictionaryItem[]>([]);
const filters = ref({ keyword: "", status: undefined as string | undefined, taskType: undefined as string | undefined });
let pollingTimer: number | undefined;
function parseSnapshot<T>(value?: string | T): T | undefined {
  if (!value) return undefined;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
const detailAgent = computed(() =>
  parseSnapshot<TaskAgentSnapshot>(detail.value?.agentSnapshotJson)
);
const wizardDetail = computed(() => {
  const snapshot = parseSnapshot<TaskWizardSnapshot>(detail.value?.ruleSnapshotJson);
  return snapshot?.schemaVersion === "iqc-task-wizard-v1" ? snapshot : undefined;
});
function frozenTargetName(targetId: string) {
  return wizardDetail.value?.resultProcessing.labelSnapshot?.labels.find(label => label.id === targetId)?.name || targetId;
}
const detailAgentConfig = computed(() =>
  parseSnapshot<TaskAgentConfigSnapshot>(detailAgent.value?.configJson)
);
const detailRuleSnapshot = computed(() =>
  parseSnapshot<
    TaskRuleSnapshot[] | {
      ruleSetId?: string;
      ruleSetName?: string;
      ruleSetCode?: string;
      ruleSetVersion?: number;
      aggregationMode?: string;
      rules?: TaskRuleSnapshot[];
      executionStrategy?: { schemaVersion: string; mode: ExecutionMode };
    }
  >(detail.value?.ruleSnapshotJson)
);
const detailRules = computed(() => {
  const snapshot = detailRuleSnapshot.value;
  return Array.isArray(snapshot) ? snapshot : snapshot?.rules || [];
});
const detailRuleSet = computed(() =>
  Array.isArray(detailRuleSnapshot.value) ? undefined : detailRuleSnapshot.value
);
const currentDetailRuleSet = computed(() =>
  ruleSets.value.find((item) => item.id === (detailRuleSet.value?.ruleSetId || detail.value?.ruleSetId))
);
const modeLabels: Record<string, string> = {
  RULE_ONLY: "普通规则",
  RULE_THEN_LLM: "规则 + 智能体复核",
  LLM_THEN_RULE: "智能提取 + 规则复核",
  AGENT_LLM: "智能体质检",
  INDEPENDENT: "逐项独立执行（规则与 LLM）",
};
function modeLabel(mode?: string) {
  return mode ? modeLabels[mode] || mode : "旧版兼容模式";
}
function assetNames(items?: { name?: string; code?: string; versionNo?: number }[]) {
  return items?.map((item) => `${item.name || item.code || "未命名"}${item.versionNo ? ` V${item.versionNo}` : ""}`).join("、") || "无";
}
const { can } = usePermission();
const statusMap: Record<string, { label: string; color: string }> = {
  CREATED: { label: "待处理", color: "default" },
  QUEUED: { label: "排队中", color: "processing" },
  SCHEDULED: { label: "等待调度", color: "processing" },
  MATERIALIZING: { label: "正在选取会话", color: "processing" },
  RUNNING: { label: "质检中", color: "processing" },
  PAUSE_REQUESTED: { label: "暂停中", color: "warning" },
  PAUSED: { label: "已暂停", color: "warning" },
  CANCEL_REQUESTED: { label: "取消中", color: "warning" },
  SUCCEEDED: { label: "已完成", color: "success" },
  PARTIAL_FAILED: { label: "部分失败", color: "warning" },
  FAILED: { label: "失败", color: "error" },
  NO_DATA: { label: "无匹配数据", color: "default" },
  CANCELLED: { label: "已取消", color: "default" },
};
function statusLabel(status: string) {
  return (
    taskStatuses.value.find((item) => item.value === status)?.label ||
    statusMap[status]?.label ||
    status
  );
}
async function loadDictionaries() {
  try {
    const data = await getCachedDictionaries(["iqc_task_status"]);
    if (data.iqc_task_status?.length) taskStatuses.value = data.iqc_task_status;
  } catch {
    /* 治理中心不可用时保留本地展示兜底 */
  }
}

async function refresh() {
  loading.value = true;
  try {
    const [taskPage, agentList, ruleList, ruleSetList, taxonomy] =
      await Promise.all([
        listTasks({ current: page.value, size: pageSize.value, ...filters.value }),
        listAgents().catch(() => {
          message.warning("智能体列表不可用，仍可创建纯规则任务");
          return [] as QualityAgent[];
        }),
        listRules(),
        listRuleSets(),
        getLabelTree(),
      ]);
    tasks.value = taskPage.records;
    total.value = taskPage.total;
    agents.value = agentList.filter((item) => item.status === "PUBLISHED");
    rules.value = ruleList.filter((item) => item.status === "PUBLISHED");
    ruleSets.value = ruleSetList.filter((item) => item.status === "PUBLISHED");
    labelTree.value = taxonomy;
  } catch {
    message.error("任务列表加载失败");
  } finally {
    loading.value = false;
  }
}
async function poll() {
  if (
    !tasks.value.some((item) =>
      ["SCHEDULED", "MATERIALIZING", "QUEUED", "RUNNING", "PAUSE_REQUESTED", "CANCEL_REQUESTED"].includes(item.status)
    )
  )
    return;
  try {
    const result = await listTasks({
      current: page.value,
      size: pageSize.value,
      ...filters.value,
    });
    tasks.value = result.records;
    total.value = result.total;
  } catch {
    /* 刷新失败不打断正在执行的任务 */
  }
}
async function changePage(current: number, size: number) {
  page.value = current;
  pageSize.value = size;
  await refresh();
}
async function search() {
  page.value = 1;
  await refresh();
}
async function resetFilters() {
  filters.value = { keyword: "", status: undefined, taskType: undefined };
  await search();
}
function taskTypeLabel(taskType?: string) {
  return taskType === "SCHEDULED" ? "定时筛选" : taskType === "SAMPLE" ? "随机抽样" : "立即批量";
}
async function showDetail(id: string) {
  try {
    detail.value = await getTask(id);
    detailOpen.value = true;
  } catch {
    message.error("任务详情加载失败");
  }
}
function openCreate() { modalOpen.value = true; }
async function createdTask(task: InspectionTask) {
  modalOpen.value = false;
  message.success("任务已创建");
  await refresh();
  try { await showDetail(task.id); } catch { message.error("任务已创建，详情加载失败，可从列表重试"); }
}
function openRelated(path: string) {
  window.open(router.resolve(path).href, "_blank", "noopener,noreferrer");
}
function openSnapshotRule(rule: TaskRuleSnapshot) {
  if (!rule.id) return;
  const path = rule.ruleType === "DLS" ? "/rules/conversation" : "/rules/library";
  openRelated(`${path}?ruleId=${encodeURIComponent(rule.id)}`);
}
function conversationCount(task: InspectionTask) {
  try {
    return task.conversationIdsJson
      ? JSON.parse(task.conversationIdsJson).length
      : task.conversationId
      ? 1
      : 0;
  } catch {
    return task.conversationId ? 1 : 0;
  }
}
function taskSelection(task: InspectionTask) {
  const snapshot = parseSnapshot<{ schemaVersion: string; selection: TaskDataSelection; resolvedAt?: string }>(task.selectionFilterJson);
  return snapshot?.schemaVersion === "iqc-data-selection-v1" ? snapshot : undefined;
}
function selectionLabel(task: InspectionTask) {
  const mode = taskSelection(task)?.selection.mode;
  return mode ? ({ BATCH: "批量选择", RANDOM: "随机抽样", FILTER: "条件筛选" })[mode] : taskTypeLabel(task.taskType);
}
function conversationCountLabel(task: InspectionTask) {
  const selection = taskSelection(task);
  return selection && selection.selection.mode !== "BATCH" && !selection.resolvedAt && !task.currentExecutionId
    ? "执行时确定" : conversationCount(task);
}
async function cancel(id: string) {
  Modal.confirm({
    title: "确认取消任务？",
    content:
      "待处理、排队中或执行中的任务可以取消；执行中的任务会在当前消息完成后停止。",
    async onOk() {
      await cancelTask(id);
      message.success("任务已取消");
      await refresh();
    },
  });
}
async function run(id: string) {
  try {
    await runTask(id);
    message.success("任务已进入执行队列");
    await refresh();
  } catch {
    message.error("任务执行失败");
  }
}
async function pause(id: string) {
  try { await pauseTask(id); message.success("已提交暂停请求，将在当前处理单元结束后暂停"); await refresh(); }
  catch { message.error("任务暂停失败"); }
}
async function resume(id: string) {
  try { await resumeTask(id); message.success("任务已恢复执行"); await refresh(); }
  catch { message.error("任务恢复失败"); }
}
async function reprioritize(task: InspectionTask, offset:number) {
  try { await changeTaskPriority(task.id, (task.queuePriority || 0) + offset); message.success("任务优先级已调整"); await refresh(); }
  catch { message.error("当前状态不能调整优先级"); }
}
function removeTask(task:InspectionTask) {
  Modal.confirm({ title:"确认删除任务？", content:"仅逻辑删除任务入口，历史结果和审计记录仍会保留。", async onOk(){ await deleteTask(task.id); message.success("任务已删除"); await refresh(); } });
}
let resultRequest = 0;
async function showResults(id: string, labelResultId?: string, openLabels = false) {
  const request = ++resultRequest;
  selectedLabelReview.value = undefined;
  resultTab.value = openLabels ? "labels" : "inspection";
  selectedLabelConversationId.value = undefined;
  batchResult.value = undefined;
  labelResults.value = [];
  labelInsights.value = undefined;
  resultLoading.value = true;
  try {
    const results = await Promise.all([
      getBatchResultSummary(id),
      getTaskLabelResults(id),
      getTaskLabelInsights(id),
    ]);
    if (request !== resultRequest) return;
    [batchResult.value, labelResults.value, labelInsights.value] = results;
    resultOpen.value = true;
    if (labelResultId) {
      resultTab.value = "labels";
      const label = labelResults.value.find(row => row.id === labelResultId);
      if (label && can("iqc:review:view")) selectedLabelReview.value = label;
      else message.warning("该标签值已不属于当前任务结果，或当前账号没有复核查看权限");
    }
  } catch {
    if (request === resultRequest) message.error("批次结果加载失败");
  } finally {
    if (request === resultRequest) resultLoading.value = false;
  }
}
async function refreshReviewedLabels() {
  if (!batchResult.value) return;
  const taskId = batchResult.value.taskId;
  try {
    const [rows, insights] = await Promise.all([getTaskLabelResults(taskId), getTaskLabelInsights(taskId)]);
    if (batchResult.value?.taskId !== taskId) return;
    labelResults.value = rows;
    labelInsights.value = insights;
    const selected = selectedLabelReview.value;
    if (selected) selectedLabelReview.value = rows.find(row => row.id === selected.id);
  } catch { message.error("复核已保存，但标签统计刷新失败，请重新打开任务结果"); }
}
async function exportLabels(){
  if(!batchResult.value)return;
  try { const response=await exportTaskLabelResults(batchResult.value.taskId); const url=URL.createObjectURL(response.data); const link=document.createElement("a"); link.href=url; link.download="iqc-label-results.xlsx"; link.click(); URL.revokeObjectURL(url); }
  catch { message.error("标签结果导出失败"); }
}
async function showConversationResult(conversationId: string, evidenceJson?: string) {
  if (!batchResult.value) return;
  resultLoading.value = true;
  try {
    conversationResult.value = await getConversationResultDetail(
      batchResult.value.taskId,
      conversationId
    );
    conversationResultOpen.value = true;
    if (evidenceJson) {
      try {
        const messageId = JSON.parse(evidenceJson)?.[0]?.messageId;
        if (messageId) await nextTick(() => document.getElementById(`evidence-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      } catch { /* Evidence remains visible in the conversation even if an old payload is malformed. */ }
    }
  } catch {
    message.error("会话质检明细加载失败");
  } finally {
    resultLoading.value = false;
  }
}
function resultFor(messageId: string): InspectionResult | undefined {
  return conversationResult.value?.results.find(
    (item) => item.messageId === messageId
  );
}
function annotations(result?: InspectionResult) {
  if (!result) return [];
  try {
    return JSON.parse(result.evidenceJson || "[]");
  } catch {
    return [];
  }
}
onMounted(() => {
  void refresh();
  void loadDictionaries();
  const taskId = router.currentRoute.value.query.taskId;
  if (typeof taskId === "string") {
    if (router.currentRoute.value.query.view === "results") {
      const labelId = router.currentRoute.value.query.labelResultId;
      void showResults(taskId, typeof labelId === "string" ? labelId : undefined,
        router.currentRoute.value.query.tab === "labels");
    }
    else void showDetail(taskId).catch(() => message.error("任务详情加载失败，请在列表中重试"));
  }
  pollingTimer = window.setInterval(poll, 3000);
});
onBeforeUnmount(() => {
  if (pollingTimer) window.clearInterval(pollingTimer);
});
</script>

<template>
  <section class="page-intro task-page-intro">
    <div>
      <span class="section-kicker">INSPECTION TASKS</span>
      <h2>任务中心</h2>
      <p>从会话中心选择数据，配置质检或打标引擎，查看评分、标签和执行记录。</p>
    </div>
    <a-button v-if="can('iqc:task:create')" type="primary" @click="openCreate">创建任务</a-button>
  </section>
  <a-card :bordered="false" class="task-filter-card">
    <a-form layout="inline" @submit.prevent="search">
      <a-form-item label="任务">
        <a-input v-model:value="filters.keyword" allow-clear placeholder="任务名称或 ID" style="width: 220px" />
      </a-form-item>
      <a-form-item label="状态">
        <a-select v-model:value="filters.status" allow-clear placeholder="全部状态" style="width: 140px">
          <a-select-option v-for="item in taskStatuses" :key="item.value" :value="item.value">{{ item.label }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="任务类型">
        <a-select v-model:value="filters.taskType" allow-clear placeholder="全部类型" style="width: 140px">
          <a-select-option value="BATCH">立即批量</a-select-option>
          <a-select-option value="SAMPLE">随机抽样</a-select-option>
          <a-select-option value="SCHEDULED">定时筛选</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item>
        <a-button type="primary" html-type="submit">查询</a-button>
        <a-button style="margin-left: 8px" @click="resetFilters">重置</a-button>
      </a-form-item>
    </a-form>
  </a-card>
  <a-card :bordered="false" class="tasks-card">
    <a-table
      :data-source="tasks"
      :loading="loading"
      :pagination="false"
      row-key="id"
    >
      <a-table-column key="id" title="任务 ID" :width="230">
        <template #default="{ record }">
          <a-typography-text :ellipsis="{ tooltip: record.id }">{{ record.id }}</a-typography-text>
        </template>
      </a-table-column>
      <a-table-column key="name" title="任务名称" data-index="name" />
      <a-table-column key="taskType" title="数据筛选" :width="110"><template #default="{ record }">{{ selectionLabel(record) }}</template></a-table-column>
      <a-table-column key="conversations" title="会话数" :width="90"
        ><template #default="{ record }">{{
          conversationCountLabel(record)
        }}</template></a-table-column
      >
      <a-table-column key="status" title="状态" :width="120"
        ><template #default="{ record }"
          ><a-tag :color="statusMap[record.status]?.color">{{
            statusLabel(record.status)
          }}</a-tag></template
        ></a-table-column
      >
      <a-table-column key="progress" title="进度" :width="220"
        ><template #default="{ record }"
          ><a-progress
            :percent="
              record.totalMessages
                ? Math.round(
                    (record.processedMessages / record.totalMessages) * 100
                  )
                : 0
            "
            size="small" /></template
      ></a-table-column>
      <a-table-column
        key="createdTime"
        title="创建时间"
        data-index="createdTime"
        :width="190"
      />
      <a-table-column key="actions" title="操作" :width="250"
        ><template #default="{ record }"
          ><a-button type="link" @click="showDetail(record.id)">详情</a-button
          ><a-button
            v-if="['CREATED','SCHEDULED','QUEUED','PAUSED'].includes(record.status) && can('iqc:task:execute')"
            type="link" @click="reprioritize(record, 1)">提权</a-button
          ><a-button
            v-if="['CREATED','SCHEDULED','QUEUED','PAUSED'].includes(record.status) && can('iqc:task:execute')"
            type="link" @click="reprioritize(record, -1)">降权</a-button
          ><a-button
            v-if="
              ['SUCCEEDED', 'PARTIAL_FAILED', 'FAILED'].includes(
                record.status
              ) && can('iqc:result:view')
            "
            type="link"
            @click="showResults(record.id)"
            >查看结果</a-button
          ><a-button
            v-if="
              ['CREATED', 'FAILED', 'PARTIAL_FAILED'].includes(record.status) &&
              can('iqc:task:execute')
            "
            type="link"
            @click="run(record.id)"
            >{{
              ["FAILED", "PARTIAL_FAILED"].includes(record.status)
                ? "重试"
                : "执行"
            }}</a-button
          ><a-button
            v-if="record.status === 'RUNNING' && can('iqc:task:execute')"
            type="link"
            @click="pause(record.id)"
            >暂停</a-button
          ><a-button
            v-if="record.status === 'PAUSED' && can('iqc:task:execute')"
            type="link"
            @click="resume(record.id)"
            >恢复</a-button
          ><a-button
            v-if="
              ['CREATED', 'QUEUED', 'RUNNING', 'PAUSE_REQUESTED', 'PAUSED'].includes(record.status) &&
              can('iqc:task:cancel')
            "
            type="link"
            danger
            @click="cancel(record.id)"
            >取消</a-button
          ><a-button
            v-if="['SUCCEEDED','PARTIAL_FAILED','FAILED','NO_DATA','CANCELLED'].includes(record.status) && can('iqc:task:delete')"
            type="link" danger @click="removeTask(record)">删除</a-button
          ></template
        ></a-table-column
      >
    </a-table>
    <a-pagination
      v-if="total"
      v-model:current="page"
      v-model:page-size="pageSize"
      :total="total"
      show-size-changer
      style="margin-top: 16px; text-align: right"
      @change="changePage"
    />
    <a-empty
      v-if="!loading && !tasks.length"
      description="暂无质检任务，请先导入会话"
    />
  </a-card>
  <TaskCreateWizard v-if="modalOpen" :agents="agents" :rules="rules"
    :labeling-targets="labelTree.labels.filter(label => label.status === 'PUBLISHED').map(label => ({ value: label.id, label: label.name }))"
    @cancel="modalOpen = false" @created="createdTask" />
  <a-drawer v-model:open="detailOpen" title="任务详情" width="min(820px, calc(100vw - 24px))"
    ><template v-if="detail"
      ><a-divider orientation="left">任务概况</a-divider
      ><a-descriptions bordered :column="1"
        ><a-descriptions-item label="任务名称">{{
          detail.name
        }}</a-descriptions-item
        ><a-descriptions-item label="数据筛选">{{ selectionLabel(detail) }}</a-descriptions-item
        ><a-descriptions-item label="状态"
          ><a-tag :color="statusMap[detail.status]?.color">{{
            statusMap[detail.status]?.label || detail.status
          }}</a-tag></a-descriptions-item
        ><a-descriptions-item label="会话/并发"
          >{{ conversationCountLabel(detail) }} /
          {{ detail.concurrencyLimit }}</a-descriptions-item
        ><a-descriptions-item label="进度"
          ><a-progress
            :percent="
              detail.totalMessages
                ? Math.round(
                    (detail.processedMessages / detail.totalMessages) * 100
                  )
                : 0
            " /></a-descriptions-item
        ><a-descriptions-item label="消息统计"
          >总数 {{ detail.totalMessages }}，已处理
          {{ detail.processedMessages }}，失败
          {{ detail.failedMessages }}</a-descriptions-item
        ><a-descriptions-item label="执行次数">{{
          detail.attemptCount || 0
        }}</a-descriptions-item
        ><a-descriptions-item label="当前执行实例">{{
          detail.currentExecutionId || "—"
        }}</a-descriptions-item
        ><a-descriptions-item label="创建时间">{{
          detail.createdTime || "—"
        }}</a-descriptions-item></a-descriptions
      >
      <template v-if="wizardDetail">
        <a-divider orientation="left">创建时引擎配置</a-divider>
        <a-alert type="info" show-icon message="以下为创建时冻结配置。各操作按自己的顺序执行，失败保留记录并继续。" />
        <section v-for="operation in (['INSPECTION','LABELING'] as const).filter(op => wizardDetail!.enginePlan.engines.some(engine => engine.operation === op))" :key="operation">
          <h3>{{ operation === 'INSPECTION' ? '质检' : '打标' }}</h3>
          <ol><li v-for="engine in wizardDetail.enginePlan.engines.filter(engine => engine.operation === operation)" :key="engine.instanceId">
            {{ engine.type }} · {{ frozenTargetName(engine.configuration.targetId) }} · {{ engine.configuration.rule.name }} · V{{ engine.configuration.rule.versionNo }}
            <span v-if="engine.configuration.agentSnapshot"> · {{ engine.configuration.agentSnapshot.name }} · V{{ engine.configuration.agentSnapshot.versionNo }}</span>
          </li></ol>
        </section>
        <a-divider orientation="left">结果处理</a-divider>
        <template v-if="wizardDetail.resultProcessing.configuration.inspection">
          <p>{{ wizardDetail.resultProcessing.configuration.inspection.scoring.mode === 'DEDUCTION' ? '扣分制' : '得分制（加权百分制）' }} · 基础分 {{ wizardDetail.resultProcessing.configuration.inspection.scoring.baseScore }} · 及格线 {{ wizardDetail.resultProcessing.configuration.inspection.scoring.passingScore }}</p>
          <p v-for="item in wizardDetail.resultProcessing.configuration.inspection.scoring.items" :key="item.itemCode">{{ item.itemCode }}：{{ item.points }} 分{{ item.veto ? '，不通过时总分为零' : '' }}</p>
        </template>
        <p v-for="label in wizardDetail.resultProcessing.configuration.labeling" :key="label.targetId">{{ frozenTargetName(label.targetId) }} · {{ label.valueCode }} · {{ label.valueType }}</p>
        <p>所有已配置来源一致时确定；否则保留冲突、未知或错误。原始结果和证据不覆盖。</p>
      </template>
      <template v-else>
      <a-divider orientation="left">创建时执行策略与 Agent 配置</a-divider
      ><a-alert type="info" show-icon message="以下内容来自任务创建时的不可变快照，后续修改 Agent 不会影响这里。" class="snapshot-tip"/>
      <a-descriptions bordered :column="1">
        <a-descriptions-item label="Agent">{{ detailAgent?.name || "—" }}<span v-if="detailAgent?.code"> · {{ detailAgent.code }}</span></a-descriptions-item>
        <a-descriptions-item label="Agent 版本">{{ detailAgent?.versionNo ? `V${detailAgent.versionNo}` : "—" }}</a-descriptions-item>
        <a-descriptions-item label="任务执行策略"><a-tag color="blue">{{ modeLabel(detailRuleSet?.executionStrategy?.mode || detailAgentConfig?.mode) }}</a-tag></a-descriptions-item>
        <a-descriptions-item v-if="detailAgent?.description" label="用途说明">{{ detailAgent.description }}</a-descriptions-item>
        <a-descriptions-item v-if="detailAgentConfig?.assetSnapshots?.primaryModel" label="主模型">
          {{ detailAgentConfig.assetSnapshots.primaryModel.name }} · {{ detailAgentConfig.assetSnapshots.primaryModel.provider }} / {{ detailAgentConfig.assetSnapshots.primaryModel.modelName }} · V{{ detailAgentConfig.assetSnapshots.primaryModel.versionNo || "—" }}
        </a-descriptions-item>
        <a-descriptions-item v-if="detailAgentConfig?.assetSnapshots?.fallbackModels?.length" label="备用模型">{{ assetNames(detailAgentConfig.assetSnapshots.fallbackModels) }}</a-descriptions-item>
        <a-descriptions-item v-if="detailAgentConfig?.assetSnapshots?.mcpServers?.length" label="MCP">{{ assetNames(detailAgentConfig.assetSnapshots.mcpServers) }}</a-descriptions-item>
        <a-descriptions-item v-if="detailAgentConfig?.assetSnapshots?.skills?.length" label="Skill">{{ assetNames(detailAgentConfig.assetSnapshots.skills) }}</a-descriptions-item>
        <a-descriptions-item v-if="detailAgentConfig?.systemPrompt" label="系统提示词"><pre class="snapshot-text">{{ detailAgentConfig.systemPrompt }}</pre></a-descriptions-item>
      </a-descriptions>
      <a-divider orientation="left">创建时规则配置</a-divider>
      <a-descriptions v-if="detailRuleSet?.ruleSetId" bordered :column="1" class="rule-set-summary">
        <a-descriptions-item label="规则集">
          {{ detailRuleSet.ruleSetName || currentDetailRuleSet?.name || "—" }}
          <span v-if="detailRuleSet.ruleSetCode || currentDetailRuleSet?.code"> · {{ detailRuleSet.ruleSetCode || currentDetailRuleSet?.code }}</span>
        </a-descriptions-item>
        <a-descriptions-item label="规则集 ID">{{ detailRuleSet.ruleSetId || detail.ruleSetId || "—" }}</a-descriptions-item>
        <a-descriptions-item label="规则集版本">{{ detailRuleSet.ruleSetVersion ? `V${detailRuleSet.ruleSetVersion}` : "—" }}</a-descriptions-item>
        <a-descriptions-item label="聚合方式">{{ detailRuleSet.aggregationMode === "ALL" ? "全部规则命中" : "任一规则命中" }}</a-descriptions-item>
      </a-descriptions>
      <a-empty v-if="!detailRules.length" description="该历史任务没有可展示的规则快照"/>
      <a-collapse v-else class="snapshot-rule-list">
        <a-collapse-panel v-for="item in detailRules" :key="item.id">
          <template #header>
            <div class="snapshot-rule-header">
              <strong>{{ item.name || "未命名规则" }}</strong>
              <span>{{ item.code || "—" }} · V{{ item.versionNo || "—" }}</span>
              <a-tag>{{ item.ruleType || "—" }}</a-tag>
              <a-tag v-if="item.riskLevel" color="orange">{{ item.riskLevel }}</a-tag>
            </div>
          </template>
          <template #extra>
            <a-button v-if="item.id" type="link" size="small" @click.stop="openSnapshotRule(item)">查看规则 ↗</a-button>
          </template>
          <a-space wrap>
            <a-tag v-if="item.category">{{ item.category }}</a-tag>
            <a-tag v-if="item.targetRole">对象：{{ item.targetRole }}</a-tag>
            <a-tag v-if="item.deduction !== undefined">扣分：{{ item.deduction }}</a-tag>
            <a-tag v-if="item.veto" color="red">一票否决</a-tag>
          </a-space>
          <p v-if="item.description" class="rule-description">{{ item.description }}</p>
          <pre v-if="item.expression" class="snapshot-text snapshot-expression">{{ item.expression }}</pre>
          <a-empty v-else description="该规则快照没有配置内容" :image-style="{ height: '36px' }" />
        </a-collapse-panel>
      </a-collapse>
      </template>
      </template
    ></a-drawer
  >
  <a-drawer
    v-model:open="resultOpen"
    title="批次质检结果"
    width="min(900px, calc(100vw - 24px))"
    ><a-spin :spinning="resultLoading"
      ><template v-if="batchResult"
        ><a-tabs v-model:activeKey="resultTab"><a-tab-pane key="inspection" tab="质检结论"><a-row :gutter="12" style="margin-bottom: 16px"
          ><a-col :span="6"
            ><a-statistic
              title="会话数"
              :value="batchResult.conversationCount" /></a-col
          ><a-col :span="6"
            ><a-statistic
              v-if="batchResult.averageScore != null"
              title="平均分"
              :precision="2"
              :value="batchResult.averageScore" /><span v-else>平均分：待确认或不计分</span></a-col
          ><a-col :span="6"
            ><a-statistic title="命中数" :value="batchResult.hitCount" /></a-col
          ><a-col :span="6"
            ><a-statistic
              title="高风险"
              :value="batchResult.highRiskCount" /></a-col></a-row
        ><a-table
          :data-source="batchResult.conversations"
          row-key="conversationId"
          :pagination="false"
          ><a-table-column
            title="会话"
            data-index="sourceFileName"
          /><a-table-column title="消息/结果" :width="120"
            ><template #default="{ record }"
              >{{ record.messageCount }} / {{ record.resultCount }}</template
            ></a-table-column
          ><a-table-column
            title="平均分"
            data-index="averageScore"
            :width="90"
          /><a-table-column
            title="命中"
            data-index="hitCount"
            :width="70"
          /><a-table-column
            title="高风险"
            data-index="highRiskCount"
            :width="80"
          /><a-table-column title="标签摘要" :width="210"
            ><template #default="{ record }"
              ><a-button v-if="conversationLabelCounts.get(record.conversationId)" type="link" @click="showConversationLabels(record.conversationId)"
                >{{ conversationLabelCounts.get(record.conversationId)?.KNOWN || 0 }} 确定 · {{ conversationLabelCounts.get(record.conversationId)?.UNKNOWN || 0 }} 未知 · {{ conversationLabelCounts.get(record.conversationId)?.CONFLICT || 0 }} 冲突 · {{ conversationLabelCounts.get(record.conversationId)?.ERROR || 0 }} 错误<span v-if="conversationLabelCounts.get(record.conversationId)?.HIT"> · {{ conversationLabelCounts.get(record.conversationId)?.HIT }} 兼容命中</span></a-button
              ><span v-else>未返回标签值</span
            ></template
          ></a-table-column><a-table-column title="操作" :width="90"
            ><template #default="{ record }"
              ><a-button
                type="link"
                @click="showConversationResult(record.conversationId)"
                >查看明细</a-button
              ></template
            ></a-table-column
          ></a-table></a-tab-pane><a-tab-pane key="labels" tab="洞察标签"
        ><a-alert type="info" show-icon message="标签独立于评分。确定结果包括明确否认（否）；未知不等于否，冲突或错误不代表已确定。确定结果率以已生成质检结果的会话为分母，兼容任务沿用命中口径。" style="margin-bottom:12px"/>
        <a-row v-if="labelInsights" :gutter="12" style="margin-bottom:12px"><a-col :span="8"><a-statistic title="机器确定会话" :value="labelInsights.detectedConversationCount"/></a-col><a-col :span="8"><a-statistic title="机器确定结果率" :value="Number(labelInsights.detectionRate)*100" suffix="%" :precision="2"/></a-col><a-col :span="8"><a-button v-if="can('iqc:result:export')" @click="exportLabels">导出 XLSX</a-button></a-col></a-row>
        <p v-if="labelInsights?.reviewed">人工有效口径：确定结果会话 {{ labelInsights.reviewed.detectedConversationCount }} / 已生成结果会话 {{ labelInsights.conversationCount }}（{{ (Number(labelInsights.reviewed.detectionRate)*100).toFixed(2) }}%）；已人工修订 {{ labelInsights.reviewed.correctedValueCount }} 条，待复核 {{ labelInsights.reviewed.pendingReviewCount }} 条。未修订的值沿用机器结果，评分不受影响。</p>
        <p v-if="labelRows.length">已返回标签值记录：<a-tag v-for="item in labelStateCounts" :key="item.state">{{ item.name }} {{ item.count }}</a-tag></p>
        <p v-if="selectedLabelConversationId">当前仅显示会话 {{ selectedLabelConversationId }} 的标签值。<a-button type="link" @click="selectedLabelConversationId = undefined">查看全部会话</a-button></p>
        <p v-if="labelInsights?.coverageValueCount">新版标签值状态率（已生成 {{ labelInsights.coverageValueCount }} 条为分母；不含兼容命中与未产出的值）：
          未知 {{ ((labelInsights.coverageStatusCounts?.UNKNOWN || 0) / labelInsights.coverageValueCount * 100).toFixed(1) }}% ·
          冲突 {{ ((labelInsights.coverageStatusCounts?.CONFLICT || 0) / labelInsights.coverageValueCount * 100).toFixed(1) }}% ·
          识别失败 {{ ((labelInsights.coverageStatusCounts?.ERROR || 0) / labelInsights.coverageValueCount * 100).toFixed(1) }}%
        </p>
        <p v-if="labelInsights?.reviewed?.coverageValueCount">人工有效口径下的新版标签值状态率（已生成 {{ labelInsights.reviewed.coverageValueCount }} 条为分母；未修订沿用机器值）：
          未知 {{ ((labelInsights.reviewed.coverageStatusCounts?.UNKNOWN || 0) / labelInsights.reviewed.coverageValueCount * 100).toFixed(1) }}% ·
          冲突 {{ ((labelInsights.reviewed.coverageStatusCounts?.CONFLICT || 0) / labelInsights.reviewed.coverageValueCount * 100).toFixed(1) }}% ·
          识别失败 {{ ((labelInsights.reviewed.coverageStatusCounts?.ERROR || 0) / labelInsights.reviewed.coverageValueCount * 100).toFixed(1) }}%
        </p>
        <a-table v-if="visibleLabelRows.length" :data-source="visibleLabelRows" row-key="id" :pagination="false" size="small" :scroll="{x:1000}">
          <a-table-column title="会话 ID" data-index="conversationId" :ellipsis="true"/>
          <a-table-column title="标签" :width="220"><template #default="{record}">{{ record.labelName }} <a-tag>V{{ record.labelVersionNo }}</a-tag></template></a-table-column>
          <a-table-column title="机器状态" :width="120"><template #default="{record}"><a-tag :color="record.presentation.color">{{ record.presentation.title }}</a-tag></template></a-table-column>
          <a-table-column title="机器识别值" :width="160"><template #default="{record}"><div>{{ record.presentation.value }}</div><small v-if="record.valueCode">值编码：{{ record.valueCode }}</small></template></a-table-column>
          <a-table-column title="人工有效值" :width="190"><template #default="{record}">{{ presentEffectiveLabel(record) }}</template></a-table-column>
          <a-table-column title="候选与依据" :width="320"><template #default="{record}">
            <div v-for="(reason, index) in record.presentation.reasons" :key="index">{{ reason }}</div>
            <details v-if="record.presentation.candidates.length"><summary>查看 {{ record.presentation.candidates.length }} 个候选及证据</summary>
              <p>识别主体：{{ record.presentation.subject }}</p>
              <div v-for="(candidate, index) in record.presentation.candidates" :key="index" style="margin-bottom:12px">
                <div>候选 {{ index + 1 }}：{{ candidate.value }}</div>
                <div v-for="(quote, quoteIndex) in candidate.evidence" :key="quoteIndex" style="white-space:pre-wrap;overflow-wrap:anywhere">
                  “{{ quote.text }}”<a-button type="link" @click="showConversationResult(record.conversationId, JSON.stringify([{messageId:quote.messageId}]))">定位原文</a-button>
                </div>
                <small style="overflow-wrap:anywhere">来源结果：{{ candidate.source }}</small>
              </div>
            </details>
          </template></a-table-column>
          <a-table-column title="来源" data-index="generationSource" :width="90"/>
          <a-table-column title="置信度" :width="90"><template #default="{record}">{{ record.confidence ?? '—' }}</template></a-table-column>
          <a-table-column title="会话" :width="90"><template #default="{record}"><a-button type="link" @click="showConversationResult(record.conversationId, record.evidenceJson)">查看会话</a-button></template></a-table-column>
          <a-table-column title="人工复核" :width="90"><template #default="{record}"><a-button v-if="can('iqc:review:view') && record.presentation.valid && record.presentation.state !== 'HIT'" type="link" @click="selectedLabelReview = record">查看/复核</a-button><span v-else>—</span></template></a-table-column>
        </a-table>
        <a-empty v-else :description="selectedLabelConversationId ? '该会话未返回标签值' : '该任务没有生成标签结果'" :image-style="{height:'40px'}"/></a-tab-pane></a-tabs
        ></template
      ></a-spin
    ></a-drawer
  >
  <a-modal :open="!!selectedLabelReview" title="标签值人工复核" :footer="null" width="min(780px, calc(100vw - 24px))" @cancel="selectedLabelReview = undefined">
    <LabelValueReviewPanel v-if="selectedLabelReview && batchResult" :label="selectedLabelReview" :task-id="batchResult.taskId" :task-status="batchResult.status"
      @locate="id => showConversationResult(selectedLabelReview!.conversationId, JSON.stringify([{messageId:id}]))" @changed="refreshReviewedLabels" />
  </a-modal>
  <a-drawer
    v-model:open="conversationResultOpen"
    :title="`会话质检明细：${
      conversationResult?.conversation.sourceFileName || ''
    }`"
    width="min(820px, calc(100vw - 24px))"
    ><a-spin :spinning="resultLoading"
      ><a-timeline v-if="conversationResult"
        ><a-timeline-item
          v-for="item in conversationResult.messages"
          :key="item.id"
          :color="resultFor(item.id)?.resultStatus === 'HIT' ? 'red' : 'green'"
            ><a-card :id="`evidence-message-${item.id}`" size="small"
            ><template #title
              >#{{ item.sequenceNo }} · {{ item.speakerRole }} ·
              {{ item.relativeTime }}</template
            >
            <p>{{ item.content }}</p>
            <template v-if="resultFor(item.id)"
              ><a-space wrap
                ><a-tag>{{ resultFor(item.id)?.resultStatus }}</a-tag
                ><a-tag v-if="resultFor(item.id)?.score != null" color="blue">{{ resultFor(item.id)?.score }}分</a-tag
                ><a-tag v-else>检测证据，不单独计分</a-tag
                ><a-tag v-if="resultFor(item.id)?.riskLevel" color="orange">{{
                  resultFor(item.id)?.riskLevel
                }}</a-tag></a-space
              >
              <p style="margin-top: 8px">{{ resultFor(item.id)?.reason }}</p>
              <div
                v-for="(mark, index) in annotations(resultFor(item.id))"
                :key="index"
              >
                <a-alert
                  type="warning"
                  show-icon
                  :message="`标注：${mark.text || '命中片段'}`"
                  :description="`位置 ${mark.start ?? '-'} ~ ${
                    mark.end ?? '-'
                  }`"
                /></div></template></a-card></a-timeline-item></a-timeline></a-spin
  ></a-drawer>
</template>

<style scoped>
.task-filter-card {
  margin-bottom: 16px;
}
.snapshot-tip,
.rule-set-summary {
  margin-bottom: 16px;
}
.snapshot-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}
.snapshot-rule-list {
  margin-bottom: 16px;
}
.snapshot-rule-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.snapshot-rule-header span {
  color: var(--iqc-slate-600);
}
.snapshot-expression {
  max-height: 360px;
  margin-top: 12px;
  padding: 12px;
  overflow: auto;
  border-radius: 6px;
  background: var(--iqc-canvas);
}
.rule-description {
  margin: 8px 0 0;
}
</style>
