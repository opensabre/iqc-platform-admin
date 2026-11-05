<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { listConversations, type ConversationSummary } from "@/api/conversations";
import { previewTaskSelection, type TaskDataSelection, type SelectionPreview } from "@/api/tasks";

const props = withDefaults(defineProps<{
  modelValue: string[]; max?: number; disabled?: boolean; dataSelection?: TaskDataSelection;
}>(), { max: 1000 });
const emit = defineEmits<{ "update:modelValue": [ids: string[]]; preview: [value: SelectionPreview | undefined] }>();
const rows = ref<ConversationSummary[]>([]), sampleRows = ref<ConversationSummary[]>([]);
const loading = ref(false), error = ref(""), fileName = ref("");
const current = ref(1), total = ref(0), matchedTotal = ref<number>(), previewed = ref(false);
const scope = ref<"sample" | "all">("sample");
const dynamic = computed(() => !!props.dataSelection && props.dataSelection.mode !== "BATCH");
const random = computed(() => props.dataSelection?.mode === "RANDOM");
let generation = 0;
const baseColumns = [{ title: "会话", dataIndex: "sourceFileName" }, { title: "消息数", dataIndex: "messageCount", width: 90 },
  { title: "坐席", dataIndex: "employeeName", width: 110 }, { title: "渠道", dataIndex: "channel", width: 100 },
  { title: "导入时间", dataIndex: "createdTime", width: 180 }];
const columns = computed(() => random.value && scope.value === "all"
  ? [...baseColumns, { title: "抽样状态", key: "sampleStatus", width: 110,
    customRender: ({ record }: { record: ConversationSummary }) => sampleRows.value.some(row => row.id === record.id) ? "本次抽中" : "未抽中" }]
  : baseColumns);
const selection = computed(() => dynamic.value ? undefined : ({
  selectedRowKeys: props.modelValue, preserveSelectedRowKeys: true,
  onChange: (keys: Array<string | number>) => { if (!props.disabled) emit("update:modelValue", keys.map(String)); },
  getCheckboxProps: (row: ConversationSummary) => ({ disabled: props.disabled || row.messageCount < 1 || row.status !== "IMPORTED"
    || (props.modelValue.length >= props.max && !props.modelValue.includes(row.id)) }),
  hideSelectAll: true,
}));
const visibleRows = computed(() => random.value && scope.value === "sample"
  ? sampleRows.value.slice((current.value - 1) * 10, current.value * 10) : rows.value);

/** Invalidates in-flight reads as well as visible previews when the selection definition changes. */
function invalidate() {
  generation++; loading.value = false; rows.value = []; sampleRows.value = []; previewed.value = false;
  total.value = 0; matchedTotal.value = undefined; current.value = 1; error.value = ""; scope.value = "sample";
  emit("preview", undefined);
}
async function load(page = 1, fresh = false) {
  if (props.disabled) return;
  if (random.value && scope.value === "sample" && previewed.value && !fresh) { current.value = page; return; }
  const request = ++generation;
  current.value = page; loading.value = true; error.value = "";
  try {
    if (!dynamic.value) {
      const result = await listConversations({ current: page, size: 10, fileName: fileName.value || undefined });
      if (request === generation) { rows.value = result.records; total.value = result.total; }
    } else {
      const source = props.dataSelection!;
      const definition = random.value && scope.value === "all"
        ? { mode: "FILTER" as const, filter: source.filter }
        : { ...source, sampleSeed: undefined };
      const result = await previewTaskSelection(definition, page, 10);
      if (request !== generation) return;
      rows.value = result.conversations.records; matchedTotal.value = result.matchedTotal;
      if (result.mode === "RANDOM") {
        sampleRows.value = result.conversations.records; total.value = result.selectedTotal;
      } else total.value = result.conversations.total;
      previewed.value = true; emit("preview", result);
    }
  } catch {
    if (request === generation) { error.value = "会话加载失败，请重试；批量选择已选会话保留。"; rows.value = []; }
  } finally { if (request === generation) loading.value = false; }
}
function simulate() { invalidate(); void load(1, true); }
function switchScope(value: "sample" | "all") {
  scope.value = value; current.value = 1;
  if (value === "sample") { total.value = sampleRows.value.length; }
  else void load(1);
}
// Selecting a batch row must not reset the current page or reload the table.
watch(() => JSON.stringify({ mode: props.dataSelection?.mode || "BATCH",
  filter: props.dataSelection?.filter, sampleSize: props.dataSelection?.sampleSize }),
  () => { invalidate(); if (!dynamic.value) void load(); });
onBeforeUnmount(() => { generation++; });
onMounted(() => { if (!dynamic.value) void load(); });
</script>
<template>
  <a-space wrap style="margin-bottom: 12px">
    <template v-if="!dynamic">
      <a-input-search v-model:value="fileName" aria-label="按文件名筛选会话" placeholder="按文件名筛选" :disabled="disabled" @search="load(1)" />
      <span>已选 {{ modelValue.length }} / {{ max }} 个会话</span>
      <a-button :disabled="disabled || !modelValue.length" @click="emit('update:modelValue', [])">清空选择</a-button>
    </template>
    <template v-else>
      <a-button type="primary" :loading="loading" :disabled="disabled" @click="simulate">模拟执行</a-button>
      <span v-if="matchedTotal !== undefined">当前匹配 {{ matchedTotal }} 个<span v-if="random">，本次抽样 {{ sampleRows.length }} 个</span></span>
      <template v-if="random && previewed">
        <a-button :type="scope === 'sample' ? 'primary' : 'default'" :disabled="loading || disabled" @click="switchScope('sample')">本次抽样结果</a-button>
        <a-button :type="scope === 'all' ? 'primary' : 'default'" :disabled="loading || disabled" @click="switchScope('all')">全部匹配数据</a-button>
      </template>
    </template>
  </a-space>
  <a-alert v-if="error" type="error" :message="error" show-icon style="margin-bottom: 12px"><template #action><a-button size="small" @click="load(current, random && scope === 'sample')">重试</a-button></template></a-alert>
  <a-alert v-if="random && previewed && matchedTotal !== undefined && matchedTotal < (dataSelection?.sampleSize || 0)" type="info" show-icon
    message="满足条件的数据少于要求数量，有多少就处理多少。" style="margin-bottom: 12px" />
  <a-table v-if="!dynamic || previewed || loading" row-key="id" size="small" :columns="columns" :data-source="visibleRows" :loading="loading"
    :row-selection="selection" :scroll="{ x: 680 }"
    :pagination="{ current, total, pageSize: 10, showSizeChanger: false }" @change="(p: { current?: number }) => load(p.current || 1)" />
  <a-empty v-else description="点击模拟执行，查看满足条件的会话列表。" />
  <p class="picker-hint">{{ dynamic ? '模拟仅用于核对数据；正式执行时重新取数，记录本次实际名单。' : '仅可选择有权使用且已处理好的会话；跨页选择会保留。' }}</p>
</template>
<style scoped>.picker-hint { color: #64748b; margin-bottom: 0; }</style>
