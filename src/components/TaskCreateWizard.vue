<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { isAxiosError } from "axios";
import { createTask, type InspectionTask, type TaskDataSelection, type TaskEngineConfiguration, type TaskResultProcessingConfiguration } from "@/api/tasks";
import type { QualityAgent, QualityRule } from "@/api/config";
import { getLabelDetail, type LabelDetail } from "@/api/labels";
import TaskDataSelector from "./TaskDataSelector.vue";
import TaskEngineSelector from "./TaskEngineSelector.vue";
import TaskResultProcessingEditor from "./TaskResultProcessingEditor.vue";
import { resultTargets, type ResultTarget } from "./task-result-policy";

const props = defineProps<{ agents: QualityAgent[]; rules: QualityRule[]; labelingTargets: ResultTarget[] }>();
const emit = defineEmits<{ cancel: []; created: [task: InspectionTask] }>();
const step = ref(0), name = ref(""), concurrency = ref(1), saving = ref(false), error = ref("");
const steps = ["数据筛选", "任务类型", "结果处理", "任务确认"].map(title => ({ title }));
const selection = ref<TaskDataSelection>({ mode: "BATCH", conversationIds: [] });
const engines = ref<TaskEngineConfiguration>({ schemaVersion: "iqc-task-processing-v1" });
const checks = ref<ResultTarget[]>([]), newCheck = ref("");
const labels = ref<Record<string, LabelDetail>>({}), labelErrors = ref<string[]>([]), loadingLabels = ref(false);
const engineEditor = ref<InstanceType<typeof TaskEngineSelector>>(), resultEditor = ref<InstanceType<typeof TaskResultProcessingEditor>>();
const resultConfig = ref<TaskResultProcessingConfiguration>();
const submissionUncertain = ref(false);
let generation = 0;
onBeforeUnmount(() => { generation++; });
const labelIds = computed(() => resultTargets(engines.value, "labeling"));
async function loadLabels() {
  const current = ++generation;
  loadingLabels.value = true;
  const ids = [...labelIds.value];
  const results = await Promise.allSettled(ids.map(id => getLabelDetail(id)));
  if (generation !== current) return;
  const next: Record<string, LabelDetail> = {};
  labelErrors.value = [];
  results.forEach((result, index) => {
    const id = ids[index]!;
    if (result.status === "fulfilled") next[id] = result.value;
    else labelErrors.value.push(props.labelingTargets.find(target => target.value === id)?.label || id);
  });
  labels.value = next;
  loadingLabels.value = false;
}
watch(() => [...labelIds.value].sort().join("\0"), () => { void loadLabels(); }, { immediate: true });
function addCheck() {
  const value = newCheck.value.trim();
  if (!value || value.length > 64 || checks.value.length >= 32 || checks.value.some(check => check.value === value)) {
    error.value = "质检项名称须为 1–64 字，不能重复，最多 32 项"; return;
  }
  // The readable task-local target is frozen in the existing engine and scoring snapshots, not a global catalog.
  checks.value.push({ value, label: value }); newCheck.value = ""; error.value = "";
}
function removeCheck(value: string) {
  checks.value = checks.value.filter(check => check.value !== value);
  if (engines.value.inspection) engines.value = { ...engines.value, inspection: { engines: engines.value.inspection.engines.map(engine =>
    engine.parameters.targetId === value ? { ...engine, parameters: { ...engine.parameters, targetId: undefined } } : engine) } };
}
const dataSummary = computed(() => selection.value.mode === "BATCH" ? `批量选择 ${selection.value.conversationIds?.length || 0} 个会话`
  : selection.value.mode === "RANDOM" ? `执行时随机抽样，最多 ${selection.value.sampleSize || 0} 个会话` : "执行时按条件获取全部匹配会话");
const filterFields = [{ key: "fileName", label: "文件名" }, { key: "employeeId", label: "坐席编号" }, { key: "customerExternalId", label: "客户编号" },
  { key: "channel", label: "渠道" }, { key: "businessNo", label: "业务编号" }, { key: "startedFrom", label: "会话开始时间（从）" }, { key: "startedTo", label: "会话开始时间（至）" }] as const;
