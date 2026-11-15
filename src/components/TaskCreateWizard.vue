<script setup lang="ts">
import { computed, ref } from "vue";
import { isAxiosError } from "axios";
import { createUnifiedTask, type UnifiedTagConfiguration, type TaskTrigger, type InspectionTask, type TaskDataSelection } from "@/api/tasks";
import type { QualityAgent } from "@/api/config";
import UnifiedTagConfigurationEditor from "./UnifiedTagConfiguration.vue";
import TaskTriggerConfiguration from "./TaskTriggerConfiguration.vue";
import TaskDataSelector from "./TaskDataSelector.vue";

defineProps<{ agents: QualityAgent[]; labelingTargets: { value: string; label: string }[] }>();
const emit = defineEmits<{ cancel: []; created: [task: InspectionTask] }>();
const step = ref(0), name = ref(""), concurrency = ref(1), saving = ref(false), error = ref("");
const submissionUncertain = ref(false);
const steps = ["数据筛选", "规则与标签", "触发计划", "任务确认"].map(title => ({ title }));
const selection = ref<TaskDataSelection>({ mode: "BATCH", conversationIds: [] });
const configuration = ref<UnifiedTagConfiguration>({ engineSequence: ["REGEX", "DLS", "LLM"], tagSelectionMode: "SELECTED", selectedTagIds: [] });
const trigger = ref<TaskTrigger>({ type: "IMMEDIATE", enabled: true });
const dataSummary = computed(() => selection.value.mode === "BATCH" ? `批量选择 ${selection.value.conversationIds?.length || 0} 个会话`
  : selection.value.mode === "RANDOM" ? `执行时随机抽样，最多 ${selection.value.sampleSize || 0} 个会话` : "执行时按条件获取全部匹配会话");
const triggerSummary = computed(() => trigger.value.type === "IMMEDIATE" ? "立即执行" : trigger.value.type === "SCHEDULED"
  ? `定时：${trigger.value.scheduledAt}（北京时间）` : `周期：${trigger.value.cron}（北京时间）`);
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
function validateConfiguration() {
  const value = configuration.value;
  if (!value.engineSequence.length) { error.value = "请选择至少一种执行引擎"; return false; }
  if (value.tagSelectionMode === "SELECTED" && (!value.selectedTagIds.length || value.selectedTagIds.length > 500)) {
    error.value = "请选择 1–500 个标签"; return false;
  }
  if (value.engineSequence.includes("LLM") && !value.agentId) { error.value = "请选择 LLM 智能体配置"; return false; }
  return true;
}
function validateTrigger() {
  if ((trigger.value.type === "SCHEDULED" && !trigger.value.scheduledAt) || (trigger.value.type === "PERIODIC" && !trigger.value.cron?.trim())) {
    error.value = "请填写执行时间或 Cron"; return false;
  }
  return true;
}
function next() {
  error.value = "";
  if (step.value === 0 && !validateData()) return;
  if (step.value === 1 && !validateConfiguration()) return;
  if (step.value === 2 && !validateTrigger()) return;
  step.value++;
}
async function submit() {
  if (saving.value || submissionUncertain.value) return;
  error.value = "";
  if (!validateData()) { step.value = 0; return; }
  if (!validateConfiguration()) { step.value = 1; return; }
  if (!validateTrigger()) { step.value = 2; return; }
  if (!name.value.trim() || name.value.trim().length > 80 || !Number.isInteger(concurrency.value) || concurrency.value < 1 || concurrency.value > 32) {
    error.value = "请填写任务名称（1–80 字），并将并发数设置为 1–32"; return;
  }
  saving.value = true;
  try {
    const { sampleSeed: _previewSeed, ...dataSelection } = selection.value;
    emit("created", await createUnifiedTask({ name: name.value.trim(), dataSelection, configuration: configuration.value,
      concurrencyLimit: concurrency.value, trigger: trigger.value }));
  } catch (failure) {
    submissionUncertain.value = isAxiosError(failure) && !failure.response;
    error.value = submissionUncertain.value ? "任务提交未确认，请先到任务列表核对，避免重复创建。当前填写内容保留。"
      : failure instanceof Error ? failure.message : "任务创建失败，请检查配置后重试";
  } finally { saving.value = false; }
}
</script>
<template>
  <a-modal :open="true" title="创建任务" width="min(1040px, calc(100vw - 32px))" :closable="!saving" :mask-closable="false" :keyboard="!saving"
    :styles="{ body: { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' } }" @cancel="emit('cancel')">
    <a-steps :current="step" :items="steps" size="small" class="wizard-steps" />
    <div v-show="step === 0"><TaskDataSelector v-model="selection" :disabled="saving" /></div>
    <div v-show="step === 1"><UnifiedTagConfigurationEditor v-model="configuration" :targets="labelingTargets" :agents="agents" :disabled="saving" /></div>
    <div v-show="step === 2">
      <TaskTriggerConfiguration v-model="trigger" :disabled="saving" />
      <a-alert type="info" show-icon message="保留完整匹配结果，业务处置待确认" description="扣分、冲突及正式标签处理策略尚未配置，不在此处设置合并算法。" />
    </div>
    <div v-show="step === 3">
      <a-form layout="vertical"><a-form-item label="任务名称" required><a-input v-model:value="name" :disabled="saving" :maxlength="80" placeholder="请输入任务名称" /></a-form-item>
        <a-form-item label="并发会话数" required><a-input-number v-model:value="concurrency" :disabled="saving" :min="1" :max="32" :precision="0" /></a-form-item></a-form>
      <h3>数据筛选</h3><p>{{ dataSummary }}</p><p v-for="condition in conditions" :key="condition">{{ condition }}</p>
      <p v-if="selection.mode !== 'BATCH'">执行时确定名单，数据不足时有多少处理多少。</p>
      <h3>规则与标签</h3><p>{{ configuration.engineSequence.join(' → ') }} · {{ configuration.tagSelectionMode === 'ALL' ? '全部可用标签（执行时冻结）' : `选择 ${configuration.selectedTagIds.length} 个标签` }}</p>
      <h3>触发计划</h3><p>{{ triggerSummary }} · {{ trigger.enabled ? '启用' : '停用' }}</p>
    </div>
    <a-alert v-if="error" type="error" show-icon :message="error" role="alert" class="wizard-error" />
    <template #footer><a-button :disabled="saving" @click="emit('cancel')">取消</a-button><a-button v-if="step > 0" :disabled="saving" @click="step--; error = ''">上一步</a-button>
      <a-button v-if="step < 3" type="primary" :disabled="saving" @click="next">下一步</a-button><a-button v-else type="primary" :loading="saving" :disabled="submissionUncertain" @click="submit">创建任务</a-button></template>
  </a-modal>
</template>
<style scoped>
.wizard-steps { margin-bottom: 24px; }
.wizard-error { margin-top: 16px; }
</style>
