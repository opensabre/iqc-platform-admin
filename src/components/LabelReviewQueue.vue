<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePermission } from "@/composables/permission";
import { listLabelReviewQueue, listLabelValueReviews,
  type LabelReviewQueueItem, type LabelValueReview } from "@/api/quality";
import ReviewTaskSelector from "./ReviewTaskSelector.vue";

const { can } = usePermission(), router = useRouter();
const rows = ref<LabelReviewQueueItem[]>([]), loading = ref(false), error = ref("");
const status = ref("PENDING"), taskId = ref(""), current = ref(1), size = ref(20), total = ref(0);
const selected = ref<LabelReviewQueueItem>(), history = ref<LabelValueReview[]>([]);
const historyOpen = ref(false), historyLoading = ref(false), historyError = ref("");
let generation = 0, historyGeneration = 0;
async function refresh() {
  if (!can("iqc:review:view")) return;
  const ticket = ++generation;
  loading.value = true; error.value = "";
  try {
    const page = await listLabelReviewQueue({ status: status.value, taskId: taskId.value.trim() || undefined,
      current: current.value, size: size.value });
    if (ticket !== generation) return;
    rows.value = page.records; total.value = page.total;
  } catch {
    if (ticket === generation) { rows.value = []; total.value = 0; error.value = "标签复核待办加载失败，请重试。"; }
  } finally { if (ticket === generation) loading.value = false; }
}
function filter() { current.value = 1; void refresh(); }
function page(next: number, nextSize: number) {
  current.value = nextSize === size.value ? next : 1; size.value = nextSize; void refresh();
}
function open(row: LabelReviewQueueItem) {
  if (!row.currentResult || !can("iqc:result:view") || !can("iqc:task:view")) return;
  void router.push({ path: "/tasks", query: { taskId: row.taskId, view: "results", labelResultId: row.labelResultId } });
}
async function showHistory(row: LabelReviewQueueItem) {
  const ticket = ++historyGeneration;
  selected.value = row; history.value = []; historyOpen.value = true; historyLoading.value = true; historyError.value = "";
  try {
    const rounds = await listLabelValueReviews(row.labelResultId);
    if (ticket === historyGeneration) history.value = rounds;
  } catch { if (ticket === historyGeneration) historyError.value = "历史加载失败，请关闭后重试。"; }
  finally { if (ticket === historyGeneration) historyLoading.value = false; }
}
function closeHistory() { historyGeneration++; historyOpen.value = false; }
function statusLabel(value: string) {
  return ({ PENDING: "待处理", COMPLETED: "已完成", REJECTED: "已退回" } as Record<string, string>)[value] || value;
}
function decisionLabel(round: LabelValueReview) {
  if (round.status !== "COMPLETED") return "—";
  try {
    const value = JSON.parse(round.reviewedResultJson || "null") as { sourceLabelResultId?: string; status?: string; value?: unknown } | null;
    if (!value || value.sourceLabelResultId !== round.labelResultId) return "修订内容不可展示";
    if (value.status === "UNKNOWN") return "未知";
    if (value.status === "KNOWN" && ["boolean", "string", "number"].includes(typeof value.value))
      return value.value === false ? "否" : value.value === true ? "是" : String(value.value);
  } catch { /* Backend rejects invalid projections; keep the UI fail-closed too. */ }
  return "修订内容不可展示";
}
defineExpose({ refresh });
onMounted(refresh);
</script>

<template>
  <section aria-label="标签复核待办">
    <a-alert v-if="!can('iqc:review:view')" type="info" message="没有查看标签复核的权限。" />
    <template v-else>
      <a-alert type="info" show-icon message="按任务权限展示复核轮次；已被新执行替代的标签值只能查看原历史，不能在当前结果中裁决。" />
      <a-form layout="inline" style="margin:16px 0">
        <a-form-item label="复核状态"><a-select v-model:value="status" :options="[{value:'PENDING',label:'待处理'},{value:'COMPLETED',label:'已完成'},{value:'REJECTED',label:'已退回'},{value:'ALL',label:'全部'}]" style="width:120px" /></a-form-item>
        <a-form-item label="任务"><ReviewTaskSelector v-model="taskId" /></a-form-item>
        <a-form-item><a-button type="primary" :loading="loading" @click="filter">查询标签复核</a-button></a-form-item>
      </a-form>
      <a-alert v-if="error" type="error" :message="error" />
      <a-table :data-source="rows" :loading="loading" row-key="reviewId" :pagination="false" :scroll="{x:1100}">
        <a-table-column title="任务" data-index="taskName" />
        <a-table-column title="会话" data-index="conversationId" />
        <a-table-column title="标签"><template #default="{record}">
          <div>{{ record.labelName || record.labelId }}</div>
          <small v-if="record.labelName">{{ record.labelId }} · V{{ record.labelVersionNo }}</small>
        </template></a-table-column>
        <a-table-column title="标签值"><template #default="{record}">
          <div>{{ record.valueDescription || record.valueCode }}</div>
          <small v-if="record.valueDescription">编码：{{ record.valueCode }}</small>
        </template></a-table-column>
        <a-table-column title="轮次" data-index="reviewRevision" />
        <a-table-column title="状态"><template #default="{record}">{{ statusLabel(record.status) }}</template></a-table-column>
        <a-table-column title="申请原因" data-index="requestComment" ellipsis />
        <a-table-column title="申请人" data-index="createdBy" />
        <a-table-column title="结果版本"><template #default="{record}"><a-tag :color="record.currentResult ? 'blue' : 'warning'">{{ record.currentResult ? '当前结果' : '已被替代' }}</a-tag></template></a-table-column>
        <a-table-column title="操作" :width="190" fixed="right"><template #default="{record}"><a-space>
          <a-button v-if="can('iqc:result:view')" type="link" :disabled="!record.currentResult || !can('iqc:task:view')"
            :title="!record.currentResult ? '该结果已被新执行替代' : !can('iqc:task:view') ? '需要任务查看权限' : undefined"
            @click="open(record)">打开结果</a-button>
          <a-button type="link" @click="showHistory(record)">复核历史</a-button>
        </a-space></template></a-table-column>
      </a-table>
      <a-pagination :current="current" :page-size="size" :total="total" show-size-changer style="margin-top:16px;text-align:right" @change="page" />
      <a-drawer :open="historyOpen" title="标签值复核历史（只读）" width="min(720px, calc(100vw - 24px))" @close="closeHistory">
        <p v-if="selected">任务 {{ selected.taskName }} · 会话 {{ selected.conversationId }} · 标签 {{ selected.labelName || selected.labelId }} / {{ selected.valueDescription || selected.valueCode }}</p>
        <small v-if="selected && (selected.labelName || selected.valueDescription)">标签 ID：{{ selected.labelId }} · 值编码：{{ selected.valueCode }}</small>
        <a-alert v-if="historyError" type="error" :message="historyError" />
        <a-spin :spinning="historyLoading"><a-timeline v-if="history.length">
          <a-timeline-item v-for="round in history" :key="round.id">
            第 {{ round.reviewRevision }} 轮 · {{ statusLabel(round.status) }}<br />
            申请人：{{ round.createdBy || '—' }} · 原因：{{ round.requestComment || '—' }}<br />
            复核人：{{ round.reviewerId || '—' }} · 裁决原因：{{ round.reviewComment || '—' }}<br />
            人工结论：{{ decisionLabel(round) }}
          </a-timeline-item>
        </a-timeline><a-empty v-else-if="!historyLoading && !historyError" description="没有复核轮次" /></a-spin>
      </a-drawer>
    </template>
  </section>
</template>
