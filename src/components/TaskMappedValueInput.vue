<script setup lang="ts">
import type { LabelValueType, TaskMappedValue } from "@/api/tasks";
defineProps<{ modelValue?: TaskMappedValue; type: LabelValueType; disabled?: boolean; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: TaskMappedValue | undefined] }>();
</script>
<template>
  <div>
    <a-checkbox :checked="modelValue === null" :disabled="disabled" @change="(event: { target: { checked: boolean } }) => emit('update:modelValue', event.target.checked ? null : undefined)">未知</a-checkbox>
    <template v-if="modelValue !== null">
      <a-select v-if="type === 'BOOLEAN'" :aria-label="label" :value="modelValue === true ? 'true' : modelValue === false ? 'false' : undefined" :disabled="disabled"
        placeholder="请选择" :options="[{ value: 'true', label: '是' }, { value: 'false', label: '否' }]"
        @update:value="(value: string) => emit('update:modelValue', value === 'true')" />
      <a-input-number v-else-if="['PERCENTAGE','MONTH','DURATION_MONTHS'].includes(type)" :aria-label="label" :value="typeof modelValue === 'number' ? modelValue : undefined" :disabled="disabled"
        :min="type === 'MONTH' ? 1 : 0" :max="type === 'PERCENTAGE' ? 100 : type === 'MONTH' ? 12 : 2147483647" :precision="type === 'PERCENTAGE' ? undefined : 0"
        @update:value="(value: number | null) => emit('update:modelValue', value ?? undefined)" />
      <a-input v-else :aria-label="label" :type="type === 'DATE' ? 'date' : 'text'" :value="typeof modelValue === 'string' ? modelValue : undefined" :disabled="disabled"
        :placeholder="type === 'DATE' ? 'YYYY-MM-DD' : '标签值'" @update:value="(value: string) => emit('update:modelValue', value)" />
    </template>
  </div>
</template>
