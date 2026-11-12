<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { TaskEngineConfiguration } from "@/api/tasks";
import type { LabelDetail } from "@/api/labels";
import { buildResultPolicy, resultTargets, type ResultPolicyDraft, type ResultTarget } from "./task-result-policy";
import TaskMappedValueInput from "./TaskMappedValueInput.vue";

const props = defineProps<{ engines: TaskEngineConfiguration; inspectionTargets: ResultTarget[]; labelingTargets: ResultTarget[];
  labels: Record<string, LabelDetail>; disabled?: boolean }>();
const draft = reactive<ResultPolicyDraft>({ inspection: {}, labeling: {} });
const showErrors = ref(false);
const operations = [{ key: "inspection" as const, label: "质检评分" }, { key: "labeling" as const, label: "打标标签" }];
const aggregationOptions = [{ value: "REQUIRE_AGREEMENT", label: "全部引擎结果一致时确定；否则保留冲突、未知或错误" }];
const judgments = [{ value: "PASS", label: "通过" }, { value: "FAIL", label: "不通过" }];
watch(() => props.engines, config => {
  for (const operation of operations) for (const id of resultTargets(config, operation.key)) {
    const item = draft[operation.key][id] ||= { veto: false, engines: {} };
    for (const engine of config[operation.key]!.engines.filter(engine => engine.parameters.targetId === id)) item.engines[engine.id] ||= {};
  }
}, { immediate: true, deep: true });
const policy = computed(() => buildResultPolicy(props.engines, draft, props.labels));
function name(operation: "inspection" | "labeling", id: string) {
  return (operation === "inspection" ? props.inspectionTargets : props.labelingTargets).find(target => target.value === id)?.label || id;
}
function definition(id: string) { return props.labels[id]?.values.find(value => value.valueCode === draft.labeling[id]?.valueCode); }
function setDefinition(id: string, value: string) {
  const item = draft.labeling[id]!;
  item.valueCode = value;
  for (const engine of Object.keys(item.engines)) item.engines[engine] = {};
}
defineExpose({ validate: () => { showErrors.value = true; return Boolean(policy.value.configuration); },
  getConfiguration: () => policy.value.configuration });
</script>
<template>
  <a-alert type="info" show-icon message="全部原始引擎结果及证据保留。这里单独设置评分和标签处理规则，不按引擎数量重复扣分。" />
  <section v-for="operation in operations.filter(operation => engines[operation.key])" :key="operation.key" class="processing-section" :aria-label="operation.label">
    <h3>{{ operation.label }}</h3>
    <a-form v-if="operation.key === 'inspection'" layout="vertical">
      <a-row :gutter="16">
        <a-col :xs="24" :md="8"><a-form-item label="评分方式" required><a-select v-model:value="draft.mode" :disabled="disabled" placeholder="请选择"
          :options="[{value:'DEDUCTION',label:'扣分制'},{value:'POINTS',label:'得分制（按分值权重换算为百分制）'}]" /></a-form-item></a-col>
        <a-col :xs="24" :md="8"><a-form-item label="基础分" required><a-input-number v-model:value="draft.baseScore" :disabled="disabled" :min="1" :max="100" :precision="0" /></a-form-item></a-col>
        <a-col :xs="24" :md="8"><a-form-item label="及格线" required><a-input-number v-model:value="draft.passingScore" :disabled="disabled" :min="0" :max="draft.mode === 'DEDUCTION' ? draft.baseScore || 100 : 100" :precision="0" /></a-form-item></a-col>
      </a-row>
    </a-form>
    <a-empty v-if="!resultTargets(engines, operation.key).length" description="请返回任务类型，为引擎选择目标" />
    <article v-for="id in resultTargets(engines, operation.key)" :key="id" class="target-policy">
      <h4>{{ name(operation.key, id) }}</h4>
      <a-form layout="vertical">
        <a-form-item label="汇总规则" required><a-select v-model:value="draft[operation.key][id]!.aggregation" :disabled="disabled" placeholder="请选择汇总规则" :options="aggregationOptions" /></a-form-item>
        <template v-if="operation.key === 'inspection'">
          <a-form-item :label="draft.mode === 'POINTS' ? '该项分值权重' : '不通过扣分'" required><a-input-number v-model:value="draft.inspection[id]!.points" :disabled="disabled" :min="draft.mode === 'POINTS' ? 1 : 0" :max="100" :precision="0" /></a-form-item>
          <a-checkbox v-model:checked="draft.inspection[id]!.veto" :disabled="disabled">该项不通过时总分为零</a-checkbox>
        </template>
        <a-form-item v-else label="目标标签的值定义" required><a-select :value="draft.labeling[id]!.valueCode" :disabled="disabled || !labels[id]" placeholder="选择已发布值定义"
          :options="(labels[id]?.values || []).map(value => ({ value: value.valueCode, label: `${value.description || value.valueCode} · ${value.valueType}` }))"
          @update:value="(value: string) => setDefinition(id, value)" /></a-form-item>
        <div v-for="engine in engines[operation.key]!.engines.filter(engine => engine.parameters.targetId === id)" :key="engine.id" class="engine-mapping">
          <strong>{{ engines[operation.key]!.engines.findIndex(item => item.id === engine.id) + 1 }} · {{ engine.name || engine.id }} · {{ engine.type }}</strong>
          <a-row :gutter="16">
            <a-col v-for="field in [{key:'onHit' as const,label:'命中时'},{key:'onMiss' as const,label:'未命中时'}]" :key="field.key" :xs="24" :md="12">
              <a-form-item :label="field.label" required>
                <a-select v-if="operation.key === 'inspection'" v-model:value="draft.inspection[id]!.engines[engine.id]![field.key]" :disabled="disabled" placeholder="请选择判断" :options="judgments" />
                <TaskMappedValueInput v-else-if="definition(id)" v-model="draft.labeling[id]!.engines[engine.id]![field.key]" :type="definition(id)!.valueType" :disabled="disabled" :label="`${name(operation.key, id)} ${field.label}`" />
                <span v-else>请先选择标签值定义</span>
              </a-form-item>
            </a-col>
          </a-row>
        </div>
      </a-form>
    </article>
  </section>
  <div v-if="showErrors && policy.errors.length" role="alert" class="policy-errors"><p v-for="error in policy.errors" :key="error">{{ error }}</p></div>
</template>
<style scoped>
.processing-section { margin-top: 24px; }
.target-policy { border: 1px solid #d9d9d9; border-radius: 8px; padding: 16px; margin-top: 16px; }
.target-policy h4 { margin-top: 0; }
.engine-mapping { margin-top: 16px; border-top: 1px solid #f0f0f0; padding-top: 16px; }
.engine-mapping strong { display: block; margin-bottom: 12px; }
.policy-errors { margin-top: 16px; color: #cf1322; }
</style>
