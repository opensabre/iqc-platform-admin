<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import ConversationPicker from "@/components/ConversationPicker.vue";
import { listSchemes, listSchemeVersions, createScheme, reviseScheme, previewScheme, trialScheme, listSchemeTrials, publishScheme, changeSchemeAvailability, changeSchemeVersionArchive,
  type InspectionScheme, type SchemeDraftRequest, type SchemeDefinition, type SchemeItem, type SchemeExecution, type SchemeExecutionVariant,
  type ReleasedSchemeVersion, type PublishedTemplate } from "@/api/schemes";
import SchemeTaskWizard from "../templates/SchemeTaskWizard.vue";
import { listRules, listRuleVersions, listAgents, listAgentVersions, type QualityRule, type QualityRuleVersion, type QualityAgent, type QualityAgentVersion } from "@/api/config";
import { getTask, runTask, type InspectionTask } from "@/api/tasks";
import { getBatchResultSummary, getTaskLabelResults, type BatchResultSummary, type LabelResult } from "@/api/results";
import { usePermission } from "@/composables/permission";
import { getLabelTree, type InsightLabel } from "@/api/labels";
import { summarizeTrialLabels } from "./trial-label-summary";
import { diffReleasedStandards } from "./history-diff";

const { can } = usePermission();
const schemes = ref<InspectionScheme[]>([]);
const loading = ref(false), busy = ref(false), editorOpen = ref(false), trialOpen = ref(false);
const error = ref("");
const editing = ref<InspectionScheme>();
const historyOpen = ref(false), historyLoading = ref(false), historyError = ref("");
const historyTarget = ref<InspectionScheme>();
const historyVersions = ref<ReleasedSchemeVersion[]>([]);
const nextBeforeVersion = ref<number | null>(null);
const historyPreview = ref<PublishedTemplate>();
const historyCompareBase = ref<ReleasedSchemeVersion>();
const historyComparePair = ref<{ before: ReleasedSchemeVersion; after: ReleasedSchemeVersion }>();
const deriveOpen = ref(false), deriveError = ref("");
const deriveSourceSchemeId = ref("");
const deriveSourceVersion = ref<ReleasedSchemeVersion>();
const deriveName = ref(""), deriveCode = ref(""), deriveDescription = ref("");
const historyDiffRows = computed(() => historyComparePair.value
  ? diffReleasedStandards(historyComparePair.value.before, historyComparePair.value.after) : []);
const historyDiffColumns = [
  { title: "范围", dataIndex: "scope", width: 160 }, { title: "变更字段", dataIndex: "field", width: 140 },
  { title: "较早版本", dataIndex: "before" }, { title: "较新版本", dataIndex: "after" }
];
let historyGeneration = 0;
onBeforeUnmount(() => { historyGeneration++; });
/** Ignore responses after another scheme is opened or this read-only panel is closed. */
async function loadHistory(beforeVersion?: number) {
  const target = historyTarget.value;
  if (!target || !historyOpen.value || !can("iqc:scheme:manage")) return;
  const generation = ++historyGeneration;
  historyLoading.value = true; historyError.value = "";
  if (beforeVersion === undefined) { historyVersions.value = []; nextBeforeVersion.value = null; }
  try {
    const page = await listSchemeVersions(target.id, beforeVersion);
    if (generation !== historyGeneration) return;
    historyVersions.value = beforeVersion === undefined ? page.versions : [...historyVersions.value, ...page.versions];
    nextBeforeVersion.value = page.nextBeforeVersion;
  } catch {
    if (generation === historyGeneration) historyError.value = "发布历史加载失败，请重试；未改变模板或任务。";
  } finally {
    if (generation === historyGeneration) historyLoading.value = false;
  }
}
function openHistory(scheme: InspectionScheme) {
  if (!can("iqc:scheme:manage")) return;
  historyCompareBase.value = undefined; historyComparePair.value = undefined;
  historyTarget.value = scheme; historyOpen.value = true; void loadHistory();
}
function closeHistory() {
  historyGeneration++; historyOpen.value = false; historyLoading.value = false;
  historyCompareBase.value = undefined; historyComparePair.value = undefined;
}
function compareHistory(version: ReleasedSchemeVersion) {
  const base = historyCompareBase.value;
  if (!base || base.versionNo === version.versionNo || !historyTarget.value || !can("iqc:scheme:manage")) return;
  historyComparePair.value = base.versionNo < version.versionNo
    ? { before: base, after: version } : { before: version, after: base };
}
function previewHistory(version: ReleasedSchemeVersion) {
  if (!historyTarget.value || !can("iqc:scheme:manage")) return;
  historyPreview.value = { schemeId: historyTarget.value.id, versionNo: version.versionNo,
    contentHash: version.contentHash, snapshot: version.snapshot };
  closeHistory();
}
function confirmVersionArchive(version: ReleasedSchemeVersion) {
  const target = historyTarget.value;
  if (!target || !can("iqc:scheme:publish") || target.activePublishedVersion == null
    || version.versionNo >= target.activePublishedVersion) return;
  const id = target.id, revision = target.draftRevision, archived = !version.archived;
  Modal.confirm({
    title: `${archived ? '归档' : '恢复'}发布版本 V${version.versionNo}`,
    content: archived
      ? "归档后，该版本将退出普通用户的历史模板列表并不能创建新任务。不可变快照和已创建任务保留，当前发布指针不变；归档后可恢复。"
      : "恢复后，该历史版本可再次供普通用户查看和创建新任务；它仍是历史版本，不会成为当前发布版本。已有任务和发布指针不变。",
    okText: archived ? "归档版本" : "恢复使用", cancelText: "取消", okButtonProps: { danger: archived },
    async onOk() {
      busy.value = true;
      try {
        await changeSchemeVersionArchive(id, revision, version.versionNo, archived);
        historyVersions.value = historyVersions.value.map(item => item.versionNo === version.versionNo
          ? { ...item, archived } : item);
        await refresh();
        historyTarget.value = schemes.value.find(scheme => scheme.id === id) ?? target;
        message.success(archived ? `V${version.versionNo} 已归档；已有任务保持不变。` : `V${version.versionNo} 已恢复为可选历史版本。`);
      } catch (reason) {
        const detail = reason instanceof Error ? reason.message : "操作失败，请重试。";
        message.error(detail);
        throw reason;
      } finally { busy.value = false; }
    }
  });
}
function beginDerive(version: ReleasedSchemeVersion) {
  const source = historyTarget.value;
  if (!source || source.status !== "ACTIVE" || version.archived || !can("iqc:scheme:create")) return;
  deriveSourceSchemeId.value = source.id;
  deriveSourceVersion.value = version;
  deriveName.value = `${version.snapshot.name} 派生版`.slice(0, 100);
  deriveCode.value = `${version.snapshot.code}_v${version.versionNo}`.slice(0, 64);
  deriveDescription.value = `基于 ${version.snapshot.name} V${version.versionNo} 派生`;
  deriveError.value = "";
  deriveOpen.value = true;
}
async function submitDerive() {
  const source = deriveSourceVersion.value;
  if (!source || !deriveSourceSchemeId.value || !can("iqc:scheme:create")) return;
  if (!deriveName.value.trim() || deriveName.value.length > 100 || !/^[A-Za-z0-9_-]{1,64}$/.test(deriveCode.value)
    || deriveDescription.value.length > 1000) {
    deriveError.value = "请填写不超过 100 字的名称、有效唯一编码和不超过 1000 字的说明。"; return;
  }
  busy.value = true; deriveError.value = "";
  try {
    const created = await createScheme({ name: deriveName.value.trim(), code: deriveCode.value,
      description: deriveDescription.value || undefined, sourceSchemeId: deriveSourceSchemeId.value, sourceVersionNo: source.versionNo });
    deriveOpen.value = false; closeHistory();
    message.success(`已从 V${source.versionNo} 创建独立草稿并记录来源；请检查、试跑后再发布。`);
    await refresh();
    await openEditor(created);
  } catch (reason) {
    deriveError.value = reason instanceof Error ? reason.message : "派生草稿创建失败，请重试。";
  } finally { busy.value = false; }
}
function closeDerive() {
  if (busy.value) return;
  deriveOpen.value = false; deriveError.value = ""; deriveSourceVersion.value = undefined;
}
const rules = ref<QualityRule[]>([]), agents = ref<QualityAgent[]>([]);
const publishedLabels = ref<InsightLabel[]>([]);
const labelLoadWarning = ref("");
const versions = ref<Record<string, QualityRuleVersion[]>>({});
const agentVersions = ref<QualityAgentVersion[]>([]);
const form = ref<SchemeDraftRequest>(empty());
const expandedVariantCode = ref<string>();
const trialTarget = ref<InspectionScheme>();
const trialMax = ref(20);
const trialIds = ref<string[]>([]), trials = ref<InspectionTask[]>([]);
const pendingTrial = ref<{ schemeId: string; revision: number; conversationIds: string[]; requestId: string; variantCode?: string;
  runCount: number; confidenceThreshold?: number }>();
const trialVariantCode = ref<string>();
const trialRunCount = ref(1), trialConfidenceThreshold = ref<number>();
const trialVariants = computed(() => {
  try { return trialTarget.value ? (JSON.parse(trialTarget.value.draftConfigJson) as SchemeDefinition).executionVariants : undefined; }
  catch { return undefined; }
});
const trialVariant = computed(() => trialVariants.value?.variants.find(item => item.code === trialVariantCode.value));
const trial = ref<InspectionTask>();
const summary = ref<BatchResultSummary>();
const trialLabelRows = ref<LabelResult[]>();
const trialLabelSummary = computed(() => trial.value && trialHasLabels(trial.value) && trialLabelRows.value
  ? summarizeTrialLabels(trial.value, trialLabelRows.value) : undefined);
