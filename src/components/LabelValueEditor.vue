<script setup lang="ts">
import type { LabelValueRequest } from "@/api/labels";
const props = defineProps<{ modelValue: LabelValueRequest[] }>();
const emit = defineEmits<{
  "update:modelValue": [value: LabelValueRequest[]];
}>();
const types = [
  "FIXED",
  "BOOLEAN",
  "PERCENTAGE",
  "DURATION_MONTHS",
  "MONTH",
  "DATE",
] as const;
function add() {
  if (props.modelValue.length < 10)
    emit("update:modelValue", [
      ...props.modelValue,
      { valueCode: "", valueType: "FIXED" },
    ]);
}
function update(index: number, key: keyof LabelValueRequest, value: string) {
  emit(
    "update:modelValue",
    props.modelValue.map((item, i) =>
      i === index ? { ...item, [key]: value } : item
    )
  );
}
function remove(index: number) {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => i !== index)
  );
}
</script>
<template>
  <div>
    <a-space
      v-for="(item, index) in modelValue"
      :key="index"
      style="display: flex; margin-bottom: 8px"
      ><a-input
        :value="item.valueCode"
        placeholder="值编码"
        @update:value="update(index, 'valueCode', $event)"
      /><a-select
        :value="item.valueType"
        style="width: 180px"
        @update:value="update(index, 'valueType', $event)"
        ><a-select-option v-for="type in types" :key="type" :value="type">{{
          type
        }}</a-select-option></a-select
      ><a-input
        :value="item.description"
        placeholder="说明"
        @update:value="update(index, 'description', $event)"
      /><a-button danger @click="remove(index)">移除</a-button></a-space
    ><a-button :disabled="modelValue.length >= 10" @click="add"
      >添加标签值（{{ modelValue.length }}/10）</a-button
    >
  </div>
</template>
