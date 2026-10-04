<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import { usePermission } from "@/composables/permission";
import type { BusinessItemResult, BusinessScoringResult } from "@/api/results";
import { exportBusinessReview } from "@/api/results";
import { listBusinessReviews, requestBusinessReview, decideBusinessReview,
  type BusinessReview, type BusinessReviewProjection, type BusinessReviewRequest, type BusinessReviewVerdict } from "@/api/quality";

const props = defineProps<{ resultId: string; taskStatus: string; readOnly?: boolean; items: BusinessItemResult[];
  messages: Array<{ id: string; sequenceNo: number; content: string; speakerRole?: string }> }>();
const emit = defineEmits<{ locate: [sequenceNo: number] }>();
const { can } = usePermission();
const history = ref<BusinessReview[]>([]), loaded = ref(false), loading = ref(false), busy = ref(false), error = ref("");
const requestComment = ref(""), comment = ref(""), itemCode = ref<string>(), finalStatus = ref<"PASS" | "FAIL" | "NOT_APPLICABLE">();
const evidence = ref<string[]>([]);
type Command = { kind: "REQUEST"; id: string; payload: BusinessReviewRequest } | { kind: "DECIDE"; id: string; payload: BusinessReviewVerdict };
const command = ref<Command>();
let generation = 0;
const exporting = ref(false);
function downloadReview(review: BusinessReview) {
  if (exporting.value || !can("iqc:result:export") || !can("iqc:review:view") || review.status !== "COMPLETED") return;
  Modal.confirm({ title: `导出第 ${review.reviewRevision} 轮人工复核？`,
    content: "导出该轮全部有效项目（含沿用结论），不代表最新结果；机器与人工分数分列，会话分数不可按行求和。",
    async onOk() {
      if (exporting.value) return;
      exporting.value = true;
      try {
        const response = await exportBusinessReview(review.id);
        const url = URL.createObjectURL(response.data);
        try {
          const anchor = document.createElement("a"); anchor.href = url;
          anchor.download = `iqc-business-review-round-${review.reviewRevision}.csv`; anchor.click();
        } finally { URL.revokeObjectURL(url); }
      } catch { message.error("复核导出失败，请核对权限、原始结果及复核快照后重试。"); }
      finally { exporting.value = false; }
    }
  });
}
const pending = computed(() => history.value.find(item => item.status === "PENDING"));
const latestRevision = computed(() => Math.max(0, ...history.value.map(item => item.reviewRevision)));
const terminal = computed(() => ["SUCCEEDED", "PARTIAL_FAILED", "FAILED", "CANCELLED"].includes(props.taskStatus));
const editable = computed(() => !props.readOnly && loaded.value && terminal.value && !loading.value && !busy.value && !command.value);
const selected = computed(() => props.items.find(item => item.itemCode === itemCode.value));
const messageOptions = computed(() => props.messages.map(item => ({ value: item.id, label: `#${item.sequenceNo} ${item.speakerRole || ""} ${item.content.slice(0, 60)}` })));
const rows = computed(() => history.value.map(review => {
  let projection: BusinessReviewProjection | undefined;
  if (review.status === "COMPLETED") {
    try {
      const parsed = JSON.parse(review.reviewedResultJson || "null") as BusinessReviewProjection | null;
      if (!parsed || parsed.sourceResultId !== props.resultId || !Array.isArray(parsed.reviewed?.items)
          || !parsed.reviewed.scoring || !parsed.original?.scoring
          || parsed.reviewed.items.some(item => !Array.isArray(item.matchedMessageIds))) throw new Error();
      projection = parsed;
    } catch { /* Malformed history is visible as an error, never a guessed score. */ }
  }
  return { review, projection };
}));
const damaged = computed(() => rows.value.some(row => row.review.status === "COMPLETED" && !row.projection));
function label(status: string) { return ({ PASS: "满足", FAIL: "不满足", NOT_APPLICABLE: "不适用", ERROR: "执行错误", REVIEW_REQUIRED: "待复核", NOT_EVALUATED: "未评估" } as Record<string, string>)[status] || status; }
function score(scoring: BusinessScoringResult) {
  return scoring.scoreStatus === "FINAL" && scoring.finalScore != null ? Number(scoring.finalScore).toFixed(2)
    : scoring.scoreStatus === "NOT_APPLICABLE" ? "不计分" : "待确认";
}
async function refresh() {
  if (!can("iqc:review:view")) return;
  const ticket = ++generation, id = props.resultId;
  loading.value = true; loaded.value = false; error.value = "";
  try {
    const result = await listBusinessReviews(id);
    if (ticket !== generation) return;
    history.value = result; loaded.value = true;
  } catch { if (ticket === generation) error.value = "复核历史加载失败，请刷新后再操作。"; }
  finally { if (ticket === generation) loading.value = false; }
}
watch(() => props.resultId, () => {
  generation++; history.value = []; loaded.value = false; command.value = undefined;
  requestComment.value = ""; comment.value = ""; itemCode.value = undefined; finalStatus.value = undefined; evidence.value = [];
  void refresh();
}, { immediate: true });