const trialReadyToPublish = computed(() => Boolean(trial.value && trialTarget.value && trial.value.status === "SUCCEEDED"
  && revision(trial.value) === trialTarget.value.draftRevision
  && (!trialHasLabels(trial.value) || trialLabelSummary.value && trialLabelSummary.value.complete
    && !trialLabelSummary.value.invalid && trialLabelSummary.value.counts.ERROR === 0)));
const reviewed = ref(false), inspected = ref(false);
const trialColumns = [{ title: "会话", dataIndex: "sourceFileName" }, { title: "评分状态", dataIndex: "scoreStatus" }, { title: "分数", dataIndex: "averageScore" }, { title: "不满足项", dataIndex: "hitCount" }];
const columns = [{ title: "业务方案", dataIndex: "name" }, { title: "场景", dataIndex: "businessScene" },
  { title: "来源", key: "origin" }, { title: "草稿修订", dataIndex: "draftRevision" }, { title: "发布版本", key: "release" }, { title: "可用状态", key: "availability" }, { title: "操作", key: "actions" }];
const needsLlm = computed(() => form.value.definition.items.some(item => [item.rule, item.appliesWhen, item.execution?.prefilter, item.execution?.candidate]
  .some(rule => rule && versions.value[rule.id]?.find(v => v.versionNo === rule.versionNo)?.ruleType === "LLM"))
  || (form.value.definition.executionVariants?.variants || []).some(variant => Object.values(variant.routes)
    .flatMap(execution => [execution.prefilter, execution.candidate])
    .some(rule => rule && versions.value[rule.id]?.find(v => v.versionNo === rule.versionNo)?.ruleType === "LLM")));
const ruleOptions = computed(() => rules.value.filter(r => r.status !== "DISABLED").map(r => ({ label: `${r.name} · ${r.ruleType}`, value: r.id })));
const executionRouteOptions = [
  { label: "仅普通规则", value: "RULE_ONLY" }, { label: "仅 LLM 判断", value: "LLM_ONLY" },
  { label: "普通规则初筛 → LLM 复核", value: "RULE_THEN_LLM" }, { label: "LLM 提取候选 → 普通规则验证", value: "LLM_THEN_RULE" }
];
const labelOptions = computed(() => publishedLabels.value.filter(label => ["user", "customer", "agent"].includes(label.targetRole))
  .map(label => ({ label: `${label.name} · V${label.versionNo} · ${label.targetRole === "agent" ? "坐席" : "客户"}`, value: label.id })));
function draftHasLabels(scheme: InspectionScheme) {
  try { return Boolean((JSON.parse(scheme.draftConfigJson) as SchemeDefinition).labels?.length); }
  catch { return false; }
}
function draftHasConditions(scheme: InspectionScheme) {
  try { return Boolean((JSON.parse(scheme.draftConfigJson) as SchemeDefinition).items?.some(item => item.appliesWhen)); }
  catch { return false; }
}
function draftHasInputScope(scheme: InspectionScheme) {
  try { return Boolean((JSON.parse(scheme.draftConfigJson) as SchemeDefinition).items?.some(item => item.inputScope != null)); }
  catch { return false; }
}
function draftHasRoutes(scheme: InspectionScheme) {
  try { return Boolean((JSON.parse(scheme.draftConfigJson) as SchemeDefinition).items?.some(item => item.execution)); }
  catch { return false; }
}
function setRoute(item: { execution?: SchemeExecution | null }, route: unknown) {
  if (route === "LEGACY") { delete item.execution; return; }
  if (route === "RULE_ONLY" || route === "LLM_ONLY") item.execution = { route };
  else if (route === "RULE_THEN_LLM") item.execution = { route, prefilter: { id: "", versionNo: 0 }, prefilterCoversViolation: false };
  else if (route === "LLM_THEN_RULE") item.execution = { route, candidate: { id: "", versionNo: 0 } };
}
function defaultExecution(item: SchemeItem): SchemeExecution {
  return { route: isLlmItem(item) ? "LLM_ONLY" : "RULE_ONLY" };
}
function copyExecution(execution: SchemeExecution): SchemeExecution {
  return { route: execution.route,
    ...(execution.prefilter ? { prefilter: { ...execution.prefilter } } : {}),
    ...(execution.candidate ? { candidate: { ...execution.candidate } } : {}),
    ...(execution.stageInputScope ? { stageInputScope: execution.stageInputScope } : {}),
    ...(execution.prefilterCoversViolation !== undefined ? { prefilterCoversViolation: execution.prefilterCoversViolation } : {}) };
}
function setVariantRoute(variant: SchemeExecutionVariant, item: SchemeItem, route: unknown) {
  const holder: { execution?: SchemeExecution | null } = { execution: variant.routes[item.itemCode] };
  setRoute(holder, route);
  if (holder.execution) variant.routes[item.itemCode] = holder.execution;
}
function variantExecution(variant: SchemeExecutionVariant, item: SchemeItem): SchemeExecution {
  return variant.routes[item.itemCode] ?? defaultExecution(item);
}
async function selectExecutionStage(currentExecution: () => SchemeExecution | null | undefined, id: string) {
  const execution = currentExecution();
  const stage = execution?.prefilter ?? execution?.candidate;
  if (!stage) return;
  stage.id = id; stage.versionNo = 0;
  try { await loadVersions(id); if (currentExecution() === execution && (execution?.prefilter ?? execution?.candidate) === stage && stage.id === id) stage.versionNo = versions.value[id]?.[0]?.versionNo || 0; }
  catch (reason) { fail(reason); }
}
async function selectStage(item: SchemeItem, id: string) { await selectExecutionStage(() => item.execution, id); }
async function selectVariantStage(variant: SchemeExecutionVariant, item: SchemeItem, id: string) {
  await selectExecutionStage(() => variant.routes[item.itemCode], id);
}
function isLlmItem(item: SchemeItem) {
  return versions.value[item.rule.id]?.find(version => version.versionNo === item.rule.versionNo)?.ruleType === "LLM";
}
function executionError(item: SchemeItem, execution: SchemeExecution): string | undefined {
  const stage = execution.prefilter ?? execution.candidate;
  if ((execution.route === "RULE_ONLY" || execution.route === "LLM_THEN_RULE") === isLlmItem(item))
    return "最终裁决规则类型与所选路线不一致，请重新选择已发布规则。";
  if ((execution.route === "RULE_THEN_LLM" || execution.route === "LLM_THEN_RULE")
    && (!stage?.id || stage.versionNo < 1 || stage.id === item.rule.id))
    return "组合路线须选择另一条阶段检测规则的已发布版本。";
  if (execution.route === "RULE_THEN_LLM" && (item.hitMeaning !== "VIOLATION" || !execution.prefilterCoversViolation))
    return "初筛复核仅支持违规检测，须确认初筛覆盖所有目标违规。";
  if (execution.route === "RULE_THEN_LLM" && (!execution.prefilter || execution.candidate || execution.stageInputScope != null))
    return "规则初筛路线配置不完整。";
  if (execution.route === "LLM_THEN_RULE" && (!execution.candidate || execution.prefilter || execution.prefilterCoversViolation != null))
    return "LLM 候选路线配置不完整。";
  if ((execution.route === "RULE_ONLY" || execution.route === "LLM_ONLY")
    && (execution.prefilter || execution.candidate || execution.stageInputScope != null || execution.prefilterCoversViolation != null))
    return "单阶段路线不能携带中间阶段配置。";
  if (stage) {
    const version = versions.value[stage.id]?.find(v => v.versionNo === stage.versionNo);
    if (!version) return "阶段规则版本不存在或已停用，请重新选择已发布版本。";
    if ((version.ruleType === "LLM") !== (execution.route === "LLM_THEN_RULE"))
      return "阶段检测规则类型与所选路线不一致。";
  }
  return undefined;
}
function setInputScope(item: SchemeItem, scope: unknown) {
  if (scope === "MESSAGE" || scope === "CONVERSATION") item.inputScope = scope;
  else if (scope === "LEGACY") delete item.inputScope;
}
function setStageInputScope(item: SchemeItem, scope: unknown) {
  setExecutionStageInputScope(item.execution, scope);
}
function setExecutionStageInputScope(execution: SchemeExecution | null | undefined, scope: unknown) {
  if (execution?.route !== "LLM_THEN_RULE") return;
  if (scope === "MESSAGE" || scope === "CONVERSATION") execution.stageInputScope = scope;
  else if (scope === "LEGACY") delete execution.stageInputScope;
}
function setVariantStageInputScope(variant: SchemeExecutionVariant, item: SchemeItem, scope: unknown) {
  setExecutionStageInputScope(variant.routes[item.itemCode], scope);
}
function setVariantsEnabled(enabled: boolean) {
  const definition = form.value.definition;
  if (!enabled) {
    const variants = definition.executionVariants;
    const recommended = variants?.variants.find(variant => variant.code === variants.recommendedCode);
    if (recommended) for (const item of definition.items) {
      const execution = recommended.routes[item.itemCode];
      if (execution) item.execution = copyExecution(execution);
    }
    delete definition.executionVariants; expandedVariantCode.value = undefined; return;
  }
  if (!definition.items.length) { error.value = "请先添加至少一个质检项，再配置允许策略变体。"; return; }
  const routes = Object.fromEntries(definition.items.map(item => [item.itemCode,
    copyExecution(item.execution ?? defaultExecution(item))]));
  definition.items.forEach(item => { delete item.execution; });
  definition.executionVariants = { recommendedCode: "standard", variants: [{ code: "standard", name: "标准方案",
    coverage: "覆盖全部质检项", cost: "按所选路线执行；成本待样本验证", routes }] };
  expandedVariantCode.value = "standard";
}
function addVariant() {
  const variants = form.value.definition.executionVariants;
  if (!variants || variants.variants.length >= 20) return;
  const source = variants.variants.find(item => item.code === variants.recommendedCode) ?? variants.variants[0];
  if (!source) return;
  const routes = Object.fromEntries(form.value.definition.items.map(item => {
    const existing = source.routes[item.itemCode] ?? defaultExecution(item);
    return [item.itemCode, copyExecution(existing)];
  }));
  const number = variants.variants.length + 1;
  const code = `variant_${crypto.randomUUID().slice(0, 8)}`;
  variants.variants.push({ code, name: `备选方案 ${number}`,
    coverage: "覆盖全部质检项", cost: "按所选路线执行；成本待样本验证", routes });
  expandedVariantCode.value = code;
}
function removeVariant(variant: SchemeExecutionVariant) {
  const variants = form.value.definition.executionVariants;
  if (!variants || variants.variants.length <= 1) return;
  variants.variants = variants.variants.filter(item => item !== variant);
  if (variants.recommendedCode === variant.code) variants.recommendedCode = variants.variants[0].code;
  if (expandedVariantCode.value === variant.code) expandedVariantCode.value = variants.recommendedCode;
}
function toggleVariantEditor(variant: SchemeExecutionVariant) {
  expandedVariantCode.value = expandedVariantCode.value === variant.code ? undefined : variant.code;
}
function recommendVariant(variant: SchemeExecutionVariant) {
  if (form.value.definition.executionVariants) form.value.definition.executionVariants.recommendedCode = variant.code;
}
function updateVariantCode(variant: SchemeExecutionVariant, code: string) {
  const variants = form.value.definition.executionVariants;
  if (!variants) return;
  const previous = variant.code;
  variant.code = code;
  if (variants.recommendedCode === previous) variants.recommendedCode = code;
}
function trialHasLabels(task: InspectionTask) {
  if (task.labelScopeSnapshotJson) return true;
  try { return Boolean(JSON.parse(task.ruleSnapshotJson || "null")?.schemeSnapshot?.release?.definition?.labels?.length); }
  catch { return false; }
}
function trialOnlyLabels(task: InspectionTask) {
  try { const definition = JSON.parse(task.ruleSnapshotJson || "null")?.schemeSnapshot?.release?.definition as SchemeDefinition | undefined;
    return Array.isArray(definition?.items) && definition.items.length === 0 && !!definition.labels?.length; }
  catch { return false; }
}
function selectLabels(ids: string[]) {
  form.value.definition.labels = ids.map(id => {
    const label = publishedLabels.value.find(item => item.id === id);
    const previous = form.value.definition.labels?.find(item => item.id === id);
    return { id, versionNo: previous?.versionNo ?? label?.versionNo ?? 0 };
  });
}

