<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { listConversations, type ConversationSummary } from "@/api/conversations";

const props = withDefaults(defineProps<{ modelValue: string[]; max?: number; disabled?: boolean }>(), { max: 1000 });
const emit = defineEmits<{ "update:modelValue": [ids: string[]] }>();
const rows = ref<ConversationSummary[]>([]);
const loading = ref(false);
const error = ref("");
const fileName = ref("");
const current = ref(1);
const total = ref(0);
let generation = 0;
const columns = [{ title: "会话", dataIndex: "sourceFileName" }, { title: "消息数", dataIndex: "messageCount", width: 100 },
  { title: "员工", dataIndex: "employeeName", width: 120 }, { title: "导入时间", dataIndex: "createdTime", width: 180 }];
const selection = computed(() => ({
  selectedRowKeys: props.modelValue, preserveSelectedRowKeys: true,
  onChange: (keys: Array<string | number>) => { if (!props.disabled) emit("update:modelValue", keys.map(String)); },
  getCheckboxProps: (row: ConversationSummary) => ({ disabled: props.disabled || row.messageCount < 1
    || (props.modelValue.length >= props.max && !props.modelValue.includes(row.id)) }),
  hideSelectAll: true,
}));
async function load(page = 1) {
  const request = ++generation;
  current.value = page; loading.value = true; error.value = "";
  try {
    const result = await listConversations({ current: page, size: 10, fileName: fileName.value || undefined });
    if (request === generation) { rows.value = result.records; total.value = result.total; }
  } catch { if (request === generation) error.value = "会话加载失败，请重试；已选会话保留。"; }
  finally { if (request === generation) loading.value = false; }
}
onMounted(() => load());
</script>
<template>
  <a-space style="margin-bottom: 12px">
    <a-input-search v-model:value="fileName" aria-label="按文件名筛选会话" placeholder="按文件名筛选" :disabled="disabled" @search="load(1)" />
    <span>已选 {{ modelValue.length }} / {{ max }} 个会话</span>
    <a-button :disabled="disabled || !modelValue.length" @click="emit('update:modelValue', [])">清空选择</a-button>
  </a-space>
  <a-alert v-if="error" type="error" :message="error" show-icon style="margin-bottom: 12px"><template #action><a-button size="small" @click="load(current)">重试</a-button></template></a-alert>
  <a-table row-key="id" size="small" :columns="columns" :data-source="rows" :loading="loading" :row-selection="selection"
    :pagination="{ current, total, pageSize: 10, showSizeChanger: false }" @change="(p: { current?: number }) => load(p.current || 1)" />
  <p class="picker-hint">仅显示你有权使用的会话；空会话不可选择。跨页选择会保留。</p>
</template>
<style scoped>.picker-hint { color: #64748b; margin-bottom: 0; }</style>
