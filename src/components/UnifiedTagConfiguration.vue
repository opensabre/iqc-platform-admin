<script setup lang="ts">
import type { QualityAgent } from "@/api/config";
import type { UnifiedTagConfiguration } from "@/api/tasks";
import type { ResultTarget } from "./task-result-policy";
const model = defineModel<UnifiedTagConfiguration>({ required: true });
defineProps<{ targets: ResultTarget[]; agents: QualityAgent[]; disabled?: boolean }>();
function toggle(type: "REGEX" | "DLS" | "LLM") {
  const sequence = model.value.engineSequence;
  model.value = { ...model.value, engineSequence: sequence.includes(type) ? sequence.filter(item => item !== type) : [...sequence, type] };
}
function move(index: number, delta: number) {
  const sequence = [...model.value.engineSequence];
  const next = index + delta;
  if (next < 0 || next >= sequence.length) return;
  [sequence[index], sequence[next]] = [sequence[next]!, sequence[index]!];
  model.value = { ...model.value, engineSequence: sequence };
}
</script>
<template>
  <a-form layout="vertical">
    <a-form-item label="识别标签" required>
      <a-radio-group v-model:value="model.tagSelectionMode" :disabled="disabled" @change="model.selectedTagIds = []">
        <a-radio value="SELECTED">选择标签</a-radio><a-radio value="ALL">全部可用标签</a-radio>
      </a-radio-group>
      <a-select v-if="model.tagSelectionMode === 'SELECTED'" v-model:value="model.selectedTagIds" mode="multiple" show-search
        option-filter-prop="label" :options="targets" :disabled="disabled" placeholder="选择已发布标签，自动使用其绑定规则" style="width:100%;margin-top:12px" />
      <p>本版本最多 500 个标签；全选在执行时冻结为当时有权限的已发布标签。</p>
    </a-form-item>
    <a-form-item label="执行引擎与顺序" required>
      <a-space><a-checkbox v-for="type in (['REGEX','DLS','LLM'] as const)" :key="type" :checked="model.engineSequence.includes(type)" :disabled="disabled" @change="toggle(type)">{{ type }}</a-checkbox></a-space>
      <div v-for="(type,index) in model.engineSequence" :key="type" class="engine-row">
        <span>{{ index + 1 }}. {{ type }}</span>
        <a-space><a-button size="small" :disabled="disabled || index === 0" :aria-label="`${type} 上移`" @click="move(index,-1)">上移</a-button>
          <a-button size="small" :disabled="disabled || index === model.engineSequence.length - 1" :aria-label="`${type} 下移`" @click="move(index,1)">下移</a-button></a-space>
      </div>
    </a-form-item>
    <a-form-item v-if="model.engineSequence.includes('LLM')" label="LLM 智能体配置" required>
      <a-select v-model:value="model.agentId" :options="agents.filter(agent => agent.status === 'PUBLISHED').map(agent => ({ value:agent.id,label:agent.name }))" :disabled="disabled" placeholder="选择已发布智能体" />
    </a-form-item>
    <a-alert type="info" show-icon message="LLM 增量识别" description="前面引擎已明确命中的标签会跳过 LLM；其余绑定 LLM 规则的标签与当前会话一起批量识别。未命中、失败和未知都不会作为过滤依据。" />
  </a-form>
</template>
<style scoped>.engine-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee}p{color:#64748b}</style>
