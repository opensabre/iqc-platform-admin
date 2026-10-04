<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import { useRouter } from "vue-router";
import {
  cancelTask,
  createTask,
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
  listConversations,
  type ConversationSummary,
} from "@/api/conversations";
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
  listLabelCollections,
  type LabelCollection,
  type LabelTree,
} from "@/api/labels";
import LabelTreeSelector from "@/components/LabelTreeSelector.vue";
import LabelValueReviewPanel from "@/components/LabelValueReviewPanel.vue";
import { countConversationLabelStates, presentEffectiveLabel, presentLabel } from "./label-results";

const tasks = ref<InspectionTask[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const modalOpen = ref(false);
const creating = ref(false);
const currentStep = ref(0);
const router = useRouter();
const createSteps = [
  { title: "任务信息", description: "名称与执行方式" },
  { title: "数据范围", description: "会话或筛选条件" },
  { title: "质检方案", description: "Agent 与规则" },
  { title: "执行与确认", description: "并发及配置预览" },
];
const agents = ref<QualityAgent[]>([]);
const rules = ref<QualityRule[]>([]);
const ruleSets = ref<QualityRuleSet[]>([]);
const conversations = ref<ConversationSummary[]>([]);
const labelTree = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const labelCollections = ref<LabelCollection[]>([]);
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
const form = ref({
  name: "",
  taskType: "BATCH" as "BATCH" | "SCHEDULED" | "SAMPLE",
  conversationIds: [] as string[],
  scheduledTime: "",
  createdRange: [] as string[],
  fileName: "",
  status: "IMPORTED",
  ownerGroupId: "",
  employeeId: "",
  customerExternalId: "",
  channel: "",
  businessNo: "",
  limit: 1000,
  sampleSize: 100,
  sampleSeed: "",
  agentId: "",
  executionMode: "RULE_ONLY" as ExecutionMode,
  ruleSetId: "",
  ruleIds: [] as string[],
  schemeMode: "RULE" as "RULE" | "LABEL",
  categoryIds: [] as string[],
  groupIds: [] as string[],
  labelIds: [] as string[],
  collectionIds: [] as string[],
  runCount: 1,
  confidenceThreshold: 0.8,
  autoExpandEnabled: false,
  autoExpandPrompt: "",
  concurrencyLimit: 4,
});
const selectedAgent = computed(() =>
  agents.value.find((item) => item.id === form.value.agentId)
);
const selectedRules = computed(() =>
  rules.value.filter((item) => form.value.ruleIds.includes(item.id))
);
const selectedRuleSet = computed(() =>
  ruleSets.value.find((item) => item.id === form.value.ruleSetId)
);
const labelSelectionKeys = computed({
  get: () => [
    ...form.value.categoryIds.map((id) => `CATEGORY:${id}`),
    ...form.value.groupIds.map((id) => `GROUP:${id}`),
    ...form.value.labelIds.map((id) => `LABEL:${id}`),
  ],
  set: (keys: string[]) => {
    form.value.categoryIds = keys.filter((key) => key.startsWith("CATEGORY:")).map((key) => key.substring(9));
    form.value.groupIds = keys.filter((key) => key.startsWith("GROUP:")).map((key) => key.substring(6));
    form.value.labelIds = keys.filter((key) => key.startsWith("LABEL:")).map((key) => key.substring(6));
  },
});
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
    const [taskPage, agentList, ruleList, ruleSetList, conversationPage, taxonomy, collections] =
      await Promise.all([
        listTasks({ current: page.value, size: pageSize.value, ...filters.value }),
        listAgents().catch(() => {
          message.warning("智能体列表不可用，仍可创建纯规则任务");
          return [] as QualityAgent[];
        }),
        listRules(),
        listRuleSets(),
        listConversations({ current: 1, size: 100 }),
        getLabelTree(),
        listLabelCollections(),
      ]);
    tasks.value = taskPage.records;
    total.value = taskPage.total;
    agents.value = agentList.filter((item) => item.status === "PUBLISHED");
    rules.value = ruleList.filter((item) => item.status === "PUBLISHED");
    ruleSets.value = ruleSetList.filter((item) => item.status === "PUBLISHED");
    conversations.value = conversationPage.records.filter(
      (item) => item.status === "IMPORTED"
    );
    labelTree.value = taxonomy;
    labelCollections.value = collections.filter((item) => item.status === "PUBLISHED");
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
function openCreate() {
  const recent = localStorage.getItem("iqc-last-conversation-id");
  form.value = {
    name: "",
    taskType: "BATCH",
    conversationIds:
      recent && conversations.value.some((item) => item.id === recent)
        ? [recent]
        : [],
    scheduledTime: "",
    createdRange: [],
    fileName: "",
    status: "IMPORTED",
    ownerGroupId: "",
    employeeId: "",
    customerExternalId: "",
    channel: "",
    businessNo: "",
    limit: 1000,
    sampleSize: 100,
    sampleSeed: "",
    agentId: agents.value[0]?.id || "",
    executionMode: "RULE_ONLY",
    ruleSetId: ruleSets.value[0]?.id || "",
    ruleIds: [],
    schemeMode: "RULE",
    categoryIds: [],
    groupIds: [],
    labelIds: [],
    collectionIds: [],
    runCount: 1,
    confidenceThreshold: 0.8,
    autoExpandEnabled: false,
    autoExpandPrompt: "",
    concurrencyLimit: 4,
  };
  currentStep.value = 0;
  modalOpen.value = true;
}
function validateStep(step: number) {
  if (
    step === 1 &&
    form.value.taskType === "BATCH" &&
    !form.value.conversationIds.length
  ) {
    message.warning("请至少选择一个会话");
    return false;
  }
  if (
    step === 1 &&
    form.value.taskType === "SCHEDULED" &&
    !form.value.scheduledTime
  ) {
    message.warning("请选择计划执行时间");
    return false;
  }
  if (step === 2 && form.value.executionMode !== "RULE_ONLY" && !form.value.agentId) {
    message.warning("请选择已发布 Agent");
    return false;
  }
  if (step === 2 && form.value.schemeMode === "RULE" && !form.value.ruleSetId && !form.value.ruleIds.length) {
    message.warning("请选择已发布规则集或至少一条规则");
    return false;
  }
  if (step === 2 && form.value.schemeMode === "RULE") {
    const ids = parseSnapshot<string[]>(selectedRuleSet.value?.ruleIdsJson) || form.value.ruleIds;
    const selected = rules.value.filter(rule => ids.includes(rule.id));
    if (form.value.executionMode === "RULE_ONLY" && selected.some(rule => rule.ruleType === "LLM")) {
      message.warning("所选规则包含 LLM 检测，请选择逐项独立执行或调整规则");
      return false;
    }
    if (form.value.executionMode === "AGENT_LLM" && selected.some(rule => rule.ruleType !== "LLM")) {
      message.warning("纯 LLM 策略不能跳过普通规则，请选择逐项独立执行或调整规则");
      return false;
    }
  }
  if (step === 2 && form.value.schemeMode === "LABEL" && !form.value.categoryIds.length && !form.value.groupIds.length && !form.value.labelIds.length && !form.value.collectionIds.length) {
    message.warning("请至少选择一个标签分类、标签组、标签或标签集合");
    return false;
  }
  return true;
}
function nextStep() {
  if (validateStep(currentStep.value)) currentStep.value += 1;
}
function openRelated(path: string) {
  window.open(router.resolve(path).href, "_blank", "noopener,noreferrer");
}
function openSnapshotRule(rule: TaskRuleSnapshot) {
  if (!rule.id) return;
  const path = rule.ruleType === "DLS" ? "/rules/conversation" : "/rules/library";
  openRelated(`${path}?ruleId=${encodeURIComponent(rule.id)}`);
}
async function submit() {
  if (![1, 2].every(validateStep)) return;
  creating.value = true;
  try {
    await createTask({
      name: form.value.name || undefined,
      taskType: form.value.taskType,
      conversationIds:
        form.value.taskType === "BATCH"
          ? form.value.conversationIds
          : undefined,
      scheduledTime:
        form.value.taskType === "SCHEDULED"
          ? form.value.scheduledTime
          : undefined,
      sampleSize: form.value.taskType === "SAMPLE" ? form.value.sampleSize : undefined,
      sampleSeed: form.value.taskType === "SAMPLE" ? form.value.sampleSeed || undefined : undefined,
      selectionFilter:
        form.value.taskType !== "BATCH"
          ? {
              createdFrom: form.value.createdRange?.[0],
              createdTo: form.value.createdRange?.[1],
              fileName: form.value.fileName || undefined,
              status: form.value.status || undefined,
              ownerGroupId: form.value.ownerGroupId || undefined,
              employeeId: form.value.employeeId || undefined,
              customerExternalId: form.value.customerExternalId || undefined,
              channel: form.value.channel || undefined,
              businessNo: form.value.businessNo || undefined,
              limit: form.value.limit,
            }
          : undefined,
      agentId: form.value.executionMode === "RULE_ONLY" ? undefined : form.value.agentId,
      executionMode: form.value.executionMode,
      ruleSetId: form.value.schemeMode === "RULE" ? form.value.ruleSetId || undefined : undefined,
      ruleIds: form.value.schemeMode === "RULE" ? (form.value.ruleSetId ? undefined : form.value.ruleIds) : undefined,
      labelSelection: form.value.schemeMode === "LABEL" ? {
        categoryIds: form.value.categoryIds,
        groupIds: form.value.groupIds,
        labelIds: form.value.labelIds,
        collectionIds: form.value.collectionIds,
      } : undefined,
      labelOptions: form.value.schemeMode === "LABEL" ? {
        runCount: form.value.runCount,
        confidenceThreshold: form.value.confidenceThreshold,
        autoExpandEnabled: form.value.autoExpandEnabled,
        autoExpandPrompt: form.value.autoExpandEnabled ? form.value.autoExpandPrompt || undefined : undefined,
      } : undefined,
      concurrencyLimit: form.value.concurrencyLimit,
    });
    message.success(
      form.value.taskType === "SCHEDULED" ? "定时质检任务已创建"
        : form.value.taskType === "SAMPLE" ? "抽样质检任务已创建" : "批量质检任务已创建"
    );
    modalOpen.value = false;
    await refresh();
  } catch (error) {
    message.error(error instanceof Error ? error.message : "任务创建失败，请检查会话、执行策略和规则");
  } finally {
    creating.value = false;
  }
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
      <h2>质检任务</h2>
      <p>使用业务模板创建质检任务，跟踪执行进度、评分和证据；专家仍可使用自定义任务。</p>
    </div>
    <a-space><router-link v-if="can('iqc:template:view')" to="/templates"><a-button type="primary">使用业务模板</a-button></router-link>
      <a-button v-if="can('iqc:task:create')" @click="openCreate">自定义任务（高级）</a-button></a-space>
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
      <a-table-column key="taskType" title="任务类型" :width="110"><template #default="{ record }">{{ taskTypeLabel(record.taskType) }}</template></a-table-column>
      <a-table-column key="conversations" title="会话数" :width="90"
        ><template #default="{ record }">{{
          conversationCount(record)
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
  <a-modal
    v-model:open="modalOpen"
    title="新建质检任务"
    width="min(860px, calc(100vw - 32px))"
    :styles="{
      body: {
        maxHeight: 'calc(100vh - 190px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      },
    }"
  >
    <a-steps
      :current="currentStep"
      :items="createSteps"
      size="small"
      class="task-wizard-steps"
    />
    <div class="task-wizard-body">
      <a-form v-show="currentStep === 0" layout="vertical">
        <a-alert
          type="info"
          show-icon
          message="选择立即处理指定会话，或按条件在计划时间自动选取会话。"
          style="margin-bottom: 16px"
        />
        <a-form-item label="任务类型"
          ><a-radio-group v-model:value="form.taskType"
            ><a-radio-button value="BATCH">立即批量</a-radio-button
            ><a-radio-button value="SAMPLE">随机抽样</a-radio-button
            ><a-radio-button value="SCHEDULED"
              >定时筛选</a-radio-button
            ></a-radio-group
          ></a-form-item
        >
        <a-form-item label="任务名称"
          ><a-input v-model:value="form.name" placeholder="不填则自动生成名称"
        /></a-form-item>
      </a-form>

      <a-form v-show="currentStep === 1" layout="vertical">
        <div class="wizard-heading">
          <div>
            <h3>选择质检数据</h3>
            <p>
              {{
                form.taskType === "BATCH"
                  ? "选择本次要立即质检的已导入会话。"
                  : "设置执行时间和会话筛选范围。"
              }}
            </p>
          </div>
          <a-button type="link" @click="openRelated('/conversations')"
            >管理会话 ↗</a-button
          >
        </div>
        <template v-if="form.taskType === 'BATCH'">
          <a-empty v-if="!conversations.length" description="暂无已导入会话"
            ><a-button type="primary" @click="openRelated('/conversations')"
              >去导入会话</a-button
            ></a-empty
          >
          <a-form-item v-else label="会话数据" required
            ><a-select
              v-model:value="form.conversationIds"
              mode="multiple"
              show-search
              option-filter-prop="label"
              placeholder="选择一个或多个已导入会话"
              ><a-select-option
                v-for="item in conversations"
                :key="item.id"
                :value="item.id"
                :label="item.sourceFileName"
                >{{ item.sourceFileName }} ·
                {{ item.messageCount }}条消息</a-select-option
              ></a-select
            ></a-form-item
          >
        </template>
        <a-row v-else-if="form.taskType === 'SAMPLE'" :gutter="16">
          <a-col :span="12"><a-form-item label="抽样数量" required><a-input-number v-model:value="form.sampleSize" :min="1" :max="1000" style="width:100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="抽样种子"><a-input v-model:value="form.sampleSeed" placeholder="相同种子可复现相同样本" /></a-form-item></a-col>
          <a-col :span="24"><a-alert type="info" show-icon message="从当前可见、已导入会话中稳定随机抽样；创建后会固化会话 ID 和种子。" /></a-col>
        </a-row>
        <template v-else
          ><a-form-item label="计划执行时间" required
            ><a-date-picker
              v-model:value="form.scheduledTime"
              show-time
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 100%" /></a-form-item
          ><a-form-item label="会话创建时间"
            ><a-range-picker
              v-model:value="form.createdRange"
              show-time
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 100%" /></a-form-item
          ><a-form-item label="来源文件名包含"
            ><a-input v-model:value="form.fileName" allow-clear /></a-form-item
          ><a-row :gutter="12"><a-col :span="12"><a-form-item label="沟通员工 ID"><a-input v-model:value="form.employeeId" allow-clear /></a-form-item></a-col><a-col :span="12"><a-form-item label="客户外部 ID"><a-input v-model:value="form.customerExternalId" allow-clear /></a-form-item></a-col></a-row
          ><a-row :gutter="12"><a-col :span="12"><a-form-item label="渠道"><a-input v-model:value="form.channel" allow-clear placeholder="WEB / PHONE / WECHAT" /></a-form-item></a-col><a-col :span="12"><a-form-item label="业务编号"><a-input v-model:value="form.businessNo" allow-clear /></a-form-item></a-col></a-row
          ><a-row :gutter="12"
            ><a-col :span="12"
              ><a-form-item label="会话状态"
                ><a-select v-model:value="form.status"
                  ><a-select-option value="IMPORTED">已导入</a-select-option
                  ><a-select-option value="PARTIAL"
                    >部分导入</a-select-option
                  ></a-select
                ></a-form-item
              ></a-col
            ><a-col :span="12"
              ><a-form-item label="最多选取"
                ><a-input-number
                  v-model:value="form.limit"
                  :min="1"
                  :max="1000"
                  style="width: 100%" /></a-form-item></a-col></a-row
          ><a-form-item label="归属部门 ID"
            ><a-input
              v-model:value="form.ownerGroupId"
              allow-clear
              placeholder="留空则按当前数据权限范围" /></a-form-item
        ></template>
      </a-form>

      <a-form v-show="currentStep === 2" layout="vertical">
        <div class="wizard-heading">
          <div>
            <h3>配置质检方案</h3>
            <p>规则与执行策略在任务创建时冻结；纯规则任务无需 Agent。</p>
          </div>
        </div>
        <a-form-item label="方案入口">
          <a-radio-group v-model:value="form.schemeMode">
            <a-radio-button value="RULE">按规则质检</a-radio-button>
            <a-radio-button value="LABEL">按业务标签质检</a-radio-button>
          </a-radio-group>
          <template #extra>标签会在任务创建时解析为固定的标签、绑定规则及版本快照。</template>
        </a-form-item>
        <a-form-item label="任务执行策略" required>
          <a-select v-model:value="form.executionMode">
            <a-select-option value="RULE_ONLY">仅普通规则（无需 Agent）</a-select-option>
            <a-select-option value="INDEPENDENT">逐项独立执行（规则与 LLM）</a-select-option>
            <a-select-option value="AGENT_LLM">仅 LLM 规则</a-select-option>
            <a-select-option value="RULE_THEN_LLM">规则初筛 → LLM 复核（专项兼容）</a-select-option>
            <a-select-option value="LLM_THEN_RULE">LLM 候选 → 规则验证（专项兼容）</a-select-option>
          </a-select>
          <template #extra>综合检查请选择逐项独立执行；初筛路线可能跳过未命中候选的检查，不适合独立画像识别。</template>
        </a-form-item>
        <a-form-item v-if="form.executionMode !== 'RULE_ONLY'" label="LLM 智能体" required
          ><a-select v-model:value="form.agentId" placeholder="选择已发布 Agent"
            ><a-select-option
              v-for="agent in agents"
              :key="agent.id"
              :value="agent.id"
              >{{ agent.name }} · {{ agent.code }}</a-select-option
            ></a-select
          ><a-button
            type="link"
            class="related-link"
            @click="openRelated('/agents')"
            >管理 Agent ↗</a-button
          ></a-form-item
        >
        <a-alert
          v-if="form.executionMode !== 'RULE_ONLY' && !agents.length"
          type="warning"
          show-icon
          message="暂无已发布 Agent，请先创建并完成审批发布。"
          style="margin-bottom: 16px"
        />
        <template v-if="form.schemeMode === 'RULE'">
        <a-form-item label="已发布规则集"
          ><a-select
            v-model:value="form.ruleSetId"
            allow-clear
            placeholder="优先选择专业规则集"
            ><a-select-option
              v-for="set in ruleSets"
              :key="set.id"
              :value="set.id"
              >{{ set.name }} · v{{ set.versionNo }}</a-select-option
            ></a-select
          ><a-button
            type="link"
            class="related-link"
            @click="openRelated('/rules/sets')"
            >管理规则集 ↗</a-button
          ></a-form-item
        ><a-form-item label="临时规则组合" :required="!form.ruleSetId"
          ><a-select
            v-model:value="form.ruleIds"
            mode="multiple"
            :disabled="Boolean(form.ruleSetId)"
            placeholder="未选规则集时可临时多选规则"
            ><a-select-option
              v-for="rule in rules"
              :key="rule.id"
              :value="rule.id"
              >{{ rule.name }}</a-select-option
            ></a-select
          ></a-form-item
        >
        <a-alert
          v-if="!rules.length"
          type="warning"
          show-icon
          message="暂无已发布规则，请先创建并发布规则。"
        />
        </template>
        <template v-else>
          <a-alert type="info" show-icon message="标签是任务的业务目标；系统仍复用标签绑定的已发布规则执行检测，并额外沉淀标签命中结果。" style="margin-bottom:16px"/>
          <a-form-item label="标签集合">
            <a-select v-model:value="form.collectionIds" mode="multiple" allow-clear placeholder="选择已发布标签集合">
              <a-select-option v-for="item in labelCollections" :key="item.id" :value="item.id">{{ item.name }} · V{{ item.versionNo }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="标签范围"><LabelTreeSelector v-model="labelSelectionKeys" :taxonomy="labelTree" /><a-button type="link" class="related-link" @click="openRelated('/labels/tree')">管理标签 ↗</a-button></a-form-item>
        </template>
      </a-form>

      <a-form v-show="currentStep === 3" layout="vertical">
        <div class="wizard-heading">
          <div>
            <h3>执行参数与确认</h3>
            <p>确认数据范围和质检方案后创建任务。</p>
          </div>
        </div>
        <a-form-item label="并发数"
          ><a-input-number
            v-model:value="form.concurrencyLimit"
            :min="1"
            :max="32"
          /><template #extra
            >限制同时处理的会话数，同一会话内消息仍按顺序执行。</template
          ></a-form-item
        >
        <template v-if="form.schemeMode === 'LABEL'">
          <a-row :gutter="12">
            <a-col :span="12"><a-form-item label="重复运行次数"><a-input-number v-model:value="form.runCount" :min="1" :max="5" style="width:100%"/></a-form-item></a-col>
            <a-col :span="12"><a-form-item label="置信度阈值"><a-input-number v-model:value="form.confidenceThreshold" :min="0" :max="1" :step="0.05" style="width:100%"/></a-form-item></a-col>
          </a-row>
          <a-form-item><a-checkbox v-model:checked="form.autoExpandEnabled">允许根据标签分类提示词生成候选标签</a-checkbox></a-form-item>
          <a-form-item v-if="form.autoExpandEnabled" label="本次扩展提示"><a-textarea v-model:value="form.autoExpandPrompt" :maxlength="1000" show-count/></a-form-item>
        </template>
        <a-card size="small" title="任务摘要" class="wizard-summary"
          ><a-descriptions :column="2" size="small"
            ><a-descriptions-item label="任务名称">{{
              form.name || "自动生成"
            }}</a-descriptions-item
            ><a-descriptions-item label="任务类型">{{
              form.taskType === "BATCH" ? "立即批量" : "定时筛选"
            }}</a-descriptions-item
            ><a-descriptions-item label="数据范围">{{
              form.taskType === "BATCH"
                ? `${form.conversationIds.length} 个会话`
                : `最多 ${form.limit} 个会话`
            }}</a-descriptions-item
            ><a-descriptions-item label="执行时间">{{
              form.taskType === "BATCH" ? "创建后手动执行" : form.scheduledTime
            }}</a-descriptions-item
            ><a-descriptions-item label="Agent">{{
              form.executionMode === 'RULE_ONLY' ? '无需 Agent' : selectedAgent?.name || "未选择"
            }}</a-descriptions-item
            ><a-descriptions-item label="规则方案">{{
              form.schemeMode === "LABEL"
                ? `标签入口（集合 ${form.collectionIds.length}、分类 ${form.categoryIds.length}、组 ${form.groupIds.length}、标签 ${form.labelIds.length}）`
                : selectedRuleSet?.name || selectedRules.map((item) => item.name).join("、") || "未选择"
            }}</a-descriptions-item
            ><a-descriptions-item label="并发数">{{
              form.concurrencyLimit
            }}</a-descriptions-item></a-descriptions
          ></a-card
        >
      </a-form>
    </div>
    <template #footer
      ><a-button @click="modalOpen = false">取消</a-button
      ><a-button v-if="currentStep > 0" @click="currentStep--">上一步</a-button
      ><a-button
        v-if="currentStep < createSteps.length - 1"
        type="primary"
        @click="nextStep"
        >下一步</a-button
      ><a-button v-else type="primary" :loading="creating" @click="submit"
        >创建任务</a-button
      ></template
    >
  </a-modal>
  <a-drawer v-model:open="detailOpen" title="质检任务详情" width="min(820px, calc(100vw - 24px))"
    ><template v-if="detail"
      ><a-divider orientation="left">任务概况</a-divider
      ><a-descriptions bordered :column="1"
        ><a-descriptions-item label="任务名称">{{
          detail.name
        }}</a-descriptions-item
        ><a-descriptions-item label="任务类型">{{ taskTypeLabel(detail.taskType) }}</a-descriptions-item
        ><a-descriptions-item label="状态"
          ><a-tag :color="statusMap[detail.status]?.color">{{
            statusMap[detail.status]?.label || detail.status
          }}</a-tag></a-descriptions-item
        ><a-descriptions-item label="会话/并发"
          >{{ conversationCount(detail) }} 个 /
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
      ><a-divider orientation="left">创建时执行策略与 Agent 配置</a-divider
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
      ></template
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
.task-wizard-steps {
  margin: 4px 0 24px;
}
.task-wizard-body {
  min-height: 350px;
  padding: 8px 4px 0;
}
.wizard-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.wizard-heading h3 {
  margin: 0 0 6px;
  color: var(--iqc-slate-900);
  font-size: 18px;
}
.wizard-heading p {
  margin: 0;
  color: var(--iqc-slate-600);
}
.related-link {
  height: auto;
  padding: 6px 0 0;
}
.wizard-summary {
  margin-top: 18px;
  background: var(--iqc-canvas);
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
