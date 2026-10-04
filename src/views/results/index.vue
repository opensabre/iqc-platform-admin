<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { message, Modal } from "ant-design-vue";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons-vue";
import { exportResults, getResultDetail, getConversationResultDetail, getResultHierarchy, getBatchResultSummary, listResults, type InspectionResult, type ResultHierarchy, type BatchResultSummary, type BusinessItemResult, type BusinessScoringResult } from "@/api/results";
import { exportSchemeResults, exportTaskBusinessReviews, exportTaskLabelResults } from "@/api/results";
import BusinessReviewPanel from "@/components/BusinessReviewPanel.vue";
import ReviewTaskSelector from "@/components/ReviewTaskSelector.vue";
import { businessConversationRow, groupResultsByTaskAndConversation, type TaskConversationResultSummary } from "./group-results";
import { listBusinessResults, type BusinessConversationResult } from "@/api/results";
import ConversationDetailDrawer from "@/components/ConversationDetailDrawer.vue";
import { dictionaryLabel, getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import { usePermission } from "@/composables/permission";
import { createFeedback, createSample, requestReview } from "@/api/quality";
import { copyToClipboard } from "@/utils/clipboard";
import { routeContextRows } from "./route-contexts";

interface RuleBreakdown { ruleId?: string; ruleName?: string; ruleCode?: string; category?: string; status: string; deduction?: number; score?: number|null; riskLevel?: string; reason?: string; veto?: boolean; ruleType?:string; evaluationScope?:string; ruleVersion?:number }
interface ResultEvidence { ruleId?: string; text?: string; start?: number; end?: number; sequenceNo?: number; internalDefinition?:string }
interface ResultSuggestion { ruleId?: string; title?: string; content?: string }

const results = ref<InspectionResult[]>([]), total = ref(0), page = ref(1), pageSize = ref(20), loading = ref(false);
const resultView = ref<"BUSINESS"|"MESSAGE">("BUSINESS");
const businessResults = ref<BusinessConversationResult[]>([]);
let resultRequest = 0;
const conversationMessages = ref<any[]>([]), conversationResults = ref<InspectionResult[]>([]);
const hierarchy = ref<ResultHierarchy>();
const routeContexts = computed(() => routeContextRows(hierarchy.value?.rules ?? [], businessItems.value));
const canonicalSummaries = ref<Record<string, BatchResultSummary>>({});
const detailOpen = ref(false), detailLoading = ref(false); const detail = ref<any>();
const copiedConversationId = ref<string>(); let copyResetTimer: number | undefined;
const highlightedSequenceNo = ref<number>(); let highlightResetTimer: number | undefined;
const conversationDrawerOpen = ref(false), conversationDetailId = ref<string>();
const resultStatuses = ref<DictionaryItem[]>([{ value: "HIT", label: "命中", tagType: "error" }, { value: "NOT_HIT", label: "未命中", tagType: "success" }, { value: "PARTIAL_ERROR", label: "部分错误", tagType: "warning" }, { value: "ERROR", label: "错误", tagType: "error" }]);
const riskLevels = ref<DictionaryItem[]>([{ value: "HIGH", label: "高风险" }, { value: "MEDIUM", label: "中风险" }, { value: "LOW", label: "低风险" }]);
const filters = ref({ taskId: undefined as string|undefined, agentId: undefined as string|undefined, ownerId: undefined as string|undefined, groupId: undefined as string|undefined, status: undefined as string|undefined, minScore: undefined as number|undefined, maxScore: undefined as number|undefined, speakerRole: undefined as string|undefined, riskLevel: undefined as string|undefined });
const selectedTaskId = computed({ get: () => filters.value.taskId || "", set: (value: string) => { filters.value.taskId = value.trim() || undefined; } });
const { can } = usePermission();
const route = useRoute();
const router = useRouter();

function parseArray<T>(value?: string): T[] { if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function snapshotRules(): any[] { try { const parsed = JSON.parse(detail.value?.task?.ruleSnapshotJson || "[]"); return Array.isArray(parsed) ? parsed : Array.isArray(parsed.rules) ? parsed.rules : []; } catch { return []; } }
const displayedResults = computed(() => conversationResults.value.length ? conversationResults.value : detail.value?.result ? [detail.value.result] : []);
const schemeTask = computed(() => { try { return Object.hasOwn(JSON.parse(detail.value?.task?.ruleSnapshotJson || "{}"), "schemeSnapshot"); } catch { return false; } });
const labelOnlyScheme = computed(() => {
  try {
    const definition = JSON.parse(detail.value?.task?.ruleSnapshotJson || "{}").schemeSnapshot?.release?.definition;
    return Array.isArray(definition?.items) && definition.items.length === 0 && Array.isArray(definition.labels) && definition.labels.length > 0;
  } catch { return false; }
});
const businessItems = computed(() => parseArray<BusinessItemResult>(hierarchy.value?.conversation.businessItemResultsJson));
const businessScoring = computed<BusinessScoringResult | undefined>(() => { try { return JSON.parse(hierarchy.value?.conversation.scoringResultJson || "null") || undefined; } catch { return undefined; } });
const detailScore = computed(() => schemeTask.value ? (hierarchy.value?.conversation.scoreStatus === "FINAL" ? hierarchy.value.conversation.finalScore : null) : hierarchy.value?.conversation.score ?? detail.value?.summary?.averageScore ?? detail.value?.result?.score);
const businessFailureCount = computed(() => businessItems.value.filter((item) => item.status === "FAIL").length);
function businessStatus(status:string) { return ({PASS:"满足",FAIL:"不满足",NOT_APPLICABLE:"不适用",NOT_EVALUATED:"未评估",REVIEW_REQUIRED:"待复核",ERROR:"执行错误"} as Record<string,string>)[status] || status; }
function scoreContribution(itemCode:string) { const line = businessScoring.value?.lines.find((item) => item.itemCode === itemCode); return !line ? "不计分" : line.contribution == null ? "待确认" : `${businessScoring.value?.mode === "DEDUCTION" ? "扣" : "得"} ${line.contribution} 分${line.vetoTriggered ? "（一票否决）" : ""}`; }
const detailDeduction = computed(() => hierarchy.value?.conversation.deduction ?? displayedResults.value.reduce((sum, result) => sum + (result.deduction || 0), 0));
const detailRisk = computed(() => hierarchy.value?.conversation.riskLevel ?? (displayedResults.value.some((result) => result.riskLevel === "HIGH") ? "HIGH" : displayedResults.value.some((result) => result.riskLevel === "MEDIUM") ? "MEDIUM" : detail.value?.result?.riskLevel));
const breakdown = computed(() => {
  const rules = snapshotRules();
  if (hierarchy.value) return hierarchy.value.rules.map((item) => {
    const rule = rules.find((candidate) => candidate.id === item.ruleId);
    return { ruleId:item.ruleId, ruleName:rule?.name, ruleCode:rule?.code, category:rule?.category, status:item.resultStatus, deduction:item.deduction, score:item.score, riskLevel:item.riskLevel, reason:item.reason, veto:rule?.veto, ruleType:item.ruleType, evaluationScope:item.evaluationScope, ruleVersion:item.ruleVersionNo };
  });
  return displayedResults.value.flatMap((result) => parseArray<RuleBreakdown>(result.ruleBreakdownJson).map((item) => {
    const rule = rules.find((candidate) => candidate.id === item.ruleId);
    return { ...item, resultId: result.id, ruleName: item.ruleName || rule?.name, ruleCode: item.ruleCode || rule?.code, category: item.category || rule?.category, veto: item.veto ?? rule?.veto };
  }));
});
const violations = computed(() => breakdown.value.filter((item) => item.status === "HIT"));
const diagnostics = computed(() => breakdown.value.filter((item) => item.status?.endsWith("ERROR")));
const evidences = computed(() => hierarchy.value ? hierarchy.value.rules.flatMap((rule) => (hierarchy.value?.evidenceByRuleResult[rule.id] || []).map((item) => ({ ruleId:rule.ruleId, text:item.matchedText, start:item.startOffset, end:item.endOffset, sequenceNo:item.sequenceNo, internalDefinition:item.internalDefinition }))) : displayedResults.value.flatMap((result) => parseArray<ResultEvidence>(result.evidenceJson)));
const suggestions = computed(() => displayedResults.value.flatMap((result) => parseArray<ResultSuggestion>(result.suggestionJson)));
function ruleTitle(item: RuleBreakdown, index: number) { return item.ruleName || item.ruleCode || `违规项 ${index + 1}`; }
function ruleEvidence(ruleId?: string): ResultEvidence[] { const matched = evidences.value.filter((item) => item.ruleId === ruleId); if (matched.length) return matched; if (evidences.value.length === 1) return evidences.value; return detail.value?.result?.evidence ? [{ ruleId, text: detail.value.result.evidence }] : []; }
function ruleSuggestions(ruleId?: string) { const matched = suggestions.value.filter((item) => item.ruleId === ruleId); return matched.length ? matched : suggestions.value.length === 1 ? suggestions.value : []; }
function messageAnchorId(sequenceNo?: number) { return sequenceNo === undefined ? undefined : `iqc-message-${sequenceNo}`; }
function locateMessage(sequenceNo?: number) {
  if (sequenceNo === undefined) return;
  const target = document.getElementById(messageAnchorId(sequenceNo) || "");
  if (!target) { message.info(`未找到消息 #${sequenceNo}`); return; }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  highlightedSequenceNo.value = sequenceNo;
  if (highlightResetTimer) window.clearTimeout(highlightResetTimer);
  highlightResetTimer = window.setTimeout(() => { highlightedSequenceNo.value = undefined; }, 2200);
}
function resultLabel(value?: string) { return dictionaryLabel(resultStatuses.value, value); }
function riskLabel(value?: string) { return dictionaryLabel(riskLevels.value, value); }
function statusColor(status?: string) { return status === "HIT" ? "error" : status === "NOT_HIT" ? "success" : "warning"; }
function resetFilters() { filters.value = { taskId: undefined, agentId: undefined, ownerId: undefined, groupId: undefined, status: undefined, minScore: undefined, maxScore: undefined, speakerRole: undefined, riskLevel: undefined }; page.value = 1; void refresh(); }
function applyFilters() { page.value = 1; void refresh(); }
async function copyText(value?: string, key = value) {
  if (!value) return;
  try {
    await copyToClipboard(value);
    copiedConversationId.value = key;
    if (copyResetTimer) window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => { copiedConversationId.value = undefined; }, 1600);
  } catch {
    message.error("复制失败，请手动选择内容复制");
  }
}
const conversationRows = computed(() => {
  if (resultView.value === "BUSINESS") return businessResults.value.map(businessConversationRow);
  return groupResultsByTaskAndConversation(results.value).map((row) => {
    const canonical = canonicalSummaries.value[row.taskId]?.conversations.find((item) => item.conversationId === row.conversationId);
    return canonical ? { ...row, ...canonical } : row;
  });
});
async function refresh() {
  const request = ++resultRequest;
  loading.value = true; canonicalSummaries.value = {}; results.value = []; businessResults.value = []; total.value = 0;
  const selected = {...filters.value}, view = resultView.value;
  try {
    if (view === "BUSINESS") {
      const result = await listBusinessResults({taskId:selected.taskId,scoreStatus:selected.status,
        riskLevel:selected.riskLevel,minScore:selected.minScore,maxScore:selected.maxScore}, {current:page.value,size:pageSize.value});
      if (request !== resultRequest) return;
      businessResults.value = result.records; total.value = result.total;
    } else {
      const result = await listResults(selected, {current:page.value,size:pageSize.value});
      const ids = [...new Set(result.records.filter(item => item.score == null).map(item => item.taskId))];
      const summaries = await Promise.all(ids.map(getBatchResultSummary));
      if (request !== resultRequest) return;
      results.value = result.records; total.value = result.total;
      canonicalSummaries.value = Object.fromEntries(summaries.map(summary => [summary.taskId,summary]));
    }
  } catch { if (request === resultRequest) message.error("结果或会话评分加载失败，未加载的分数不作推断"); }
  finally { if (request === resultRequest) loading.value = false; }
}
function changeResultView() { filters.value.status = undefined; filters.value.agentId = undefined; page.value = 1; void refresh(); }
async function changePage(current: number, size: number) { page.value = current; pageSize.value = size; await refresh(); }
async function showDetail(id: string) { conversationMessages.value = []; conversationResults.value = []; hierarchy.value = undefined; detailLoading.value = true; detailOpen.value = true; try { detail.value = await getResultDetail(id); } catch { message.error("结果详情加载失败"); detailOpen.value = false; } finally { detailLoading.value = false; } }
async function showConversation(row: Pick<TaskConversationResultSummary, "taskId" | "conversationId"> & { sourceResultId?: string }) {
  detailLoading.value = true; detailOpen.value = true; hierarchy.value = undefined; detail.value = undefined;
  conversationMessages.value = []; conversationResults.value = [];
  try {
    const [data, structured] = await Promise.all([getConversationResultDetail(row.taskId, row.conversationId), getResultHierarchy(row.taskId, row.conversationId)]);
    if (row.sourceResultId && structured?.conversation.id !== row.sourceResultId) {
      message.warning("该复核对应的结果已被新执行替代，请返回待办刷新或查看原复核历史。");
      detailOpen.value = false; return;
    }
    hierarchy.value = structured; conversationMessages.value = data.messages || []; conversationResults.value = data.results || [];
    const first = conversationResults.value[0];
    detail.value = first ? { result: first, task: data.task || { id: first.taskId, name: `会话 ${row.conversationId}` }, message: conversationMessages.value.find((item: any) => item.id === first.messageId) || conversationMessages.value[0], conversation: data.conversation, summary: data.summary }
      : { task: data.task || { name: `会话 ${row.conversationId}` }, conversation: data.conversation, summary: data.summary };
  } catch { message.error("会话质检明细加载失败"); detailOpen.value = false; }
  finally { detailLoading.value = false; }
}
function showRawConversation(conversationId?: string) { if (!conversationId) return; detailOpen.value = false; conversationDetailId.value = conversationId; conversationDrawerOpen.value = true; }
async function exportCsv() { try { const response = await exportResults(filters.value); const url = URL.createObjectURL(response.data); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "iqc-results.csv"; anchor.click(); URL.revokeObjectURL(url); } catch { message.error("结果导出失败"); } }
function exportBusinessCsv() {
  const taskId = detail.value?.task?.id;
  if (!taskId || !schemeTask.value || labelOnlyScheme.value || !can("iqc:result:export")) return;
  Modal.confirm({
    title: "导出该任务全部业务质检项？",
    content: "包含任务内所有会话，不受当前消息筛选影响。每行一个质检项；会话最终分不可按行求和，待确认分数留空。最多 50000 行。",
    async onOk() {
      try {
        const response = await exportSchemeResults(taskId);
        const url = URL.createObjectURL(response.data);
        try {
          const anchor = document.createElement("a");
          anchor.href = url; anchor.download = "iqc-business-results.csv"; anchor.click();
        } finally { URL.revokeObjectURL(url); }
      } catch { message.error("业务导出失败，请检查任务权限、结果完整性及 50000 行上限"); }
    }
  });
}
async function exportLabelXlsx() {
  const taskId = detail.value?.task?.id;
  if (!taskId || !labelOnlyScheme.value || !can("iqc:result:export")) return;
  try {
    const response = await exportTaskLabelResults(taskId);
    const url = URL.createObjectURL(response.data);
    try {
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = "iqc-label-results.xlsx"; anchor.click();
    } finally { URL.revokeObjectURL(url); }
  } catch { message.error("标签结果导出失败，请检查任务权限及 50000 行上限"); }
}
function openTaskLabels() {
  const taskId = detail.value?.task?.id;
  if (taskId && labelOnlyScheme.value && can("iqc:task:view")) {
    detailOpen.value = false;
    void router.push({ path: "/tasks", query: { taskId, view: "results", tab: "labels" } });
  }
}
const reviewExporting = ref(false);
const reviewTaskFinished = computed(() => ["SUCCEEDED", "PARTIAL_FAILED", "FAILED", "CANCELLED"].includes(detail.value?.task?.status));
function exportTaskReviews() {
  const taskId = detail.value?.task?.id;
  if (!taskId || !schemeTask.value || !reviewTaskFinished.value || reviewExporting.value || !can("iqc:result:export") || !can("iqc:review:view")) return;
  Modal.confirm({
    title: "导出本任务人工复核 ZIP？",
    content: "覆盖清单包含全部会话；明细仅采用当前结果的最近已完成复核，新待处理轮次另行标明。无结果或未完成复核不会用机器分数补齐。最多 500 会话、50000 项、50 MiB 明细；任务须已结束。",
    async onOk() {
      if (reviewExporting.value) return;
      reviewExporting.value = true;
      try {
        const response = await exportTaskBusinessReviews(taskId);
        const url = URL.createObjectURL(response.data);
        try {
          const anchor = document.createElement("a"); anchor.href = url;
          anchor.download = "iqc-task-reviews.zip"; anchor.click();
        } finally { URL.revokeObjectURL(url); }
      } catch { message.error("任务复核导出失败，请检查权限、任务状态、快照及导出上限"); }
      finally { reviewExporting.value = false; }
    }
  });
}
function markResult(id:string,type:"CORRECT"|"FALSE_POSITIVE"|"FALSE_NEGATIVE"){Modal.confirm({title:type==="CORRECT"?"确认质检结论正确？":type==="FALSE_POSITIVE"?"标记为误判？":"标记为漏判？",content:"标注会追加保存，不会覆盖 AI 原始结果。",async onOk(){await createFeedback(id,{feedbackType:type});message.success("结果标注已保存");}});}
async function openReview(id:string){try{await requestReview(id,"从结果中心发起");message.success("已进入人工复核队列");}catch{message.error("发起复核失败");}}
async function saveAsSample(id:string,type:"POSITIVE"|"FALSE_POSITIVE"|"FALSE_NEGATIVE"){try{await createSample(id,{sampleType:type});message.success("已加入样本库");}catch{message.error("样本创建失败");}}
async function loadDictionaries() { try { const data = await getCachedDictionaries(["iqc_result_status", "iqc_risk_level"]); if (data.iqc_result_status?.length) resultStatuses.value = data.iqc_result_status; if (data.iqc_risk_level?.length) riskLevels.value = data.iqc_risk_level; } catch { /* 治理中心不可用时保留本地展示兜底。 */ } }
onMounted(() => {
  if (typeof route.query.taskId === "string") filters.value.taskId = route.query.taskId;
  void refresh(); void loadDictionaries();
  const { taskId, conversationId, sourceResultId } = route.query;
  if (typeof taskId === "string" && typeof conversationId === "string" && typeof sourceResultId === "string")
    void showConversation({ taskId, conversationId, sourceResultId });
});
</script>

<template>
  <a-radio-group v-model:value="resultView" button-style="solid" @change="changeResultView" style="margin-bottom:16px"><a-radio-button value="BUSINESS">业务会话结果</a-radio-button><a-radio-button value="MESSAGE">消息观察（兼容）</a-radio-button></a-radio-group>
  <section class="page-intro"><div><span class="section-kicker">QUALITY RESULTS</span><h2>质检结果</h2><p>先看不满足项与扣分，再追溯判断理由、证据和改进建议。</p></div><a-button v-if="resultView === 'MESSAGE' && can('iqc:result:export')" @click="exportCsv">导出消息观察（兼容）</a-button></section>
  <a-card :bordered="false" class="filter-card"><a-form layout="inline"><a-form-item label="任务"><ReviewTaskSelector v-model="selectedTaskId"/></a-form-item><a-form-item v-if="resultView === 'MESSAGE'" label="Agent"><a-input v-model:value="filters.agentId" allow-clear placeholder="Agent ID" style="width:140px"/></a-form-item><a-form-item label="状态"><a-select v-model:value="filters.status" allow-clear style="width:120px"><template v-if="resultView === 'BUSINESS'"><a-select-option value="FINAL">评分已确定</a-select-option><a-select-option value="PENDING">待确认</a-select-option><a-select-option value="NOT_APPLICABLE">不计分</a-select-option></template><a-select-option v-for="item in resultView === 'MESSAGE' ? resultStatuses : []" :key="item.value" :value="item.value">{{item.label}}</a-select-option></a-select></a-form-item><a-form-item label="风险"><a-select v-model:value="filters.riskLevel" allow-clear style="width:110px"><a-select-option v-for="item in riskLevels" :key="item.value" :value="item.value">{{item.label}}</a-select-option></a-select></a-form-item><a-form-item label="分数"><a-input-number v-model:value="filters.minScore" :min="0" :max="100" placeholder="最低"/><span class="range-separator">-</span><a-input-number v-model:value="filters.maxScore" :min="0" :max="100" placeholder="最高"/></a-form-item><a-form-item><a-button type="primary" @click="applyFilters">筛选</a-button><a-button class="reset-button" @click="resetFilters">重置</a-button></a-form-item></a-form></a-card>

  <a-card :bordered="false"><div class="table-hint">{{resultView === "BUSINESS" ? "每个任务/会话只显示当前业务结果；分页按会话计数，结果数为质检项数。待确认不推断分数，标签任务不计分。" : "消息观察兼容视图：分页按历史观察计数，会话合并仅限当前页，不代表完整会话统计。"}}</div><a-table :data-source="conversationRows" :loading="loading" :pagination="false" row-key="rowKey" table-layout="fixed" :scroll="{x:1430}"><a-table-column title="质检任务" :width="190"><template #default="{record}"><a-typography-text :ellipsis="{ tooltip: record.taskName || record.taskId }" :content="record.taskName || record.taskId"/><div v-if="record.taskName" class="task-id-secondary">{{record.taskId}}</div></template></a-table-column><a-table-column title="会话得分" :width="110"><template #default="{record}"><strong>{{record.averageScore == null ? (record.scoreStatus === "NOT_APPLICABLE" ? "不计分" : "—") : Number(record.averageScore).toFixed(2)}}</strong></template></a-table-column><a-table-column :title="resultView === 'BUSINESS' ? '不满足项' : '命中'" data-index="hitCount" :width="80"/><a-table-column title="高风险" :width="90"><template #default="{record}"><a-tag v-if="record.highRiskCount" color="error">{{record.highRiskCount}}</a-tag><span v-else>0</span></template></a-table-column><a-table-column title="异常" data-index="errorCount" :width="80"/><a-table-column title="会话 ID" :width="250"><template #default="{record}"><a-space><a-typography-text :ellipsis="{ tooltip: record.conversationId }" :content="record.conversationId"/><a-tooltip :title="copiedConversationId === record.conversationId ? '已复制' : '复制会话 ID'"><a-button type="link" size="small" class="copy-button" :aria-label="copiedConversationId === record.conversationId ? '已复制会话 ID' : '复制会话 ID'" @click.stop="copyText(record.conversationId, record.conversationId)"><CheckOutlined v-if="copiedConversationId === record.conversationId" class="copy-success"/><CopyOutlined v-else /></a-button></a-tooltip></a-space></template></a-table-column><a-table-column title="会话名称" :width="220"><template #default="{record}"><a-typography-text :ellipsis="{ tooltip: record.sourceFileName }" :content="record.sourceFileName || '—'"/></template></a-table-column><a-table-column title="结果数" data-index="resultCount" :width="90"/><a-table-column title="操作" :width="220" fixed="right"><template #default="{record}"><a-space><a-button type="link" @click="showConversation(record)">本次质检明细</a-button><a-button type="link" @click="showRawConversation(record.conversationId)">原始会话</a-button></a-space></template></a-table-column></a-table><a-pagination v-if="total" v-model:current="page" v-model:page-size="pageSize" :total="total" show-size-changer class="pagination" @change="changePage"/></a-card>

  <a-drawer v-model:open="detailOpen" title="质检结果详情" width="min(860px, calc(100vw - 24px))"><a-spin :spinning="detailLoading"><template v-if="detail">
    <a-card :bordered="false" class="result-overview"><a-row :gutter="16"><a-col :span="6"><a-statistic v-if="detailScore != null" title="得分" :value="detailScore" :precision="schemeTask ? 2 : 1" suffix="分"/><template v-else><div class="overview-label">得分</div><strong>{{labelOnlyScheme || businessScoring?.scoreStatus === "NOT_APPLICABLE" ? "不计分" : "待确认"}}</strong></template></a-col><a-col :span="6"><a-statistic v-if="!schemeTask" title="总扣分" :value="detailDeduction" prefix="-"/><template v-else><div class="overview-label">方案类型</div>{{labelOnlyScheme ? "仅识别标签" : businessScoring?.mode === "POINTS" ? "得分制" : "扣分制"}}</template></a-col><a-col :span="6"><div class="overview-label">风险等级</div><a-tag :color="detailRisk==='HIGH'?'error':detailRisk==='MEDIUM'?'warning':'success'">{{riskLabel(detailRisk)}}</a-tag></a-col><a-col :span="6"><div class="overview-label">{{labelOnlyScheme ? "质检项" : "不满足项"}}</div><strong class="violation-count">{{labelOnlyScheme ? "无" : `${schemeTask ? businessFailureCount : violations.length} 项`}}</strong></a-col></a-row></a-card>
    <a-alert v-if="!schemeTask&&!violations.length&&!diagnostics.length" type="success" show-icon message="本条消息未发现不满足项" description="所选规则均未命中。" class="section-block"/>
    <section v-if="!schemeTask&&violations.length" class="section-block"><div class="section-title"><div><h3>不满足项与扣分明细</h3><p>每一项均可追溯到规则、判断理由和证据。</p></div><a-tag color="error">共扣 {{detailDeduction}} 分</a-tag></div>
      <a-card v-for="(item,index) in violations" :key="`${item.ruleId}-${index}`" size="small" class="violation-card"><template #title><span class="violation-index">{{index+1}}</span>{{ruleTitle(item,index)}}</template><template #extra><a-space><a-tag>{{item.evaluationScope==='CONVERSATION'?'会话级':'消息级'}}</a-tag><a-tag v-if="item.veto" color="error">一票否决</a-tag><a-tag :color="item.riskLevel==='HIGH'?'error':'warning'">{{riskLabel(item.riskLevel)}}</a-tag><strong class="deduction">-{{item.deduction||0}} 分</strong></a-space></template><a-descriptions :column="2" size="small"><a-descriptions-item label="规则编码">{{item.ruleCode||item.ruleId||'—'}}</a-descriptions-item><a-descriptions-item label="规则类型 / 版本">{{item.ruleType||'—'}}{{item.ruleVersion ? ` / v${item.ruleVersion}` : ''}}</a-descriptions-item><a-descriptions-item label="判断理由" :span="2">{{item.reason||'命中规则'}}</a-descriptions-item></a-descriptions><div v-if="ruleEvidence(item.ruleId).length" class="detail-group"><strong>命中证据</strong><a-alert v-for="(evidence,eIndex) in ruleEvidence(item.ruleId)" :key="eIndex" type="warning" show-icon class="evidence-alert" :message="evidence.internalDefinition ? `${evidence.internalDefinition}：${evidence.text||'命中'}` : evidence.text||detail.result?.evidence||'命中当前消息'" :description="evidence.sequenceNo !== undefined ? `消息 #${evidence.sequenceNo}，位置 ${evidence.start??'-'}～${evidence.end??'-'} · 点击定位` : undefined" @click="locateMessage(evidence.sequenceNo)"/></div><div v-if="ruleSuggestions(item.ruleId).length" class="detail-group"><strong>改进建议</strong><a-list size="small" :data-source="ruleSuggestions(item.ruleId)"><template #renderItem="{item:suggestion}"><a-list-item><a-list-item-meta :title="suggestion.title||'改进建议'" :description="suggestion.content"/></a-list-item></template></a-list></div></a-card>
    </section>
    <section v-if="labelOnlyScheme" class="section-block">
      <h3>画像标签结果</h3>
      <a-alert type="info" show-icon message="本任务仅识别标签，没有质检项或最终分数。标签值中的“否”与“未知”不同，请在任务结果的洞察标签页查看状态、证据和人工修订。"/>
      <a-button v-if="can('iqc:task:view')" @click="openTaskLabels">查看本任务洞察标签</a-button>
      <a-button v-if="can('iqc:result:export')" @click="exportLabelXlsx">导出本任务标签 XLSX</a-button>
    </section>
    <section v-else-if="schemeTask" class="section-block">
      <h3>机器质检项与独立评分</h3>
      <a-button v-if="can('iqc:result:export')" @click="exportBusinessCsv">导出本任务业务质检项 CSV</a-button>
      <a-button v-if="can('iqc:result:export') && can('iqc:review:view')" :loading="reviewExporting" :disabled="reviewExporting || !reviewTaskFinished" title="任务结束后导出覆盖清单与已完成复核明细" @click="exportTaskReviews">导出本任务人工复核 ZIP</a-button>
      <a-alert v-if="hierarchy?.conversation.resultStatus === 'PENDING' || !businessScoring" type="warning" show-icon message="存在未评估、错误或待复核的质检项，请先处理后确认结果。"/>
      <a-table :data-source="businessItems" :pagination="false" row-key="itemCode" size="small">
        <a-table-column title="质检项" data-index="name"/>
        <a-table-column title="结论"><template #default="{record}"><a-tag :color="record.status === 'PASS' ? 'success' : record.status === 'FAIL' ? 'error' : 'warning'">{{businessStatus(record.status)}}</a-tag></template></a-table-column>
        <a-table-column title="计分"><template #default="{record}">{{scoreContribution(record.itemCode)}}</template></a-table-column>
        <a-table-column title="匹配消息"><template #default="{record}"><a-space wrap><a-button v-for="id in record.matchedMessageIds" :key="id" type="link" size="small" @click="locateMessage(conversationMessages.find((item) => item.id === id)?.sequenceNo)">#{{conversationMessages.find((item) => item.id === id)?.sequenceNo ?? id}}</a-button><span v-if="!record.matchedMessageIds.length">无匹配证据</span></a-space></template></a-table-column>
      </a-table>
      <BusinessReviewPanel v-if="hierarchy?.conversation.id" :key="hierarchy.conversation.id" :result-id="hierarchy.conversation.id" :task-status="detail.task?.status || ''" :items="businessItems" :messages="conversationMessages" @locate="locateMessage" />
    </section>
    <a-alert v-for="(item,index) in diagnostics" :key="`error-${index}`" type="error" show-icon :message="`${ruleTitle(item,index)}执行异常`" :description="item.reason" class="section-block"/>
    <section v-if="conversationMessages.length" class="section-block"><h3>会话消息明细（{{conversationMessages.length}} 条）</h3><a-list bordered size="small"><a-list-item v-for="item in conversationMessages" :id="messageAnchorId(item.sequenceNo)" :key="item.id" class="conversation-message" :class="{ 'message-highlight': highlightedSequenceNo === item.sequenceNo }"><a-list-item-meta :title="`消息 #${item.sequenceNo} · ${item.speakerRole || '未知角色'}`" :description="item.content || '—'"/><a-tag v-if="conversationResults.some((result) => result.messageId === item.id)" color="error">有质检结果</a-tag></a-list-item></a-list></section>
    <section v-else class="section-block"><h3>原始消息</h3><a-card size="small"><p class="message-content">{{detail.message?.content||'—'}}</p></a-card></section>
    <a-collapse v-if="routeContexts.length" ghost class="trace-collapse"><a-collapse-panel key="stages" header="查看逐项检测阶段（专家追溯）">
      <p>阶段命中只是检测观察，不直接代表业务违规或扣分；最终结论见上方机器质检项与独立评分。未执行不等于未命中。</p>
      <a-table :data-source="routeContexts" row-key="key" size="small" :pagination="false" :scroll="{ x: 1080 }" :columns="[{ title: '质检项与阶段职责', dataIndex: 'consumers', width: 220 }, { title: '规则', dataIndex: 'ruleId', width: 160 }, { title: '阶段', dataIndex: 'phase', width: 140 }, { title: '输入范围', dataIndex: 'scope', width: 110 }, { title: '执行情况', dataIndex: 'execution', width: 120 }, { title: '阶段状态', dataIndex: 'status', width: 130 }, { title: '多轮一致情况', dataIndex: 'rounds', width: 220 }]" />
    </a-collapse-panel></a-collapse>
    <a-collapse ghost class="trace-collapse"><a-collapse-panel key="trace" header="查看执行与版本追溯信息"><a-descriptions bordered :column="1" size="small"><a-descriptions-item label="执行实例">{{detail.result?.executionId||'—'}}</a-descriptions-item><a-descriptions-item label="任务">{{detail.task?.name||detail.result?.taskId}}</a-descriptions-item><a-descriptions-item label="消息 ID">{{detail.result?.messageId}}</a-descriptions-item><a-descriptions-item label="规则快照"><pre>{{detail.task?.ruleSnapshotJson||'—'}}</pre></a-descriptions-item><a-descriptions-item label="Agent 快照"><pre>{{detail.task?.agentSnapshotJson||'—'}}</pre></a-descriptions-item></a-descriptions></a-collapse-panel></a-collapse>
  </template></a-spin></a-drawer>

  <ConversationDetailDrawer v-model:open="conversationDrawerOpen" :conversation-id="conversationDetailId" />
</template>

<style scoped>
.task-id-secondary{font-size:12px;color:var(--iqc-slate-600);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.filter-card,.section-block{margin-bottom:16px}.range-separator{margin:0 6px}.reset-button{margin-left:8px}.pagination{margin-top:16px;text-align:right}.copy-button{padding:0 4px}.copy-success{color:#52c41a}.evidence-alert{cursor:pointer}.conversation-message{transition:background-color .25s,box-shadow .25s}.message-highlight{background:#fff7e6;box-shadow:inset 3px 0 #faad14}.deduction{color:#cf1322;font-weight:600}.result-overview{margin-bottom:20px;background:var(--iqc-canvas)}.overview-label{margin-bottom:8px;color:var(--iqc-slate-600)}.violation-count{font-size:20px;color:#cf1322}.section-title{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px}.section-title h3,.section-block h3{margin:0 0 4px}.section-title p{margin:0;color:var(--iqc-slate-600)}.violation-card{margin-bottom:12px;border-left:3px solid #ff4d4f}.violation-index{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-right:8px;border-radius:50%;color:#fff;background:#cf1322}.detail-group{display:grid;gap:8px;margin-top:14px}.message-content{margin:0;white-space:pre-wrap;line-height:1.8}.trace-collapse pre{max-height:220px;margin:0;overflow:auto;white-space:pre-wrap;word-break:break-all}
</style>