async function submit() {
  const current = command.value;
  if (!current || busy.value || !can(current.kind === "REQUEST" ? "iqc:review:create" : "iqc:review:decide")) return;
  busy.value = true; error.value = "";
  const resultId = props.resultId;
  try {
    if (current.kind === "REQUEST") await requestBusinessReview(current.id, current.payload);
    else await decideBusinessReview(current.id, current.payload);
    if (resultId !== props.resultId) return;
    command.value = undefined; requestComment.value = ""; comment.value = ""; finalStatus.value = undefined; evidence.value = [];
    message.success(current.kind === "REQUEST" ? "复核已发起" : "复核裁决已保存，机器结果未被覆盖");
    await refresh();
  } catch {
    if (resultId === props.resultId) error.value = "提交未确认：请重试原提交。若服务器提示版本过期或结果变化，请重新打开结果核对；不要改动本次内容重复申请。";
  } finally { busy.value = false; }
}
async function request() {
  if (!editable.value || damaged.value || pending.value || !can("iqc:review:create") || !requestComment.value.trim()) return;
  command.value = { kind: "REQUEST", id: props.resultId, payload: { expectedRevision: latestRevision.value, requestId: crypto.randomUUID(), comment: requestComment.value.trim() } };
  await submit();
}
async function decide(rejected: boolean) {
  if (!editable.value || damaged.value || !pending.value || !can("iqc:review:decide") || !comment.value.trim()) return;
  if (!rejected && (!selected.value || !finalStatus.value)) return;
  command.value = { kind: "DECIDE", id: pending.value.id, payload: { expectedRevision: pending.value.reviewRevision,
    decision: rejected ? "REJECTED" : "COMPLETED", comment: comment.value.trim(), items: rejected ? [] : [{
      sourceResultId: props.resultId, itemCode: selected.value!.itemCode, expectedStatus: selected.value!.status,
      finalStatus: finalStatus.value!, reason: comment.value.trim(), evidenceMessageIds: [...evidence.value]
    }] } };
  await submit();
}
</script>

