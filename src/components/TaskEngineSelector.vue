<script setup lang="ts">
import { computed, ref } from "vue";
import type { TaskEngine, TaskEngineConfiguration } from "@/api/tasks";
import type { QualityAgent, QualityRule } from "@/api/config";

const props = defineProps<{
  modelValue: TaskEngineConfiguration;
  rules: QualityRule[];
  agents: QualityAgent[];
  inspectionTargets: { value: string; label: string }[];
  labelingTargets: { value: string; label: string }[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: TaskEngineConfiguration] }>();
type Operation = "inspection" | "labeling";
const operations = [{ key: "inspection" as const, label: "质检" }, { key: "labeling" as const, label: "打标" }];
const engineTypes = [{ value: "REGEX", label: "正则" }, { value: "DLS", label: "DLS" }, { value: "LLM", label: "大模型" }];
const showErrors = ref(false);
const drafts: Partial<Record<Operation, { engines: TaskEngine[] }>> = {};
const availableAgents = computed(() => props.agents.filter(agent => {
  if (agent.status !== "PUBLISHED") return false;
  try {
    const config = JSON.parse(agent.configJson || "null");
    return config && typeof config === "object" && !Array.isArray(config)
      && String(config.mode || "").toUpperCase() !== "RULE_ONLY";
  } catch { return false; }
}));
function availableRules(type: TaskEngine["type"]) {
  return props.rules.filter(rule => rule.status === "PUBLISHED" && rule.ruleType === type);
}
function targets(operation: Operation) {
  return operation === "inspection" ? props.inspectionTargets : props.labelingTargets;
}
function setOperation(operation: Operation, enabled: boolean) {
  if (props.disabled) return;
  if (!enabled && props.modelValue[operation]) drafts[operation] = props.modelValue[operation];
  emit("update:modelValue", { ...props.modelValue, [operation]: enabled ? drafts[operation] || { engines: [] } : undefined });
}
function setEngines(operation: Operation, engines: TaskEngine[]) {
  if (props.disabled) return;
  emit("update:modelValue", { ...props.modelValue, [operation]: { engines } });
}
function add(operation: Operation, type: TaskEngine["type"]) {
  const engines = props.modelValue[operation]?.engines || [];
  if (engines.length >= 32) return;
  setEngines(operation, [...engines, { id: `engine-${crypto.randomUUID()}`, type, name: `${engineTypes.find(item => item.value === type)?.label}引擎 ${engines.length + 1}`, parameters: {} }]);
}
function move(operation: Operation, index: number, direction: number) {
  const engines = [...(props.modelValue[operation]?.engines || [])];
  const next = index + direction;
  if (next < 0 || next >= engines.length) return;
  [engines[index], engines[next]] = [engines[next]!, engines[index]!];
  setEngines(operation, engines);
}
function setName(operation: Operation, id: string, name: string) {
  setEngines(operation, (props.modelValue[operation]?.engines || []).map(engine => engine.id === id ? { ...engine, name } : engine));
}
function setParameter(operation: Operation, id: string, field: keyof TaskEngine["parameters"], value?: string) {
  setEngines(operation, (props.modelValue[operation]?.engines || []).map(engine => engine.id === id
    ? { ...engine, parameters: { ...engine.parameters, [field]: value || undefined } } : engine));
}
const errors = computed(() => {
  const result: string[] = [];
  if (!props.modelValue.inspection && !props.modelValue.labeling) result.push("请至少选择质检或打标");
  for (const operation of operations) {
    const selected = props.modelValue[operation.key];
    if (!selected) continue;
    if (!selected.engines.length || selected.engines.length > 32) result.push(`${operation.label}需配置 1 到 32 个引擎`);
    const ids = new Set<string>();
    selected.engines.forEach((engine, index) => {
      const name = `${operation.label}第 ${index + 1} 个引擎`;
      if (ids.has(engine.id)) result.push(`${name}标识重复`);
      ids.add(engine.id);
      if (!engine.name?.trim() || engine.name.trim().length > 80) result.push(`${name}名称需为 1 到 80 个字符`);
      if (!targets(operation.key).some(target => target.value === engine.parameters.targetId)) result.push(`${name}请选择识别目标`);
      if (!availableRules(engine.type).some(rule => rule.id === engine.parameters.ruleId)) result.push(`${name}请选择对应类型的已发布规则`);
      if (engine.type === "LLM" && !availableAgents.value.some(agent => agent.id === engine.parameters.agentId)) result.push(`${name}请选择已发布大模型配置`);
    });
  }
  return result;
});
defineExpose({ validate: () => { showErrors.value = true; return errors.value.length === 0; } });
</script>

