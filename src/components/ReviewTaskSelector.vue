<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { listTasks } from "@/api/tasks";
import { usePermission } from "@/composables/permission";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const { can } = usePermission();
const keyword = ref(""), searching = ref(false), searchError = ref("");
const showIdInput = ref(false);
const options = ref<{ value: string; label: string }[]>([]);
// Deep links and failed searches must not hide the ID that is still actively filtering results.
const displayedOptions = computed(() => props.modelValue && !options.value.some(option => option.value === props.modelValue)
  ? [{ value: props.modelValue, label: `任务 · ${props.modelValue}` }, ...options.value] : options.value);
const selectedOption = computed(() => props.modelValue || undefined);
let searchRequest = 0;

async function search() {
  if (!can("iqc:task:view")) return;
  const request = ++searchRequest;
  searching.value = true; searchError.value = "";
  try {
    const page = await listTasks({ keyword: keyword.value.trim() || undefined, current: 1, size: 20 });
    if (request !== searchRequest) return;
    options.value = page.records.map(task => ({ value: task.id, label: `${task.name} · ${task.id}` }));
    if (!options.value.length) searchError.value = "未找到任务，请调整名称关键字。";
  } catch {
    if (request === searchRequest) { options.value = []; searchError.value = "任务搜索失败，请重试。"; }
  } finally {
    if (request === searchRequest) searching.value = false;
  }
}
function selectTask(value: string | number | undefined) { emit("update:modelValue", value == null ? "" : String(value)); }
function editTaskId(value: string) { emit("update:modelValue", value); }
onBeforeUnmount(() => { searchRequest++; });
</script>

<template>
  <div class="review-task-selector">
    <template v-if="can('iqc:task:view')">
      <a-input-search v-model:value="keyword" aria-label="按任务名称查找" placeholder="按任务名称查找" :loading="searching" class="task-search" @search="search" />
      <a-select v-if="displayedOptions.length" :value="selectedOption" :options="displayedOptions" aria-label="选择找到的任务"
        placeholder="选择找到的任务" show-search allow-clear option-filter-prop="label" class="task-options" @change="selectTask" />
      <a-button type="link" size="small" @click="showIdInput = !showIdInput">{{ showIdInput ? '收起 ID' : '按 ID 筛选' }}</a-button>
    </template>
    <a-input v-if="!can('iqc:task:view') || showIdInput" :value="modelValue" aria-label="任务 ID 筛选" placeholder="任务 ID（可选）" :maxlength="64" allow-clear class="task-id"
      @update:value="editTaskId" />
    <span v-if="searchError" role="status">{{ searchError }}</span>
  </div>
</template>

<style scoped>
.review-task-selector { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.task-search, .task-options { width: 190px; }
.task-id { width: 170px; }
</style>
