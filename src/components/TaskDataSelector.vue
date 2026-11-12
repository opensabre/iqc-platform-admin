<script setup lang="ts">
import { computed } from "vue";
import type { TaskDataSelection, TaskConversationFilter } from "@/api/tasks";
import ConversationPicker from "./ConversationPicker.vue";
const props = defineProps<{ modelValue: TaskDataSelection; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: TaskDataSelection] }>();
const modes = [{ label: "批量选择", value: "BATCH" }, { label: "随机抽样", value: "RANDOM" }, { label: "条件筛选", value: "FILTER" }];
const ids = computed({ get: () => props.modelValue.conversationIds || [], set: value => emit("update:modelValue", { mode: "BATCH", conversationIds: value }) });
function setMode(mode: TaskDataSelection["mode"]) {
  emit("update:modelValue", mode === "BATCH" ? { mode, conversationIds: [] }
    : mode === "RANDOM" ? { mode, filter: props.modelValue.filter || {}, sampleSize: 100 }
    : { mode, filter: props.modelValue.filter || {} });
}
function setFilter(key: keyof TaskConversationFilter, value: string) {
  emit("update:modelValue", { ...props.modelValue, filter: { ...props.modelValue.filter, [key]: value || undefined } });
}
</script>
<template>
  <a-radio-group :value="modelValue.mode" :options="modes" option-type="button" :disabled="disabled" @change="(e: { target: { value: TaskDataSelection['mode'] } }) => setMode(e.target.value)" />
  <template v-if="modelValue.mode !== 'BATCH'">
    <a-row :gutter="16" style="margin-top: 16px">
      <a-col v-for="field in [{key:'fileName',label:'文件名'},{key:'employeeId',label:'坐席编号'},{key:'customerExternalId',label:'客户编号'},{key:'channel',label:'渠道'},{key:'businessNo',label:'业务编号'}]" :key="field.key" :xs="24" :md="12">
        <a-form-item :label="field.label"><a-input :value="modelValue.filter?.[field.key as keyof TaskConversationFilter]" :disabled="disabled" allow-clear
          @update:value="(value: string) => setFilter(field.key as keyof TaskConversationFilter, value)" /></a-form-item>
      </a-col>
      <a-col v-for="field in [{key:'startedFrom',label:'会话开始时间（从）'},{key:'startedTo',label:'会话开始时间（至）'}]" :key="field.key" :xs="24" :md="12">
        <a-form-item :label="field.label"><a-input type="datetime-local" :value="modelValue.filter?.[field.key as keyof TaskConversationFilter]" :disabled="disabled"
          @update:value="(value: string) => setFilter(field.key as keyof TaskConversationFilter, value)" /></a-form-item>
      </a-col>
    </a-row>
    <a-form-item v-if="modelValue.mode === 'RANDOM'" label="抽样数量"><a-input-number :value="modelValue.sampleSize" :min="1" :max="1000" :precision="0" :disabled="disabled"
      @update:value="(sampleSize: number | null) => emit('update:modelValue', { ...modelValue, sampleSize: sampleSize ?? undefined })" /></a-form-item>
    <a-alert type="info" show-icon message="创建时保存条件，执行时确定数据；数据不足时，有多少处理多少。模拟执行不固定正式名单。" style="margin-bottom: 16px" />
  </template>
  <div style="margin-top: 16px"><ConversationPicker v-model="ids" :disabled="disabled" :data-selection="modelValue" /></div>
</template>