function empty(): SchemeDraftRequest {
  return { name: "", code: "", businessScene: "", description: "", definition: { schemaVersion: "iqc-scheme-v2", items: [], agent: null,
    runLimits: { maxConversations: 1000, defaultConcurrency: 1, maxConcurrency: 1 },
    scoring: { version: "iqc-score-v2", mode: "DEDUCTION", baseScore: 100, passingScore: 60, items: [] } } };
}
function fail(reason: unknown) { error.value = reason instanceof Error ? reason.message : "操作失败，请稍后重试"; }
async function refresh() {
  loading.value = true; error.value = "";
  try { schemes.value = await listSchemes(); } catch (reason) { fail(reason); } finally { loading.value = false; }
}
async function loadVersions(ruleId: string) {
  versions.value[ruleId] = (await listRuleVersions(ruleId)).filter(v => v.status === "PUBLISHED");
}
async function openEditor(scheme?: InspectionScheme) {
  editing.value = scheme; error.value = ""; labelLoadWarning.value = "";
  try {
    form.value = scheme ? { name: scheme.name, code: scheme.code, description: scheme.description, businessScene: scheme.businessScene,
      definition: JSON.parse(scheme.draftConfigJson) as SchemeDefinition } : empty();
    expandedVariantCode.value = form.value.definition.executionVariants?.recommendedCode;
    const [availableRules, availableAgents, labelTree] = await Promise.all([listRules(), listAgents(), getLabelTree().catch(() => null)]);
    rules.value = availableRules; agents.value = availableAgents;
    publishedLabels.value = labelTree?.labels.filter(label => label.status === "PUBLISHED") ?? [];
    if (!labelTree) labelLoadWarning.value = "标签目录暂不可用；仍可维护原有质检项，已有标签版本引用会保留。请在选择新标签前重试打开编辑器。";
    versions.value = {};
    const variantStages = (form.value.definition.executionVariants?.variants || []).flatMap(variant => Object.values(variant.routes)
      .flatMap(execution => [execution.prefilter, execution.candidate]));
    const dependencyIds = [...form.value.definition.items.flatMap(i => [i.rule, i.appliesWhen, i.execution?.prefilter, i.execution?.candidate]), ...variantStages]
      .filter((rule): rule is { id: string; versionNo: number } => !!rule && !!rule.id).map(rule => rule.id);
    await Promise.all([...new Set(dependencyIds)].map(loadVersions));
    agentVersions.value = form.value.definition.agent ? (await listAgentVersions(form.value.definition.agent.id)).filter(validAgentVersion) : [];
    editorOpen.value = true;
  } catch (reason) { fail(reason); }
}
function validAgentVersion(v: QualityAgentVersion) {
  try { return v.status === "PUBLISHED" && JSON.parse(v.configJson || "{}").schemaVersion === "3.0"; } catch { return false; }
}
async function selectAgent(id?: string) {
  agentVersions.value = []; form.value.definition.agent = id ? { id, versionNo: 0 } : null;
  if (!id) return;
  try {
    const found = (await listAgentVersions(id)).filter(validAgentVersion);
    if (form.value.definition.agent?.id !== id) return;
    agentVersions.value = found;
    form.value.definition.agent.versionNo = found[0]?.versionNo || 0;
  } catch (reason) { fail(reason); }
}
async function selectRule(item: SchemeItem, id: string) {
  item.rule = { id, versionNo: 0 };
  try {
    await loadVersions(id);
    if (item.rule.id === id) {
      item.rule.versionNo = versions.value[id]?.[0]?.versionNo || 0;
      for (const variant of form.value.definition.executionVariants?.variants || []) {
        const execution = variant.routes[item.itemCode];
        if (execution?.route === "RULE_ONLY" || execution?.route === "LLM_ONLY")
          execution.route = isLlmItem(item) ? "LLM_ONLY" : "RULE_ONLY";
      }
    }
  }
  catch (reason) { fail(reason); }
}
function toggleApplicability(item: SchemeItem, enabled: boolean) {
  if (enabled) item.appliesWhen = { id: "", versionNo: 0 };
  else delete item.appliesWhen;
}
async function selectApplicability(item: SchemeItem, id: string) {
  item.appliesWhen = { id, versionNo: 0 };
  try {
    await loadVersions(id);
    if (item.appliesWhen?.id === id) item.appliesWhen.versionNo = versions.value[id]?.[0]?.versionNo || 0;
  } catch (reason) { fail(reason); }
}
function addItem() {
  const code = `item_${crypto.randomUUID().slice(0, 8)}`;
  form.value.definition.items.push({ itemCode: code, name: "", rule: { id: "", versionNo: 0 }, hitMeaning: "VIOLATION" });
  form.value.definition.executionVariants?.variants.forEach(variant => { variant.routes[code] = { route: "RULE_ONLY" }; });
}
function removeItem(item: SchemeItem) {
  form.value.definition.items = form.value.definition.items.filter(i => i !== item);
  form.value.definition.scoring.items = form.value.definition.scoring.items.filter(i => i.itemCode !== item.itemCode);
  form.value.definition.executionVariants?.variants.forEach(variant => { delete variant.routes[item.itemCode]; });
}
function scoreFor(item: SchemeItem) { return form.value.definition.scoring.items.find(i => i.itemCode === item.itemCode); }
function toggleScore(item: SchemeItem, checked: boolean) {
  form.value.definition.scoring.items = form.value.definition.scoring.items.filter(i => i.itemCode !== item.itemCode);
  if (checked) form.value.definition.scoring.items.push({ itemCode: item.itemCode, points: 10, veto: false });
}
async function save() {
  const value = form.value;
  const limits = value.definition.runLimits;
  if (limits && (!Number.isInteger(limits.maxConversations) || limits.maxConversations < 1 || limits.maxConversations > 1000
    || !Number.isInteger(limits.maxConcurrency) || limits.maxConcurrency < 1 || limits.maxConcurrency > 32
    || !Number.isInteger(limits.defaultConcurrency) || limits.defaultConcurrency < 1 || limits.defaultConcurrency > limits.maxConcurrency)) {
    error.value = "会话上限须为 1–1000 的整数；并发须为 1–32 的整数，默认并发不得超过最大并发。"; return;
  }
  if (!value.name.trim() || !/^[A-Za-z0-9_-]{1,64}$/.test(value.code) || !value.businessScene.trim()
    || (!value.definition.items.length && !value.definition.labels?.length)
    || value.definition.items.some(i => !i.name.trim() || !i.rule.id || i.rule.versionNo < 1)) {
    error.value = "请填写名称、有效编码、场景，至少选择质检项或画像标签；质检项须引用已发布规则版本。"; return;
  }
  if (value.definition.labels?.some(label => label.versionNo < 1)) {
    error.value = "所选标签缺少已发布版本，请重新选择标签。"; return;
  }
  const dependencyVersions = new Map<string, number>();
  for (const item of value.definition.items) {
    const execution = item.execution;
    if (execution) {
      const issue = executionError(item, execution);
      if (issue) { error.value = issue; return; }
    }
    if (item.inputScope != null && (!isLlmItem(item) || !["MESSAGE", "CONVERSATION"].includes(item.inputScope))) {
      error.value = "显式输入范围仅适用于已发布的 LLM 规则版本；请核对规则或明确恢复原有范围。"; return;
    }
    if (item.appliesWhen && (!item.appliesWhen.id || !Number.isInteger(item.appliesWhen.versionNo)
      || item.appliesWhen.versionNo < 1 || item.appliesWhen.id === item.rule.id)) {
      error.value = "适用条件须引用另一条规则的已发布版本，不能使用本项检测规则。"; return;
    }
    for (const rule of [item.rule, item.appliesWhen, item.execution?.prefilter, item.execution?.candidate]) {
      if (!rule) continue;
      if (dependencyVersions.has(rule.id) && dependencyVersions.get(rule.id) !== rule.versionNo) {
        error.value = "同一检测或条件规则在方案中须使用相同版本，请统一后保存。"; return;
      }
      dependencyVersions.set(rule.id, rule.versionNo);
    }
  }
  const variants = value.definition.executionVariants;
  if (variants) {
    const codes = new Set<string>();
    if (!variants.variants.length || variants.variants.length > 20 || !variants.variants.some(item => item.code === variants.recommendedCode)) {
      error.value = "请设置 1–20 个允许策略变体，并选择其中一个作为推荐方案。"; return;
    }
    const itemCodes = new Set(value.definition.items.map(item => item.itemCode));
    for (const variant of variants.variants) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(variant.code) || codes.has(variant.code)
        || !variant.name.trim() || variant.name.length > 100 || !variant.coverage.trim() || variant.coverage.length > 1000
        || !variant.cost.trim() || variant.cost.length > 1000) {
        error.value = "每种策略须有唯一编码、名称、覆盖说明和成本/耗时说明（长度须符合限制）。"; return;
      }
      codes.add(variant.code);
      if (!variant.routes || Object.keys(variant.routes).length !== itemCodes.size
        || Object.keys(variant.routes).some(code => !itemCodes.has(code))
        || value.definition.items.some(item => !variant.routes[item.itemCode])) {
        error.value = `策略“${variant.name}”必须为每个质检项配置且仅配置一条执行路线。`; return;
      }
      const variantVersions = new Map<string, number>();
      for (const item of value.definition.items) {
        const execution = variant.routes[item.itemCode];
        const issue = executionError(item, execution);
        if (issue) { error.value = `策略“${variant.name}”的“${item.name || item.itemCode}”：${issue}`; return; }
        for (const rule of [item.rule, item.appliesWhen, execution.prefilter, execution.candidate]) {
          if (!rule) continue;
          if (variantVersions.has(rule.id) && variantVersions.get(rule.id) !== rule.versionNo) {
            error.value = `策略“${variant.name}”中的同一检测或条件规则须使用相同版本。`; return;
          }
          variantVersions.set(rule.id, rule.versionNo);
        }
      }
    }
  }
  if (needsLlm.value && (!value.definition.agent?.id || value.definition.agent.versionNo < 1)) {
    error.value = "检测规则或适用条件使用 LLM，请选择已发布的 LLM 智能体版本。"; return;
  }
  busy.value = true; error.value = "";
  try {
    if (editing.value) await reviseScheme(editing.value.id, editing.value.draftRevision, value);
    else await createScheme(value);
    editorOpen.value = false; message.success("草稿已保存；需重新试跑并发布才会影响可用模板。"); await refresh();
  } catch (reason) { fail(reason); } finally { busy.value = false; }
}
async function check(scheme: InspectionScheme) {
  busy.value = true; error.value = "";
  try { await previewScheme(scheme.id, scheme.draftRevision); message.success("结构与依赖检查通过，发布前仍需真实试跑。"); }
  catch (reason) { fail(reason); } finally { busy.value = false; }
}
function confirmAvailability(scheme: InspectionScheme) {
  if (busy.value || !can("iqc:scheme:publish") || !["ACTIVE", "DISABLED"].includes(scheme.status)) return;
  // Capture the displayed revision: a later refresh must not silently change the confirmed command.
  const id = scheme.id, revision = scheme.draftRevision, enabled = scheme.status === "DISABLED";
  Modal.confirm({
    title: `${enabled ? '恢复' : '停用'}业务模板：${scheme.name}`,
    content: enabled
      ? "恢复原发布版本的可用性，不发布当前草稿，也不自动启动任务。规则和模型仍需通过可用性检查；后续发布新版本需重新试跑。"
      : "将停用此方案的全部发布版本，阻止新建以及后续启动、重试和恢复。已在执行的调用不会被强制中断；历史结果、复核和导出保留。状态切换后发布新版本需重新试跑。",
    okText: enabled ? "确认恢复" : "确认停用", cancelText: "取消", okButtonProps: { danger: !enabled },
    async onOk() {
      busy.value = true; error.value = "";
      try {
        await changeSchemeAvailability(id, revision, enabled);
        message.success(enabled ? "模板已恢复；未自动启动任务。" : "模板已停用；历史结果保留。");
        await refresh();
      } catch (reason) { fail(reason); throw reason; }
      finally { busy.value = false; }
    }
  });
}
async function openTrials(scheme: InspectionScheme) {
  try { trialMax.value = Math.min(20, (JSON.parse(scheme.draftConfigJson) as SchemeDefinition).runLimits?.maxConversations ?? 20); }
  catch (reason) { fail(reason); return; }
  if (pendingTrial.value && (pendingTrial.value.schemeId !== scheme.id || pendingTrial.value.revision !== scheme.draftRevision))
    pendingTrial.value = undefined;
  trialTarget.value = scheme; trial.value = undefined; summary.value = undefined; trialLabelRows.value = undefined;
  trialVariantCode.value = pendingTrial.value?.variantCode ?? trialVariants.value?.recommendedCode;
  trialRunCount.value = pendingTrial.value?.runCount ?? 1;
  trialConfidenceThreshold.value = pendingTrial.value?.confidenceThreshold;
  trialIds.value = pendingTrial.value?.conversationIds.slice() ?? [];
  reviewed.value = false; inspected.value = false; error.value = ""; trials.value = []; trialOpen.value = true;
  await refreshTrials();
}
async function refreshTrials() {
  if (!trialTarget.value) return;
  busy.value = true;
  try { trials.value = await listSchemeTrials(trialTarget.value.id); }
  catch (reason) { fail(reason); } finally { busy.value = false; }
}
function revision(task: InspectionTask) {
  try { return JSON.parse(task.ruleSnapshotJson || "{}").schemeSnapshot?.draftRevision; } catch { return undefined; }
}
async function selectTrial(id: string) {
  busy.value = true; trial.value = undefined; summary.value = undefined; trialLabelRows.value = undefined;
  reviewed.value = false; inspected.value = false; error.value = "";
  try {
    trial.value = await getTask(id);
    summary.value = await getBatchResultSummary(id);
    if (trialHasLabels(trial.value)) trialLabelRows.value = await getTaskLabelResults(id);
  } catch (reason) { fail(reason); } finally { busy.value = false; }
}
async function startTrial() {
  if (!trialTarget.value || busy.value) return;
  if (!pendingTrial.value && (!trialIds.value.length || trialIds.value.length > trialMax.value)) {
    error.value = `试跑请选择 1–${trialMax.value} 个会话。`; return;
  }
  const attempt = pendingTrial.value ?? { schemeId: trialTarget.value.id, revision: trialTarget.value.draftRevision,
    conversationIds: trialIds.value.slice(), requestId: crypto.randomUUID(),
    runCount: trialRunCount.value, ...(trialRunCount.value > 1 && trialConfidenceThreshold.value !== undefined ? { confidenceThreshold: trialConfidenceThreshold.value } : {}),
    ...(trialVariantCode.value !== undefined ? { variantCode: trialVariantCode.value } : {}) };
  pendingTrial.value = attempt;
  busy.value = true; error.value = ""; reviewed.value = false; inspected.value = false;
  summary.value = undefined; trialLabelRows.value = undefined;
  try {
    trial.value = await trialScheme(attempt.schemeId, attempt.revision, attempt.conversationIds, attempt.requestId,
      attempt.variantCode, attempt.runCount, attempt.confidenceThreshold);
    pendingTrial.value = undefined;
    trials.value = [trial.value, ...trials.value];
    trial.value = await runTask(trial.value.id);
    message.success("试跑已提交，请刷新进度并查看结果后发布。");
  } catch (reason) { fail(reason); } finally { busy.value = false; }
}
function abandonTrialRequest() {
  pendingTrial.value = undefined;
  error.value = "已放弃本次创建重试。任务可能已经创建，请先刷新试跑记录，再重新选择会话。";
}
function frozenTrialVariant(task: InspectionTask) {
  try {
    const snapshot = JSON.parse(task.ruleSnapshotJson || "{}").schemeSnapshot;
    const code = snapshot?.selectedVariantCode;
    if (!code) return undefined;
    const variant = snapshot.release?.definition?.executionVariants?.variants?.find((item: { code: string }) => item.code === code);
    return variant?.name ? `${variant.name} · ${code}` : code;
  } catch { return undefined; }
}
async function retryStart() {
  if (!trial.value) return;
  busy.value = true; error.value = "";
  try {
    trial.value = await getTask(trial.value.id);
    if (trial.value.status === "CREATED") trial.value = await runTask(trial.value.id);
  } catch (reason) { fail(reason); } finally { busy.value = false; }
}
async function publish() {
  if (!trialTarget.value || !trial.value || trial.value.status !== "SUCCEEDED" || !reviewed.value || !inspected.value
    || revision(trial.value) !== trialTarget.value.draftRevision) return;
  busy.value = true; error.value = "";
  try {
    const result = await publishScheme(trialTarget.value.id, trialTarget.value.draftRevision, trial.value.id, reviewed.value);
    trialOpen.value = false; message.success(`已发布 V${result.versionNo}，质检人员可在业务模板中使用。`); await refresh();
  } catch (reason) { fail(reason); } finally { busy.value = false; }
}
onMounted(refresh);
</script>
<template>
  <section class="page-intro"><div><span class="section-kicker">BUSINESS STANDARDS</span><h2>业务方案 · 专家维护</h2><p>编排质检项与独立评分，试跑并确认后发布为普通用户可直接使用的模板。</p></div><a-space><a-button @click="refresh">刷新</a-button><a-button type="primary" @click="openEditor()">新建业务方案</a-button></a-space></section>
  <a-alert v-if="error && !editorOpen && !trialOpen" :message="error" type="error" show-icon style="margin-bottom: 16px" />
  <a-table row-key="id" :data-source="schemes" :columns="columns" :loading="loading">
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'release'">{{ record.activePublishedVersion ? `V${record.activePublishedVersion}` : '未发布' }}</template>
      <template v-if="column.key === 'origin'">{{ record.sourceSchemeId ? `${record.sourceSchemeName || record.sourceSchemeCode || record.sourceSchemeId} · V${record.sourceVersionNo}` : '独立创建' }}</template>
      <template v-if="column.key === 'availability'"><a-tag :color="record.status === 'ACTIVE' ? 'green' : 'default'">{{ record.status === 'ACTIVE' ? '启用' : record.status === 'DISABLED' ? '已停用' : '状态异常' }}</a-tag></template>
      <a-button v-if="column.key === 'actions' && can('iqc:scheme:manage')" type="link" @click="openHistory(record)">发布历史</a-button>
      <a-space v-if="column.key === 'actions'"><a-button type="link" :disabled="busy" @click="openEditor(record)">编辑草稿</a-button><a-button type="link" :disabled="busy || record.status !== 'ACTIVE'" @click="check(record)">检查依赖</a-button><a-tag v-if="draftHasLabels(record)" color="blue">联合输出</a-tag><a-tag v-if="draftHasConditions(record)" color="blue">条件适用</a-tag><a-button type="link" :disabled="busy || record.status !== 'ACTIVE'" @click="openTrials(record)">{{ draftHasLabels(record) ? '联合试跑' : draftHasConditions(record) ? '条件试跑' : '试跑与发布' }}</a-button><a-button v-if="can('iqc:scheme:publish')" type="link" :danger="record.status === 'ACTIVE'" :disabled="busy || !['ACTIVE', 'DISABLED'].includes(record.status)" @click="confirmAvailability(record)">{{ record.status === 'DISABLED' ? '恢复模板' : '停用模板' }}</a-button></a-space>
    </template>
  </a-table>
  <a-drawer v-model:open="editorOpen" :title="editing ? `编辑草稿 · 修订 ${editing.draftRevision}` : '新建业务方案'" width="1000" :closable="!busy" :mask-closable="!busy" :keyboard="!busy">
    <a-alert v-if="editing?.sourceSchemeId" :message="`此草稿派生自 ${editing.sourceSchemeName || editing.sourceSchemeCode || editing.sourceSchemeId} V${editing.sourceVersionNo}。后续修改与发布独立，不会改变来源模板。`" type="info" show-icon style="margin-bottom: 12px" />
    <a-alert v-if="form.definition.executionVariants" message="已启用允许策略变体。每种方案必须覆盖全部质检项；发布后可在普通任务向导选择本次执行方案，推荐方案会作为默认值。任务和重试会冻结所选方案。" type="info" show-icon style="margin-bottom: 12px" />
    <a-alert v-if="error" :message="error" type="error" show-icon style="margin-bottom: 16px" />
    <a-alert message="这里维护业务检查标准，不修改底层规则。草稿修改不影响已发布模板和历史任务。" type="info" show-icon style="margin-bottom: 16px" />
    <a-form layout="vertical" :disabled="busy">
      <a-row :gutter="16"><a-col :span="8"><a-form-item label="方案名称" required><a-input v-model:value="form.name" :maxlength="100" /></a-form-item></a-col><a-col :span="8"><a-form-item label="唯一编码（字母、数字、_、-）" required><a-input v-model:value="form.code" :maxlength="64" :disabled="!!editing" /></a-form-item></a-col><a-col :span="8"><a-form-item label="业务场景" required><a-input v-model:value="form.businessScene" :maxlength="100" placeholder="例如：电话销售" /></a-form-item></a-col></a-row>
      <a-form-item label="模板使用说明"><a-textarea v-model:value="form.description" :maxlength="1000" :rows="2" /></a-form-item>
      <h3>运行约束</h3>
      <a-checkbox :checked="!!form.definition.runLimits" @change="(event: { target: { checked: boolean } }) => { if (event.target.checked) form.definition.runLimits = { maxConversations: 1000, defaultConcurrency: 1, maxConcurrency: 1 }; else delete form.definition.runLimits; }">配置模板运行上限</a-checkbox>
      <p>发布后生效，不改变历史任务。未配置时沿用系统上限（1000 会话、最大并发 32），普通向导仍默认串行。</p>
      <a-row v-if="form.definition.runLimits" :gutter="16">
        <a-col :span="8"><a-form-item label="每批会话上限"><a-input-number v-model:value="form.definition.runLimits.maxConversations" :min="1" :max="1000" :precision="0" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="默认并发"><a-input-number v-model:value="form.definition.runLimits.defaultConcurrency" :min="1" :max="form.definition.runLimits.maxConcurrency" :precision="0" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="最大并发"><a-input-number v-model:value="form.definition.runLimits.maxConcurrency" :min="1" :max="32" :precision="0" /></a-form-item></a-col>
      </a-row>
      <h3>质检项与检测依据</h3>
      <a-alert v-if="!form.definition.items.length" type="info" message="可只选择下方画像标签进行无评分试跑和发布；标签识别独立于质检评分。" style="margin-bottom: 12px" />
      <a-card v-for="(item, index) in form.definition.items" :key="item.itemCode" :data-scheme-item-code="item.itemCode" size="small" style="margin-bottom: 12px" :title="`质检项 ${index + 1}`">
        <template #extra><a-button danger type="link" :disabled="busy || (!!form.definition.executionVariants && form.definition.items.length <= 1)" @click="removeItem(item)">移除</a-button></template>
        <a-row :gutter="12"><a-col :span="8"><a-form-item label="业务名称" required><a-input v-model:value="item.name" :maxlength="100" placeholder="如：是否完整介绍费用" /></a-form-item></a-col><a-col :span="10"><a-form-item label="已有检测规则" required><a-select :value="item.rule.id || undefined" show-search option-filter-prop="label" :options="ruleOptions" @change="(id: unknown) => selectRule(item, String(id))" /></a-form-item></a-col><a-col :span="6"><a-form-item label="已发布版本" required><a-select v-model:value="item.rule.versionNo" :options="(versions[item.rule.id] || []).map(v => ({ label: `V${v.versionNo} · ${v.name}`, value: v.versionNo }))" /></a-form-item></a-col></a-row>
        <a-form-item label="检测命中时的业务含义"><a-radio-group v-model:value="item.hitMeaning"><a-radio value="VIOLATION">不满足（如：发现违禁词）</a-radio><a-radio value="COMPLIANCE">满足（如：完成必要告知）</a-radio></a-radio-group></a-form-item>
        <a-form-item v-if="!form.definition.executionVariants" label="逐项执行路线（专家试跑）">
          <a-select :value="item.execution?.route ?? 'LEGACY'" :options="[{ label: '保持原有配置（兼容）', value: 'LEGACY' }, ...executionRouteOptions]" @change="(route: unknown) => setRoute(item, route)" />
          <p v-if="item.execution">上方检测规则负责最终裁决；中间命中不直接计分。发布后按冻结路线执行，可与适用条件和独立联合标签组合。</p>
        </a-form-item>
        <template v-if="!form.definition.executionVariants && (item.execution?.prefilter || item.execution?.candidate)">
          <a-row :gutter="12">
            <a-col :span="16"><a-form-item :label="item.execution.prefilter ? '普通规则初筛依据' : 'LLM 候选提取依据'" required><a-select :value="(item.execution.prefilter ?? item.execution.candidate)?.id || undefined" show-search option-filter-prop="label" :options="ruleOptions.filter(option => option.value !== item.rule.id)" @change="(id: unknown) => selectStage(item, String(id))" /></a-form-item></a-col>
            <a-col :span="8"><a-form-item label="阶段已发布版本" required><a-select v-if="item.execution.prefilter" v-model:value="item.execution.prefilter.versionNo" :options="(versions[item.execution.prefilter.id] || []).map(v => ({ label: `V${v.versionNo} · ${v.name}`, value: v.versionNo }))" /><a-select v-else-if="item.execution.candidate" v-model:value="item.execution.candidate.versionNo" :options="(versions[item.execution.candidate.id] || []).map(v => ({ label: `V${v.versionNo} · ${v.name}`, value: v.versionNo }))" /></a-form-item></a-col>
          </a-row>
          <a-form-item v-if="item.execution.prefilter" label="初筛覆盖承诺" required><a-checkbox v-model:checked="item.execution.prefilterCoversViolation">已确认初筛覆盖全部目标违规；未命中可跳过复核</a-checkbox></a-form-item>
          <a-alert v-else message="普通规则只验证模型引用的真实候选片段，不回退检查整段原文；候选捏造或不完整时保持待复核。" type="info" show-icon />
          <a-form-item v-if="item.execution.candidate" label="候选 LLM 输入范围（专家试跑）">
            <a-select :value="item.execution.stageInputScope ?? 'LEGACY'" :options="[{ label: '保持候选规则原有范围', value: 'LEGACY' }, { label: '单条消息', value: 'MESSAGE' }, { label: '完整会话', value: 'CONVERSATION' }]" @change="(scope: unknown) => setStageInputScope(item, scope)" />
            <p>只影响候选提取阶段，不改变最终普通规则的片段验证范围；旧配置不自动补写。</p>
          </a-form-item>
        </template>
        <a-form-item v-if="isLlmItem(item) || item.inputScope != null" label="LLM 输入范围（专家试跑）">
          <a-select :value="item.inputScope ?? 'LEGACY'" :options="[{ label: '保持原有范围（兼容）', value: 'LEGACY' }, { label: '单条消息', value: 'MESSAGE' }, { label: '完整会话', value: 'CONVERSATION' }]" @change="(scope: unknown) => setInputScope(item, scope)" />
          <p>单条消息逐条判断；完整会话结合上下文判断。旧配置不会自动改为完整会话。逐项路线按冻结上下文分别执行，仅相同上下文共享检测；兼容配置仍不能混用范围。</p>
        </a-form-item>
        <a-form-item label="适用条件（可选）">
          <a-checkbox :checked="!!item.appliesWhen" @change="(event: { target: { checked: boolean } }) => toggleApplicability(item, event.target.checked)">仅在业务条件明确命中时检查本项</a-checkbox>
          <p v-if="!item.appliesWhen">无额外适用条件，按检测规则的会话与说话人范围评估。</p>
          <template v-else>
            <a-row :gutter="12" style="margin-top: 12px">
              <a-col :span="16"><a-form-item label="条件检测规则" required><a-select :value="item.appliesWhen.id || undefined" show-search option-filter-prop="label" :options="ruleOptions.filter(option => option.value !== item.rule.id)" @change="(id: unknown) => selectApplicability(item, String(id))" /></a-form-item></a-col>
              <a-col :span="8"><a-form-item label="条件已发布版本" required><a-select :value="item.appliesWhen.versionNo || undefined" placeholder="请选择已发布版本" @update:value="(value: number) => { if (item.appliesWhen) item.appliesWhen.versionNo = value; }" :options="(versions[item.appliesWhen.id] || []).map(v => ({ label: `V${v.versionNo} · ${v.name}`, value: v.versionNo }))" /></a-form-item></a-col>
            </a-row>
            <a-alert message="条件完整评估且未命中时，本项不适用、不计分；条件缺失、错误或争议仍待确认，不能当成不适用。所有评分项不适用时无分数，不是满分。条件结果纳入冻结任务与证据；不会提前跳过检测调用。" type="warning" show-icon />
          </template>
        </a-form-item>
        <a-space><a-checkbox :checked="!!scoreFor(item)" @change="(event: { target: { checked: boolean } }) => toggleScore(item, event.target.checked)">参与评分</a-checkbox><template v-if="scoreFor(item)"><span>{{ form.definition.scoring.mode === 'POINTS' ? '满足时得分权重' : '不满足时扣分' }}</span><a-input-number v-model:value="scoreFor(item)!.points" :min="form.definition.scoring.mode === 'POINTS' ? 1 : 0" :max="100" :precision="0" /><a-checkbox v-model:checked="scoreFor(item)!.veto">不满足时一票否决</a-checkbox></template></a-space>
      </a-card>
      <a-button block :disabled="form.definition.items.length >= 200" @click="addItem">添加质检项</a-button>
      <p v-if="form.definition.executionVariants && form.definition.items.length === 1">策略变体至少需要一个质检项；如需移除最后一项，请先关闭策略变体。</p>
      <h3 style="margin-top: 24px">允许策略变体（可选）</h3>
      <a-checkbox :checked="!!form.definition.executionVariants" :disabled="!form.definition.executionVariants && !form.definition.items.length"
        @change="(event: { target: { checked: boolean } }) => setVariantsEnabled(event.target.checked)">为质检项配置多种经批准的执行路线</a-checkbox>
      <p>每种方案须完整覆盖全部质检项，并说明覆盖范围及成本/耗时差异。试跑和普通任务均可选其中一种；选择与推荐编码会冻结到任务和重试请求。</p>
      <template v-if="form.definition.executionVariants">
        <a-card v-for="variant in form.definition.executionVariants.variants" :key="variant.code" :data-variant-code="variant.code"
          size="small" style="margin-bottom: 12px" :title="variant.name || variant.code || '未命名方案'">
          <template #extra><a-space><a-tag v-if="form.definition.executionVariants.recommendedCode === variant.code" color="green">推荐</a-tag>
            <a-button v-else type="link" @click="recommendVariant(variant)">设为推荐</a-button>
            <a-button type="link" @click="toggleVariantEditor(variant)">{{ expandedVariantCode === variant.code ? '收起逐项路线' : '编辑逐项路线' }}</a-button>
            <a-button danger type="link" :disabled="form.definition.executionVariants.variants.length <= 1" @click="removeVariant(variant)">移除方案</a-button></a-space></template>
          <a-row :gutter="12"><a-col :span="6"><a-form-item label="稳定编码" required><a-input :value="variant.code" :maxlength="64" placeholder="字母、数字、_、-" @update:value="(code: string) => updateVariantCode(variant, code)" /></a-form-item></a-col>
            <a-col :span="6"><a-form-item label="方案名称" required><a-input v-model:value="variant.name" :maxlength="100" /></a-form-item></a-col>
            <a-col :span="6"><a-form-item label="覆盖范围说明" required><a-input v-model:value="variant.coverage" :maxlength="1000" /></a-form-item></a-col>
            <a-col :span="6"><a-form-item label="成本与耗时说明" required><a-input v-model:value="variant.cost" :maxlength="1000" /></a-form-item></a-col></a-row>
          <template v-if="expandedVariantCode === variant.code">
          <a-card v-for="item in form.definition.items" :key="`${variant.code}:${item.itemCode}`" :data-route-item-code="item.itemCode"
            size="small" style="margin-bottom: 8px" :title="`${item.name || item.itemCode} · ${item.itemCode}`">
            <a-form-item label="该方案的执行路线" required><a-select :value="variantExecution(variant, item).route" :options="executionRouteOptions"
              @change="(route: unknown) => setVariantRoute(variant, item, route)" /></a-form-item>
            <template v-if="variantExecution(variant, item).prefilter || variantExecution(variant, item).candidate">
              <a-row :gutter="12"><a-col :span="16"><a-form-item :label="variantExecution(variant, item).prefilter ? '普通规则初筛依据' : 'LLM 候选提取依据'" required>
                <a-select :value="(variantExecution(variant, item).prefilter ?? variantExecution(variant, item).candidate)?.id || undefined" show-search option-filter-prop="label"
                  :options="ruleOptions.filter(option => option.value !== item.rule.id)" @change="(id: unknown) => selectVariantStage(variant, item, String(id))" />
              </a-form-item></a-col><a-col :span="8"><a-form-item label="阶段已发布版本" required>
                <a-select v-if="variantExecution(variant, item).prefilter" v-model:value="variantExecution(variant, item).prefilter!.versionNo"
                  :options="(versions[variantExecution(variant, item).prefilter!.id] || []).map(v => ({ label: `V${v.versionNo} · ${v.name}`, value: v.versionNo }))" />
                <a-select v-else-if="variantExecution(variant, item).candidate" v-model:value="variantExecution(variant, item).candidate!.versionNo"
                  :options="(versions[variantExecution(variant, item).candidate!.id] || []).map(v => ({ label: `V${v.versionNo} · ${v.name}`, value: v.versionNo }))" />
              </a-form-item></a-col></a-row>
              <a-form-item v-if="variantExecution(variant, item).prefilter" label="初筛覆盖承诺" required>
                <a-checkbox v-model:checked="variantExecution(variant, item).prefilterCoversViolation">已确认初筛覆盖全部目标违规；未命中可跳过复核</a-checkbox>
              </a-form-item>
              <a-alert v-else message="普通规则仅验证模型引用的真实候选片段；候选捏造或不完整时保持待复核。" type="info" show-icon />
              <a-form-item v-if="variantExecution(variant, item).candidate" label="候选 LLM 输入范围（专家试跑）">
                <a-select :value="variantExecution(variant, item).stageInputScope ?? 'LEGACY'"
                  :options="[{ label: '保持候选规则原有范围', value: 'LEGACY' }, { label: '单条消息', value: 'MESSAGE' }, { label: '完整会话', value: 'CONVERSATION' }]"
                  @change="(scope: unknown) => setVariantStageInputScope(variant, item, scope)" />
              </a-form-item>
            </template>
          </a-card>
          </template>
        </a-card>
        <a-button block :disabled="form.definition.executionVariants.variants.length >= 20 || !form.definition.items.length" @click="addVariant">添加允许策略变体</a-button>
      </template>
      <h3 style="margin-top: 24px">会话画像标签（可选）</h3>
      <a-alert message="选择已发布的明确主体标签并冻结当前版本。试跑时核对评分、标签状态与证据；标签结论独立于质检评分。路线、条件和策略变体可与联合标签组合。" type="info" show-icon style="margin-bottom: 12px" />
      <a-alert v-if="labelLoadWarning" :message="labelLoadWarning" type="warning" show-icon style="margin-bottom: 12px" />
      <a-form-item label="需要识别的标签">
        <a-select mode="multiple" :disabled="!!labelLoadWarning" :value="form.definition.labels?.map(label => label.id) || []" :options="labelOptions" option-filter-prop="label" placeholder="例如：贷款意向、有房有车" @change="(ids: unknown) => selectLabels(ids as string[])" />
        <p v-if="form.definition.labels?.length">已冻结 {{ form.definition.labels.length }} 个标签版本；标签更新后需重新选择、检查并试跑。</p>
        <p v-if="form.definition.labels?.some(label => !publishedLabels.some(item => item.id === label.id && item.versionNo === label.versionNo))">部分历史标签版本已不在当前发布目录中；保存草稿会保留原引用，但依赖检查可能不通过。</p>
      </a-form-item>
      <h3 style="margin-top: 24px">独立评分政策</h3>
      <a-row :gutter="16"><a-col :span="8"><a-form-item label="评分方式"><a-select v-model:value="form.definition.scoring.mode" :options="[{ label: '扣分制', value: 'DEDUCTION' }, { label: '得分制（归一为百分制）', value: 'POINTS' }]" /></a-form-item></a-col><a-col :span="8"><a-form-item label="基础分（扣分制）"><a-input-number v-model:value="form.definition.scoring.baseScore" :min="1" :max="100" :precision="0" :disabled="form.definition.scoring.mode === 'POINTS'" /></a-form-item></a-col><a-col :span="8"><a-form-item label="合格分数"><a-input-number v-model:value="form.definition.scoring.passingScore" :min="0" :max="form.definition.scoring.mode === 'POINTS' ? 100 : form.definition.scoring.baseScore" :precision="0" /></a-form-item></a-col></a-row>
      <a-alert v-if="!form.definition.scoring.items.length" type="info" :message="form.definition.items.length ? '所有质检项均不计分：仅展示检查结论与证据，不生成假定满分。' : '仅识别标签：没有质检项与最终分数，不显示默认 100 分。'" />
      <h3 style="margin-top: 24px">LLM 检测能力（仅包含 LLM 规则时需要）</h3>
      <a-alert v-if="needsLlm" message="检测规则或适用条件包含 LLM，请选择已发布的 3.0 能力型智能体。执行策略由任务快照管理。" type="info" style="margin-bottom: 12px" />
      <a-alert v-else-if="form.definition.labels?.length" message="若所选标签绑定 LLM 规则，也需选择智能体；保存后可用依赖检查确认具体要求。" type="info" style="margin-bottom: 12px" />
      <a-row :gutter="16"><a-col :span="16"><a-form-item label="智能体"><a-select :value="form.definition.agent?.id" allow-clear :options="agents.filter(a => a.status !== 'DISABLED').map(a => ({ label: a.name, value: a.id }))" @change="(id: unknown) => selectAgent(id ? String(id) : undefined)" /></a-form-item></a-col><a-col :span="8"><a-form-item label="已发布能力版本"><a-select v-if="form.definition.agent" v-model:value="form.definition.agent.versionNo" :options="agentVersions.map(v => ({ label: `V${v.versionNo}`, value: v.versionNo }))" /></a-form-item></a-col></a-row>
    </a-form>
    <template #footer><a-space style="float: right"><a-button :disabled="busy" @click="editorOpen = false">取消</a-button><a-button type="primary" :loading="busy" @click="save">保存草稿</a-button></a-space></template>
  </a-drawer>
  <a-modal v-model:open="trialOpen" :title="`${trialTarget?.name || ''} · ${trialTarget && draftHasLabels(trialTarget) ? '联合试跑' : trialTarget && draftHasConditions(trialTarget) ? '条件试跑' : '试跑与发布'}`" :width="960" :footer="null" :mask-closable="!busy" :closable="!busy" :keyboard="!busy">
    <a-alert v-if="error" :message="error" type="error" show-icon style="margin-bottom: 12px" />
    <a-alert message="选择有代表性的样本。发布要求执行完整且无错误/待复核项；样本业务不合格不影响发布。专家须查看完整结果和证据，确认业务判断、标签与评分符合预期。" type="info" show-icon style="margin-bottom: 16px" />
    <a-alert v-if="trialTarget && draftHasLabels(trialTarget)" message="联合输出：请核对评分、每个标签值的已知/未知/冲突/错误状态及原文证据；标签结论独立于评分。" type="info" show-icon style="margin-bottom: 16px" />
    <a-alert v-if="trialTarget && draftHasConditions(trialTarget)" message="请分别核对条件命中、未命中和异常样本；不适用项不计分，条件异常不能当成通过或不适用。" type="info" show-icon style="margin-bottom: 16px" />
    <a-alert v-if="trialTarget && draftHasInputScope(trialTarget)" message="请核对完整会话和单消息判断的差异；没有模型引文时不能把每条消息当作命中证据。" type="info" show-icon style="margin-bottom: 16px" />
    <a-alert v-if="trialTarget && draftHasRoutes(trialTarget)" message="请核对适用条件、阶段结果、最终判定与独立评分；联合标签单独执行并保留证据。" type="info" show-icon style="margin-bottom: 16px" />
    <section v-if="trialVariants" style="margin-bottom: 16px">
      <a-alert message="每种方案均检查全部质检项，独立评分和联合标签规则不变；所选方案会冻结到试跑任务。" type="info" show-icon />
      <a-form-item v-if="trialVariants.variants.length > 1" label="本次试跑方案" style="margin-top: 12px">
        <a-select :value="trialVariantCode" :disabled="busy || !!pendingTrial" :options="trialVariants.variants.map(item => ({ value: item.code,
          label: `${item.name}${item.code === trialVariants?.recommendedCode ? '（推荐）' : ''}` }))" @change="(code: unknown) => trialVariantCode = String(code)" />
      </a-form-item>
      <p v-if="trialVariant">{{ trialVariant.name }} · 覆盖：{{ trialVariant.coverage }} · 成本与耗时：{{ trialVariant.cost }}</p>
    </section>
    <section v-if="trialTarget && (draftHasRoutes(trialTarget) || trialVariants)" style="margin-bottom: 16px">
      <a-alert message="多轮会分别重跑完整路线并逐项投票；平票、阶段错误或低于一致率门槛会标记待复核，不按未命中处理。" type="info" show-icon />
      <a-row :gutter="16" style="margin-top: 8px">
        <a-col :span="12"><a-form-item label="完整路线运行次数"><a-input-number v-model:value="trialRunCount" :min="1" :max="5" :precision="0" :disabled="busy || !!pendingTrial" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="最低一致率（可选）"><a-input-number v-model:value="trialConfidenceThreshold" :min="0" :max="1" :step="0.05" :precision="2" :disabled="busy || !!pendingTrial || trialRunCount <= 1" placeholder="多轮时可设置" style="width: 100%" /></a-form-item></a-col>
      </a-row>
    </section>
    <p>本次最多 {{ trialMax }} 个会话，试跑固定串行。</p>
    <ConversationPicker v-model="trialIds" :max="trialMax" :disabled="busy || !!pendingTrial" />
    <a-alert v-if="pendingTrial" :message="`上次创建尚未确认。重试会固定相同请求标识、会话、${pendingTrial.runCount} 轮及策略变体；若需修改，请先放弃并刷新试跑记录。`" type="warning" show-icon />
    <a-space style="margin: 16px 0"><a-button type="primary" :loading="busy" :disabled="(!trialIds.length && !pendingTrial) || !can('iqc:task:execute')" @click="startTrial">{{ pendingTrial ? '重试创建本次试跑' : '创建并执行当前草稿试跑' }}</a-button><a-button v-if="pendingTrial" :disabled="busy" @click="abandonTrialRequest">放弃本次创建重试</a-button><a-button :disabled="busy" @click="refreshTrials">刷新试跑记录</a-button></a-space>
    <a-select :value="trial?.id" placeholder="选择已有试跑（保留最近 20 条）" style="width: 100%; margin-bottom: 16px" :disabled="busy"
      :options="trials.map(t => ({ label: `修订 ${revision(t) ?? '?'} · ${t.status} · ${t.createdTime || t.id}`, value: t.id }))" @change="(id: unknown) => selectTrial(String(id))" />
    <template v-if="trial">
      <p>试跑 {{ trial.id }} · 草稿修订 {{ revision(trial) }} · 状态 {{ trial.status }}</p>
      <p v-if="frozenTrialVariant(trial)">冻结试跑方案：{{ frozenTrialVariant(trial) }}</p>
      <a-space style="margin-bottom: 16px"><a-button :disabled="busy" @click="selectTrial(trial.id)">刷新进度与结果</a-button><a-button v-if="trial.status === 'CREATED' && can('iqc:task:execute')" :disabled="busy" @click="retryStart">启动已有试跑</a-button><router-link v-if="can('iqc:result:view')" :to="{ path: '/results', query: { taskId: trial.id } }" target="_blank" @click="inspected = true">打开完整结果与证据 ↗</router-link><router-link v-if="trialHasLabels(trial) && can('iqc:result:view')" :to="{ path: '/tasks', query: { taskId: trial.id, view: 'results' } }" target="_blank">查看洞察标签与状态 ↗</router-link></a-space>
      <a-table v-if="summary" row-key="conversationId" :data-source="summary.conversations" :columns="trialColumns" size="small" :pagination="false"><template #bodyCell="{ column, record }"><template v-if="column.dataIndex === 'scoreStatus' && trialOnlyLabels(trial)">仅识别标签</template><template v-else-if="column.dataIndex === 'averageScore'">{{ record.averageScore == null ? '—' : record.averageScore }}</template><template v-else-if="column.dataIndex === 'hitCount' && trialOnlyLabels(trial)">—</template></template></a-table>
      <section v-if="trialLabelSummary" style="margin-top: 16px">
        <h3>标签结果覆盖</h3>
        <a-space style="margin-bottom: 12px"><a-tag>已生成 {{ trialLabelSummary.received }} / 预期 {{ trialLabelSummary.expected }} 个标签值结果</a-tag><a-tag color="blue">确定 {{ trialLabelSummary.counts.KNOWN }}</a-tag><a-tag>未知 {{ trialLabelSummary.counts.UNKNOWN }}</a-tag><a-tag color="orange">冲突 {{ trialLabelSummary.counts.CONFLICT }}</a-tag><a-tag color="red">错误 {{ trialLabelSummary.counts.ERROR }}</a-tag></a-space>
        <a-alert v-if="trialLabelSummary.invalid" message="标签结果格式或冻结试跑范围异常，请检查结果、快照及重复或越界记录。" type="error" show-icon />
        <a-alert v-else-if="!trialLabelSummary.complete" :message="trial.status === 'SUCCEEDED' ? '试跑已结束，但部分标签值结果缺失，请检查任务结果。' : '标签结果尚未生成完整，请刷新进度与结果。'" type="warning" show-icon />
        <a-alert v-else-if="trialLabelSummary.counts.ERROR" message="标签结果已生成，但存在识别错误；请修复配置并重新试跑，错误标签不能发布。" type="warning" show-icon />
        <p>这里只展示覆盖数量和状态分布；确定结果包含明确否认。逐值结论、主体、原因与原文证据请打开“洞察标签”。</p>
      </section>
      <a-alert v-if="revision(trial) !== trialTarget?.draftRevision" message="此试跑不是当前草稿，请重新试跑。" type="warning" />
      <p v-if="trialTarget"><a-checkbox v-model:checked="reviewed" :disabled="busy || !inspected || !trialReadyToPublish">我已查看试跑结果与证据，确认业务判断和评分符合预期</a-checkbox></p>
      <a-button v-if="can('iqc:scheme:publish') && trialTarget" type="primary" :loading="busy" :disabled="!reviewed || !inspected || !trialReadyToPublish" @click="publish">发布为业务模板</a-button>
    </template>
  </a-modal>
  <a-modal :open="historyOpen" :title="`发布历史：${historyTarget?.name || ''}`" :width="900" :footer="null" @cancel="closeHistory">
    <a-alert message="以下是不可变的已发布标准。归档只影响普通用户的新选择，不删除快照、不影响已有任务或当前发布指针；有发布权限时可归档或恢复已被取代的版本，有创建权限时可从可用版本派生独立草稿。" type="info" show-icon style="margin-bottom: 16px" />
    <a-alert v-if="historyTarget?.sourceSchemeId" :message="`此方案来源于 ${historyTarget.sourceSchemeName || historyTarget.sourceSchemeCode || historyTarget.sourceSchemeId} V${historyTarget.sourceVersionNo} · 摘要 ${historyTarget.sourceContentHash || '未记录'}`" type="info" show-icon style="margin-bottom: 12px; overflow-wrap: anywhere" />
    <a-alert v-if="historyError" :message="historyError" type="error" show-icon style="margin-bottom: 12px" />
    <a-spin :spinning="historyLoading">
      <div class="scheme-history-list" tabindex="0" role="region" aria-label="已发布版本列表">
      <a-list v-if="historyVersions.length" :data-source="historyVersions" bordered>
        <template #renderItem="{ item }"><a-list-item>
          <a-list-item-meta :title="`V${item.versionNo} · ${item.snapshot.name}${item.archived ? ' · 已归档' : ''}`">
            <template #description><p>来源草稿修订：{{ item.sourceDraftRevision ?? '未记录' }} · 来源试跑：{{ item.sourceTrialTaskId || '未记录' }}</p><p style="overflow-wrap: anywhere">内容摘要：{{ item.contentHash }}</p></template>
          </a-list-item-meta>
          <template #extra><a-space direction="vertical"><a-tag v-if="historyTarget?.status === 'ACTIVE' && historyTarget.activePublishedVersion === item.versionNo" color="green">当前发布版本</a-tag><a-tag v-if="item.archived" color="default">已归档（快照保留）</a-tag><a-tag v-if="historyCompareBase?.versionNo === item.versionNo" color="blue">对比基准</a-tag><a-button @click="previewHistory(item)">查看冻结标准</a-button><a-button v-if="historyCompareBase?.versionNo !== item.versionNo" @click="historyCompareBase ? compareHistory(item) : historyCompareBase = item">{{ historyCompareBase ? '与基准对比' : '设为对比基准' }}</a-button><a-button v-else @click="historyCompareBase = undefined">取消基准</a-button><a-button v-if="can('iqc:scheme:publish') && historyTarget?.activePublishedVersion != null && item.versionNo < historyTarget.activePublishedVersion" :disabled="busy || historyLoading" @click="confirmVersionArchive(item)">{{ item.archived ? '恢复为可选历史版本' : '归档版本' }}</a-button><a-button v-if="can('iqc:scheme:create')" :disabled="busy || historyTarget?.status !== 'ACTIVE' || item.archived" @click="beginDerive(item)">基于此版本派生</a-button></a-space></template>
        </a-list-item></template>
      </a-list>
      <a-empty v-if="!historyLoading && !historyError && !historyVersions.length" description="此方案尚无发布版本；草稿和试跑不是已发布标准。" />
      </div>
    </a-spin>
    <a-space style="margin-top: 16px"><a-button v-if="historyError" :disabled="historyLoading" @click="loadHistory(historyVersions.length ? nextBeforeVersion ?? undefined : undefined)">重试加载</a-button><a-button v-else-if="nextBeforeVersion" :loading="historyLoading" @click="loadHistory(nextBeforeVersion)">加载更早版本</a-button><a-button @click="closeHistory">关闭历史</a-button></a-space>
  </a-modal>
  <a-modal v-model:open="deriveOpen" title="基于冻结版本派生业务方案" :confirm-loading="busy" :mask-closable="!busy" :closable="!busy" :keyboard="!busy" @ok="submitDerive" @cancel="closeDerive">
    <a-alert v-if="deriveSourceVersion" :message="`来源：${deriveSourceVersion.snapshot.name} V${deriveSourceVersion.versionNo} · ${deriveSourceVersion.contentHash}`" type="info" show-icon style="margin-bottom: 16px; overflow-wrap: anywhere" />
    <a-alert v-if="deriveError" :message="deriveError" type="error" show-icon style="margin-bottom: 12px" />
    <a-form layout="vertical" :disabled="busy">
      <a-form-item label="新方案名称" required><a-input v-model:value="deriveName" :maxlength="100" /></a-form-item>
      <a-form-item label="新方案唯一编码" required><a-input v-model:value="deriveCode" :maxlength="64" /></a-form-item>
      <a-form-item label="派生说明"><a-textarea v-model:value="deriveDescription" :maxlength="1000" :rows="3" /></a-form-item>
    </a-form>
    <p>服务端会从该不可变发布快照复制标准和依赖版本，并保存来源方案、版本及内容摘要。新草稿可以独立修改；不会继承来源的后续变更，也不会自动试跑或发布。</p>
  </a-modal>
  <a-modal :open="!!historyComparePair" :title="historyComparePair ? `冻结标准差异：V${historyComparePair.before.versionNo} → V${historyComparePair.after.versionNo}` : '冻结标准差异'" :width="1000" :footer="null" @cancel="historyComparePair = undefined">
    <a-alert message="仅比较两个已发布版本的冻结业务标准；不比较当前草稿，不切换模板或重新计算历史结果。规则与标签的技术标识仅用于追溯。" type="info" show-icon style="margin-bottom: 16px" />
    <a-empty v-if="!historyDiffRows.length" description="这两个版本的可比较业务字段一致；内容摘要可能仍因其他冻结元数据而不同。" />
    <a-table v-else :columns="historyDiffColumns" :data-source="historyDiffRows" :pagination="{ pageSize: 12 }" :scroll="{ x: 720 }" row-key="key" size="small" />
    <a-button style="margin-top: 16px" @click="historyComparePair = undefined">关闭对比</a-button>
  </a-modal>
  <SchemeTaskWizard v-if="historyPreview" :key="`${historyPreview.schemeId}:${historyPreview.versionNo}`" :template="historyPreview" read-only @close="historyPreview = undefined" />
</template>

<style scoped>
.scheme-history-list {
  max-height: min(54vh, 480px);
  overflow-y: auto;
  overflow-wrap: anywhere;
}
</style>