<template>
  <a-space wrap style="margin-bottom: 16px">
    <a-checkbox v-for="operation in operations" :key="operation.key" :checked="Boolean(modelValue[operation.key])" :disabled="disabled"
      @change="(event: { target: { checked: boolean } }) => setOperation(operation.key, event.target.checked)">{{ operation.label }}</a-checkbox>
  </a-space>
  <a-alert type="info" show-icon message="质检和打标各自按列表顺序执行。引擎失败保留记录并继续，全部结果交给结果处理模块。" />
  <section v-for="operation in operations.filter(item => modelValue[item.key])" :key="operation.key" class="operation-panel" :aria-label="`${operation.label}引擎配置`">
    <h3>{{ operation.label }}引擎</h3>
    <div v-if="!modelValue[operation.key]?.engines.length" class="empty-engines">尚未添加引擎</div>
    <article v-for="(engine, index) in modelValue[operation.key]?.engines" :key="engine.id" class="engine-card">
      <div class="engine-header">
        <strong>{{ index + 1 }} · {{ engineTypes.find(type => type.value === engine.type)?.label }}</strong>
        <a-space wrap>
          <a-button size="small" :disabled="disabled || index === 0" :aria-label="`${operation.label}第${index + 1}个引擎上移`" @click="move(operation.key, index, -1)">上移</a-button>
          <a-button size="small" :disabled="disabled || index === modelValue[operation.key]!.engines.length - 1" :aria-label="`${operation.label}第${index + 1}个引擎下移`" @click="move(operation.key, index, 1)">下移</a-button>
          <a-button size="small" danger :disabled="disabled" :aria-label="`${operation.label}第${index + 1}个引擎移除`"
            @click="setEngines(operation.key, modelValue[operation.key]!.engines.filter(item => item.id !== engine.id))">移除</a-button>
        </a-space>
      </div>
      <a-form layout="vertical">
        <a-form-item label="引擎名称" required><a-input :value="engine.name" :maxlength="80" :disabled="disabled" :aria-label="`${operation.label}第${index + 1}个引擎名称`"
          placeholder="填写便于识别的名称" @update:value="(value: string) => setName(operation.key, engine.id, value)" /></a-form-item>
        <a-form-item :label="operation.key === 'inspection' ? '质检项' : '标签目标'" required>
          <a-select :value="engine.parameters.targetId" :options="targets(operation.key)" :disabled="disabled" allow-clear placeholder="选择识别目标"
            @update:value="(value?: string) => setParameter(operation.key, engine.id, 'targetId', value)" />
        </a-form-item>
        <a-form-item label="已发布规则" required>
          <a-select :value="engine.parameters.ruleId" :options="availableRules(engine.type).map(rule => ({ value: rule.id, label: `${rule.name} · V${rule.versionNo || 1}` }))"
            :disabled="disabled" allow-clear placeholder="选择对应引擎的规则"
            @update:value="(value?: string) => setParameter(operation.key, engine.id, 'ruleId', value)" />
        </a-form-item>
        <a-form-item v-if="engine.type === 'LLM'" label="大模型配置" required>
          <a-select :value="engine.parameters.agentId" :options="availableAgents.map(agent => ({ value: agent.id, label: `${agent.name} · V${agent.versionNo || 1}` }))"
            :disabled="disabled" allow-clear placeholder="选择已发布大模型配置"
            @update:value="(value?: string) => setParameter(operation.key, engine.id, 'agentId', value)" />
        </a-form-item>
        <p v-if="engine.parameters.ruleId" class="parameter-summary">{{ availableRules(engine.type).find(rule => rule.id === engine.parameters.ruleId)?.expression }}</p>
      </a-form>
    </article>
    <a-space wrap>
      <a-button v-for="type in engineTypes" :key="type.value" :disabled="disabled || (modelValue[operation.key]?.engines.length || 0) >= 32" @click="add(operation.key, type.value as TaskEngine['type'])">添加{{ type.label }}引擎</a-button>
      <span class="future-engine">小模型：后续支持</span>
    </a-space>
  </section>
  <div v-if="showErrors && errors.length" role="alert" class="validation-errors"><p v-for="error in errors" :key="error">{{ error }}</p></div>
</template>

<style scoped>
.operation-panel { margin-top: 24px; }
.engine-card { border: 1px solid #d9d9d9; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.engine-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.empty-engines { padding: 24px; margin-bottom: 16px; border: 1px dashed #d9d9d9; text-align: center; color: #666; }
.parameter-summary { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 120px; overflow: auto; color: #666; }
.future-engine { color: #666; }
.validation-errors { margin-top: 16px; color: #cf1322; }
</style>