<template>
  <section class="business-review" aria-label="业务质检项复核">
    <h3>人工复核（独立于机器结果）</h3>
    <p>按冻结政策自动重算，不修改原始机器结论。任务业务 CSV 仅导出机器结果；人工结果请按已完成轮次独立导出。</p>
    <a-alert v-if="!can('iqc:review:view')" type="info" message="没有查看复核历史的权限，请联系管理员。" />
    <template v-else>
      <a-space>
        <a-button :disabled="loading || busy || !!command" @click="refresh">刷新复核历史</a-button>
        <a-button v-if="command" :loading="busy" :disabled="busy" @click="submit">重试原提交</a-button>
      </a-space>
      <a-alert v-if="error" type="error" show-icon :message="error" />
      <a-alert v-if="readOnly" type="info" message="当前为只读历史；请打开当前结果详情进行复核。" />
      <a-alert v-else-if="!terminal" type="info" message="任务结束后才能申请或裁决复核。" />
      <a-alert v-if="damaged" type="error" message="历史复核快照损坏，已禁止变更，请联系管理员核对。" />
      <a-spin :spinning="loading">
        <a-empty v-if="loaded && !history.length" description="暂无复核记录，可填写原因发起复核。" />
        <a-form v-if="!readOnly && loaded && !pending && can('iqc:review:create')" layout="vertical">
          <a-form-item label="申请原因"><a-textarea v-model:value="requestComment" :maxlength="1000" :disabled="!editable || damaged" :rows="2" /></a-form-item>
          <a-button type="primary" :disabled="!editable || damaged || !requestComment.trim()" @click="request">发起业务复核</a-button>
        </a-form>
        <a-card v-if="pending" size="small" :title="`第 ${pending.reviewRevision} 轮 · 待复核`">
          <p>申请原因：{{ pending.requestComment }}</p>
          <a-form v-if="!readOnly && can('iqc:review:decide')" layout="vertical">
            <a-form-item label="本轮裁决项目"><a-select v-model:value="itemCode" :disabled="!editable || damaged" :options="items.map(item => ({ value: item.itemCode, label: item.name }))" placeholder="选择一个项目，其余保留前轮裁决" /></a-form-item>
            <p v-if="selected">机器结论：{{ label(selected.status) }}</p>
            <a-form-item label="人工结论"><a-select v-model:value="finalStatus" :disabled="!editable || damaged" :options="[{value:'PASS',label:'满足'},{value:'FAIL',label:'不满足'},{value:'NOT_APPLICABLE',label:'不适用'}]" placeholder="请明确选择" /></a-form-item>
            <a-form-item label="会话证据（可选，不存在性判断可留空）"><a-select v-model:value="evidence" mode="multiple" :disabled="!editable || damaged" :options="messageOptions" option-filter-prop="label" /></a-form-item>
            <a-form-item label="裁决 / 退回原因"><a-textarea v-model:value="comment" :maxlength="1000" :disabled="!editable || damaged" :rows="2" /></a-form-item>
            <a-space>
              <a-button type="primary" :disabled="!editable || damaged || !selected || !finalStatus || !comment.trim()" @click="decide(false)">保存项目裁决并重算</a-button>
              <a-button :disabled="!editable || damaged || !comment.trim()" @click="decide(true)">退回本轮</a-button>
            </a-space>
          </a-form>
          <p v-else-if="!readOnly">当前账号没有裁决权限，请交由有权限的复核人员处理。</p>
        </a-card>
        <a-collapse v-if="rows.length">
          <a-collapse-panel v-for="row in rows" :key="row.review.id" :header="`第 ${row.review.reviewRevision} 轮 · ${{PENDING:'待复核',COMPLETED:'已完成',REJECTED:'已退回'}[row.review.status]}`">
            <p>申请人：{{ row.review.createdBy || '—' }} · 申请原因：{{ row.review.requestComment }}</p>
            <p>复核人：{{ row.review.reviewerId || '—' }} · {{ row.review.reviewedTime || '尚未裁决' }}</p>
            <p>裁决原因：{{ row.review.status === 'PENDING' ? '—' : row.review.reviewComment }}</p>
            <template v-if="row.projection">
              <a-button v-if="can('iqc:result:export')" :loading="exporting" :disabled="exporting || loading || !loaded" @click="downloadReview(row.review)">导出本轮人工复核 CSV</a-button>
              <p>机器分数：{{ score(row.projection.original.scoring) }} → 本轮人工复核分数：{{ score(row.projection.reviewed.scoring) }}</p>
              <p>本轮有效项目结论：未裁决项目沿用机器或前轮结果。</p>
              <ul>
                <li v-for="item in row.projection.reviewed.items" :key="item.itemCode">
                  {{ item.name }}：{{ label(item.status) }}
                  <a-button v-for="id in item.matchedMessageIds" :key="id" type="link" size="small" :disabled="!messages.some(message => message.id === id)" @click="emit('locate', messages.find(message => message.id === id)?.sequenceNo ?? -1)">证据 {{ messages.find(message => message.id === id)?.sequenceNo ?? id }}</a-button>
                </li>
              </ul>
            </template>
            <a-alert v-else-if="row.review.status === 'COMPLETED'" type="error" message="复核快照无法读取" />
          </a-collapse-panel>
        </a-collapse>
      </a-spin>
    </template>
  </section>
</template>

<style scoped>
.business-review { display: grid; gap: 12px; margin: 20px 0; }
.business-review h3, .business-review p { margin: 0 0 8px; }
.business-review :deep(.ant-card), .business-review :deep(.ant-collapse) { margin-top: 12px; }
</style>
