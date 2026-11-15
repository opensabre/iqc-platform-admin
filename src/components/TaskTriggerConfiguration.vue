<script setup lang="ts">
import type { TaskTrigger } from "@/api/tasks";
const model = defineModel<TaskTrigger>({ required: true });
defineProps<{ disabled?: boolean }>();
function changeType(type: TaskTrigger["type"]) { model.value = { type, enabled: model.value.enabled }; }
</script>
<template>
  <a-form layout="vertical">
    <a-form-item label="触发方式" required>
      <a-radio-group :value="model.type" :disabled="disabled" @change="changeType($event.target.value)">
        <a-radio value="IMMEDIATE">立即执行</a-radio><a-radio value="SCHEDULED">定时执行</a-radio><a-radio value="PERIODIC">周期执行</a-radio>
      </a-radio-group>
    </a-form-item>
    <a-form-item v-if="model.type === 'SCHEDULED'" label="执行时间（北京时间）" required>
      <a-input v-model:value="model.scheduledAt" type="datetime-local" :disabled="disabled" />
    </a-form-item>
    <a-form-item v-if="model.type === 'PERIODIC'" label="Cron（北京时间）" required>
      <a-input v-model:value="model.cron" :disabled="disabled" placeholder="例如：0 0 9 * * *，每天 09:00" />
      <p>上一轮结束后再触发下一轮；错过的时间点不补排多个任务。</p>
    </a-form-item>
    <a-form-item label="启用触发计划"><a-switch v-model:checked="model.enabled" :disabled="disabled" /></a-form-item>
    <p>每轮执行时确定数据并冻结配置；停用仅停止后续触发，当前执行可在任务列表暂停或取消。</p>
  </a-form>
</template>
