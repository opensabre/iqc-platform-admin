<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePermission } from "@/composables/permission";
import { listBusinessReviewQueue, type BusinessReviewQueueItem } from "@/api/quality";
import BusinessReviewPanel from "./BusinessReviewPanel.vue";
import ReviewTaskSelector from "./ReviewTaskSelector.vue";

const { can } = usePermission(), router = useRouter();
const rows = ref<BusinessReviewQueueItem[]>([]), loading = ref(false), error = ref("");
const status = ref("PENDING"), taskId = ref(""), current = ref(1), size = ref(20), total = ref(0);
const selected = ref<BusinessReviewQueueItem>(), historyOpen = ref(false);
let generation = 0;
async function refresh() {
  if (!can("iqc:review:view")) return;
  const ticket = ++generation;
  loading.value = true; error.value = "";
  try {
    const result = await listBusinessReviewQueue({ status: status.value, taskId: taskId.value.trim() || undefined, current: current.value, size: size.value });
    if (ticket !== generation) return;
    rows.value = result.records; total.value = result.total;
  } catch {
    if (ticket === generation) { rows.value = []; total.value = 0; error.value = "业务复核待办加载失败，请重试。"; }
  } finally { if (ticket === generation) loading.value = false; }
}
function filter() { current.value = 1; void refresh(); }
function page(next: number, nextSize: number) { current.value = nextSize === size.value ? next : 1; size.value = nextSize; void refresh(); }
function open(row: BusinessReviewQueueItem) {
  if (!row.currentResult || !can("iqc:result:view")) return;
  void router.push({ path: "/results", query: { taskId: row.taskId, conversationId: row.conversationId, sourceResultId: row.resultId } });
}
function history(row: BusinessReviewQueueItem) { selected.value = row; historyOpen.value = true; }
function statusLabel(value: string) { return ({PENDING:"待处理",COMPLETED:"已完成",REJECTED:"已退回"} as Record<string,string>)[value] || value; }
defineExpose({ refresh });
onMounted(refresh);
</script>

<template>
  <section aria-label="业务复核待办">
    <a-alert v-if="!can('iqc:review:view')" type="info" message="没有查看业务复核的权限。" />
    <template v-else>
      <a-alert type="info" show-icon message="按所属任务权限显示复核轮次，不代表待检会话数。被新执行替代的结果只能查看原复核历史。" />
      <a-form layout="inline" style="margin:16px 0">
        <a-form-item label="复核状态"><a-select v-model:value="status" :options="[{value:'PENDING',label:'待处理'},{value:'COMPLETED',label:'已完成'},{value:'REJECTED',label:'已退回'},{value:'ALL',label:'全部'}]" style="width:120px" /></a-form-item>
        <a-form-item label="任务"><ReviewTaskSelector v-model="taskId" /></a-form-item>
        <a-form-item><a-button type="primary" :loading="loading" @click="filter">查询业务复核</a-button></a-form-item>
      </a-form>
      <a-alert v-if="error" type="error" :message="error" />
      <a-table :data-source="rows" :loading="loading" row-key="reviewId" :pagination="false" :scroll="{x:1000}">
        <a-table-column title="任务" data-index="taskName" />
        <a-table-column title="会话" data-index="conversationId" />
        <a-table-column title="轮次" data-index="reviewRevision" />
        <a-table-column title="复核状态"><template #default="{record}">{{ statusLabel(record.status) }}</template></a-table-column>
        <a-table-column title="申请原因" data-index="requestComment" ellipsis />
        <a-table-column title="申请人" data-index="createdBy" />
        <a-table-column title="申请时间" data-index="createdTime" />
        <a-table-column title="结果版本"><template #default="{record}"><a-tag :color="record.currentResult ? 'blue' : 'warning'">{{ record.currentResult ? '当前结果' : '已被替代' }}</a-tag></template></a-table-column>
        <a-table-column title="操作" :width="210"><template #default="{record}"><a-space>
          <a-button v-if="can('iqc:result:view')" type="link" :disabled="!record.currentResult" @click="open(record)">打开结果</a-button>
          <a-button type="link" @click="history(record)">复核历史</a-button>
        </a-space></template></a-table-column>
      </a-table>
      <a-pagination :current="current" :page-size="size" :total="total" show-size-changer style="margin-top:16px;text-align:right" @change="page" />
      <a-drawer v-model:open="historyOpen" title="原始结果的复核历史（只读）" width="min(820px, calc(100vw - 24px))" destroy-on-close>
        <BusinessReviewPanel v-if="historyOpen && selected" :key="selected.resultId" :result-id="selected.resultId" task-status="HISTORY_ONLY" read-only :items="[]" :messages="[]" />
      </a-drawer>
    </template>
  </section>
</template>