const conditions = computed(() => filterFields.filter(field => selection.value.filter?.[field.key]).map(field => `${field.label}：${selection.value.filter![field.key]}`));
function validateData() {
  const value = selection.value;
  if (value.mode === "BATCH" && !value.conversationIds?.length) { error.value = "请选择至少一个会话"; return false; }
  if (value.mode === "RANDOM" && (!Number.isInteger(value.sampleSize) || value.sampleSize! < 1 || value.sampleSize! > 1000)) {
    error.value = "抽样数量须为 1–1000 的整数"; return false;
  }
  if (value.filter?.startedFrom && value.filter.startedTo && value.filter.startedFrom > value.filter.startedTo) {
    error.value = "开始时间不能晚于结束时间"; return false;
  }
  return true;
}
function validateResults() {
  if (loadingLabels.value || labelErrors.value.length) { error.value = "请先成功加载所选标签的值定义"; return false; }
  if (!resultEditor.value?.validate()) { error.value = "请完成结果处理配置"; return false; }
  resultConfig.value = resultEditor.value.getConfiguration();
  return Boolean(resultConfig.value);
}
function next() {
  error.value = "";
  if (step.value === 0 && !validateData()) return;
  if (step.value === 1 && !engineEditor.value?.validate()) { error.value = "请完成质检或打标的引擎配置"; return; }
  if (step.value === 2 && !validateResults()) return;
  step.value++;
}
async function submit() {
  if (saving.value || submissionUncertain.value) return;
  error.value = "";
  if (!validateData()) { step.value = 0; return; }
  if (!engineEditor.value?.validate()) { step.value = 1; return; }
  if (!validateResults()) { step.value = 2; return; }
  if (!name.value.trim() || name.value.trim().length > 80 || !Number.isInteger(concurrency.value) || concurrency.value < 1 || concurrency.value > 32) {
    error.value = "请填写任务名称（1–80 字），并将并发数设置为 1–32"; return;
  }
  saving.value = true;
  try {
    const { sampleSeed: _previewSeed, ...dataSelection } = selection.value;
    const task = await createTask({ name: name.value.trim(), dataSelection, processingConfiguration: engines.value,
      resultProcessing: resultConfig.value!, concurrencyLimit: concurrency.value });
    emit("created", task);
  } catch (failure) {
    submissionUncertain.value = isAxiosError(failure) && !failure.response;
    error.value = submissionUncertain.value ? "任务提交未确认，请先到任务列表核对，避免重复创建。当前填写内容保留。"
      : failure instanceof Error ? failure.message : "任务创建失败，请检查配置后重试";
  } finally { saving.value = false; }
}
function targetName(op: "inspection" | "labeling", id?: string) {
  return (op === "inspection" ? checks.value : props.labelingTargets).find(target => target.value === id)?.label || id || "未选择";
}
function mappingSummary(op: "inspection" | "labeling", instance: string) {
  const mapping = op === "inspection" ? resultConfig.value?.inspection?.checks.flatMap(check => check.engines).find(engine => engine.engineInstanceId === instance)
    : resultConfig.value?.labeling.flatMap(label => label.engines).find(engine => engine.engineInstanceId === instance);
  const display = (value: unknown) => value === null ? "未知" : value === true ? "是" : value === false ? "否" : value === "PASS" ? "通过" : value === "FAIL" ? "不通过" : String(value);
  return mapping ? `命中 → ${display(mapping.onHit)}；未命中 → ${display(mapping.onMiss)}` : "尚未配置";
}
</script>
<template>
  <a-modal :open="true" title="创建任务" width="min(1040px, calc(100vw - 32px))" :closable="!saving" :mask-closable="false" :keyboard="!saving"
    :styles="{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }" @cancel="emit('cancel')">
    <a-steps :current="step" :items="steps" size="small" class="wizard-steps" />
    <div v-show="step === 0"><TaskDataSelector v-model="selection" :disabled="saving" /></div>
    <div v-show="step === 1">
      <a-form layout="vertical"><a-form-item label="本任务的质检项"><a-space wrap>
        <a-input v-model:value="newCheck" :maxlength="64" placeholder="例如：服务用语规范" @press-enter="addCheck" />
        <a-button :disabled="saving" @click="addCheck">添加质检项</a-button>
      </a-space><p class="muted">多个引擎可选择同一质检项，后续按该项统一评分。仅打标时无需添加。</p>
        <a-tag v-for="check in checks" :key="check.value" :closable="!saving" @close="removeCheck(check.value)">{{ check.label }}</a-tag>
      </a-form-item></a-form>
      <TaskEngineSelector ref="engineEditor" v-model="engines" :rules="rules" :agents="agents" :inspection-targets="checks" :labeling-targets="labelingTargets" :disabled="saving" />
    </div>
    <div v-show="step === 2">
      <a-alert v-if="labelErrors.length" type="error" show-icon :message="`标签值定义加载失败：${labelErrors.join('、')}`"><template #action><a-button @click="loadLabels">重试</a-button></template></a-alert>
      <a-spin :spinning="loadingLabels"><TaskResultProcessingEditor ref="resultEditor" :engines="engines" :inspection-targets="checks" :labeling-targets="labelingTargets" :labels="labels" :disabled="saving || loadingLabels" /></a-spin>
    </div>
    <div v-show="step === 3">
      <a-form layout="vertical"><a-form-item label="任务名称" required><a-input v-model:value="name" :disabled="saving" :maxlength="80" placeholder="请输入任务名称" /></a-form-item>
        <a-form-item label="并发会话数" required><a-input-number v-model:value="concurrency" :disabled="saving" :min="1" :max="32" :precision="0" /></a-form-item></a-form>
      <h3>数据筛选</h3><p>{{ dataSummary }}</p><p v-for="condition in conditions" :key="condition" class="muted">{{ condition }}</p>
      <p v-if="selection.mode !== 'BATCH'" class="muted">{{ conditions.length ? '' : '未限制筛选范围；' }}执行时确定名单，数据不足时有多少处理多少。</p>
      <section v-for="op in (['inspection','labeling'] as const).filter(op => engines[op])" :key="op" class="confirmation-section">
        <h3>{{ op === 'inspection' ? '质检' : '打标' }} · 引擎执行顺序</h3>
        <ol><li v-for="engine in engines[op]!.engines" :key="engine.id">{{ engine.type }} · {{ targetName(op, engine.parameters.targetId) }} · {{ rules.find(rule => rule.id === engine.parameters.ruleId)?.name }}
          <span v-if="engine.type === 'LLM'"> · {{ agents.find(agent => agent.id === engine.parameters.agentId)?.name }}</span><p class="muted">{{ mappingSummary(op, engine.id) }}</p></li></ol>
      </section>
      <h3>结果处理</h3>
      <template v-if="resultConfig?.inspection"><p>{{ resultConfig.inspection.scoring.mode === 'DEDUCTION' ? '扣分制' : '得分制（加权百分制）' }} · 基础分 {{ resultConfig.inspection.scoring.baseScore }} · 及格线 {{ resultConfig.inspection.scoring.passingScore }}</p>
        <p v-for="item in resultConfig.inspection.scoring.items" :key="item.itemCode">{{ targetName('inspection', item.itemCode) }}：{{ item.points }} 分{{ item.veto ? '，不通过时总分为零' : '' }}</p></template>
      <p v-for="label in resultConfig?.labeling" :key="label.targetId">{{ targetName('labeling', label.targetId) }} · {{ label.valueCode }} · {{ label.valueType }}</p>
      <a-alert type="info" show-icon message="全部引擎原始结果及证据保留。按已选一致性规则处理冲突和未知；引擎失败记录原因并继续。创建后可在任务列表执行。" />
    </div>
    <a-alert v-if="error" type="error" show-icon :message="error" role="alert" class="wizard-error" />
    <template #footer><a-button :disabled="saving" @click="emit('cancel')">取消</a-button><a-button v-if="step > 0" :disabled="saving" @click="step--; error = ''">上一步</a-button>
      <a-button v-if="step < 3" type="primary" @click="next">下一步</a-button><a-button v-else type="primary" :loading="saving" :disabled="submissionUncertain" @click="submit">创建任务</a-button></template>
  </a-modal>
</template>
<style scoped>
.wizard-steps { margin-bottom: 24px; }
.wizard-error { margin-top: 16px; }
.muted { color: #666; }
.confirmation-section { margin-top: 24px; }
.confirmation-section li { margin-bottom: 8px; overflow-wrap: anywhere; }
</style>
