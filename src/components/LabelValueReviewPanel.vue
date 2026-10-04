<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import type { LabelResult } from "@/api/results";
import { getConversationResultDetail } from "@/api/results";
import { listLabelValueReviews, requestLabelValueReview, decideLabelValueReview,
  type LabelValueDecision, type LabelValueReview } from "@/api/quality";
import { usePermission } from "@/composables/permission";
import { presentLabel } from "@/views/tasks/label-results";

const props = defineProps<{ label: LabelResult; taskId: string; taskStatus: string }>();
const emit = defineEmits<{ locate: [messageId: string]; changed: [] }>();
const { can } = usePermission();
const history = ref<LabelValueReview[]>([]);
const messages = ref<Array<{ id: string; sequenceNo: number; content: string; speakerRole: string }>>([]);
const loaded = ref(false), loading = ref(false), busy = ref(false), error = ref("");
const requestComment = ref(""), comment = ref(""), status = ref<"KNOWN" | "UNKNOWN">(), value = ref<string | number | boolean>();
const evidence = ref<string[]>([]);
type Command = { kind: "REQUEST"; id: string; payload: { expectedRevision: number; requestId: string; comment: string } }
  | { kind: "DECIDE"; id: string; payload: { expectedRevision: number; decision: "COMPLETED" | "REJECTED"; labelDecision?: LabelValueDecision; comment: string } };
const command = ref<Command>();
let generation = 0;
const machine = computed(() => presentLabel(props.label));
const valueType = computed(() => {
  try {
    const payload = JSON.parse(props.label.valueJson || "null") as { schemaVersion?: string; valueType?: string } | null;
    return payload?.schemaVersion === "iqc-label-result-v2" ? payload.valueType : undefined;
  } catch { return undefined; }
});
const eligible = computed(() => machine.value.valid && machine.value.state !== "HIT"
  && ["BOOLEAN", "FIXED", "PERCENTAGE", "MONTH", "DURATION_MONTHS", "DATE"].includes(valueType.value || ""));
const terminal = computed(() => ["SUCCEEDED", "PARTIAL_FAILED", "FAILED", "CANCELLED"].includes(props.taskStatus));
const pending = computed(() => history.value.find(item => item.status === "PENDING"));
const revision = computed(() => Math.max(0, ...history.value.map(item => item.reviewRevision)));
const rounds = computed(() => history.value.map(review => {
  let projection: { sourceLabelResultId: string; status: "KNOWN" | "UNKNOWN"; value: unknown; evidenceMessageIds: string[] } | undefined;
  if (review.status === "COMPLETED") {
    try {
      const parsed = JSON.parse(review.reviewedResultJson || "null");
      if (!parsed || parsed.sourceLabelResultId !== props.label.id || !["KNOWN", "UNKNOWN"].includes(parsed.status)
        || !Array.isArray(parsed.evidenceMessageIds)) throw new Error();
      projection = parsed;
    } catch { /* Never present an invalid human projection as a confirmed value. */ }
  }
  return { review, projection };
}));
const damaged = computed(() => rounds.value.some(row => row.review.status === "COMPLETED" && !row.projection));
const latestCompleted = computed(() => rounds.value.find(row => row.review.status === "COMPLETED")?.projection);
const editable = computed(() => loaded.value && eligible.value && terminal.value && !loading.value && !busy.value && !command.value && !damaged.value);
const messageOptions = computed(() => messages.value.map(item => ({ value: item.id,
  label: `#${item.sequenceNo} ${item.speakerRole} ${item.content.slice(0, 80)}` })));
function display(value: unknown) { return value === true ? "是" : value === false ? "否" : value == null ? "—" : String(value); }
async function refresh() {
  if (!can("iqc:review:view")) return;
  const ticket = ++generation, id = props.label.id;
  loaded.value = false; loading.value = true; error.value = "";
  try {
    const [reviews, detail] = await Promise.all([
      listLabelValueReviews(id), getConversationResultDetail(props.taskId, props.label.conversationId),
    ]);
    if (ticket !== generation) return;
    history.value = reviews; messages.value = detail.messages; loaded.value = true;
  } catch { if (ticket === generation) error.value = "标签复核历史或会话证据加载失败，请刷新后重试。"; }
  finally { if (ticket === generation) loading.value = false; }
}
watch(() => props.label.id, () => {
  generation++; history.value = []; messages.value = []; loaded.value = false; command.value = undefined;
  requestComment.value = ""; comment.value = ""; status.value = undefined; value.value = undefined; evidence.value = [];
  void refresh();
}, { immediate: true });
async function submit() {
  const current = command.value;
  if (!current || busy.value || !can(current.kind === "REQUEST" ? "iqc:review:create" : "iqc:review:decide")) return;
  busy.value = true; error.value = "";
  const id = props.label.id;
  try {
    if (current.kind === "REQUEST") await requestLabelValueReview(current.id, current.payload);
    else await decideLabelValueReview(current.id, current.payload);
    if (id !== props.label.id) return;
    command.value = undefined; requestComment.value = ""; comment.value = ""; evidence.value = [];
    message.success(current.kind === "REQUEST" ? "标签复核已发起" : "标签裁决已保存，机器标签值和评分未被覆盖");
    await refresh();
    emit("changed");
  } catch {
    if (id === props.label.id) error.value = "提交结果未确认，请保持内容不变并重试原提交；若提示版本已变化，请刷新历史。";
  } finally { busy.value = false; }
}
async function request() {
  if (!editable.value || pending.value || !can("iqc:review:create") || !requestComment.value.trim()) return;
  command.value = { kind: "REQUEST", id: props.label.id,
    payload: { expectedRevision: revision.value, requestId: crypto.randomUUID(), comment: requestComment.value.trim() } };
  await submit();
}
async function decide(rejected: boolean) {
  if (!editable.value || !pending.value || !can("iqc:review:decide") || !comment.value.trim()) return;
  if (!rejected && (!status.value || status.value === "KNOWN" && (value.value === undefined || !evidence.value.length))) return;
  const labelDecision: LabelValueDecision | undefined = rejected ? undefined : {
    status: status.value!, value: status.value === "KNOWN" ? value.value! : null,
    evidenceMessageIds: status.value === "KNOWN" ? [...evidence.value] : [],
  };
  command.value = { kind: "DECIDE", id: pending.value.id,
    payload: { expectedRevision: pending.value.reviewRevision, decision: rejected ? "REJECTED" : "COMPLETED",
      labelDecision, comment: comment.value.trim() } };
  await submit();
}
</script>

<template>
  <section aria-label="标签值复核">
    <p>机器结果：{{ machine.title }} · {{ machine.value }}。人工修订独立保存，不覆盖机器标签值或评分。</p>
    <a-alert v-if="!eligible" type="info" message="此标签值不是有效的新版冻结结果，暂不能人工修订。" />
    <a-alert v-else-if="!can('iqc:review:view')" type="info" message="没有查看标签复核的权限。" />
    <template v-else>
      <a-space><a-button :disabled="loading || busy || !!command" @click="refresh">刷新复核历史</a-button>
        <a-button v-if="command" :loading="busy" :disabled="busy" @click="submit">重试原提交</a-button></a-space>
      <a-alert v-if="error" type="error" show-icon :message="error" />
      <a-alert v-if="!terminal" type="info" message="任务结束后才能复核标签值。" />
      <a-alert v-if="damaged" type="error" message="历史人工修订无法验证，已停止后续操作，请联系管理员。" />
      <a-spin :spinning="loading">
        <p v-if="latestCompleted">当前有效人工修订：{{ latestCompleted.status === 'KNOWN' ? display(latestCompleted.value) : '未知' }}；机器值仍保留。</p>
        <a-form v-if="loaded && !pending && can('iqc:review:create')" layout="vertical">
          <a-form-item label="申请原因"><a-textarea v-model:value="requestComment" :maxlength="1000" :rows="2" :disabled="!editable" /></a-form-item>
          <a-button type="primary" :disabled="!editable || !requestComment.trim()" @click="request">发起标签复核</a-button>
        </a-form>
        <a-card v-if="pending" size="small" :title="`第 ${pending.reviewRevision} 轮 · 待复核`">
          <p>申请原因：{{ pending.requestComment }}</p>
          <a-form v-if="can('iqc:review:decide')" layout="vertical">
            <a-form-item label="人工状态"><a-select v-model:value="status" :disabled="!editable" :options="[{ value: 'KNOWN', label: '确定' }, { value: 'UNKNOWN', label: '未知' }]" /></a-form-item>
            <a-form-item v-if="status === 'KNOWN'" :label="`人工值（${valueType}）`">
              <a-select v-if="valueType === 'BOOLEAN'" v-model:value="value" :disabled="!editable" :options="[{ value: true, label: '是' }, { value: false, label: '否' }]" />
              <a-input-number v-else-if="['PERCENTAGE','MONTH','DURATION_MONTHS'].includes(valueType || '')" v-model:value="value" :disabled="!editable"
                :min="valueType === 'MONTH' ? 1 : 0" :max="valueType === 'PERCENTAGE' ? 100 : valueType === 'MONTH' ? 12 : undefined"
                :precision="valueType === 'PERCENTAGE' ? 2 : 0" style="width:100%" />
              <a-input v-else v-model:value="value" :disabled="!editable" :placeholder="valueType === 'DATE' ? 'YYYY-MM-DD' : '请输入冻结类型对应的值'" />
            </a-form-item>
            <a-form-item v-if="status === 'KNOWN'" label="依据消息（至少一条）"><a-select v-model:value="evidence" mode="multiple" :disabled="!editable" :options="messageOptions" option-filter-prop="label" :max-tag-count="3" /></a-form-item>
            <a-form-item label="裁决 / 退回原因"><a-textarea v-model:value="comment" :maxlength="1000" :rows="2" :disabled="!editable" /></a-form-item>
            <a-space><a-button type="primary" :disabled="!editable || !comment.trim() || !status || (status === 'KNOWN' && (value === undefined || !evidence.length))" @click="decide(false)">保存标签修订</a-button>
              <a-button :disabled="!editable || !comment.trim()" @click="decide(true)">退回本轮</a-button></a-space>
          </a-form>
          <p v-else>当前账号没有裁决权限，请交由有权限的复核人员处理。</p>
        </a-card>
        <a-collapse v-if="rounds.length">
          <a-collapse-panel v-for="row in rounds" :key="row.review.id" :header="`第 ${row.review.reviewRevision} 轮 · ${{PENDING:'待复核',COMPLETED:'已完成',REJECTED:'已退回'}[row.review.status]}`">
            <p>申请人：{{ row.review.createdBy || '—' }} · 申请原因：{{ row.review.requestComment }}</p>
            <p>复核人：{{ row.review.reviewerId || '—' }} · {{ row.review.reviewedTime || '尚未裁决' }}</p>
            <p>裁决原因：{{ row.review.status === 'PENDING' ? '—' : row.review.reviewComment }}</p>
            <p v-if="row.projection">人工结论：{{ row.projection.status === 'KNOWN' ? display(row.projection.value) : '未知' }}
              <a-button v-for="id in row.projection.evidenceMessageIds" :key="id" type="link" :disabled="!messages.some(item => item.id === id)" @click="emit('locate', id)">定位证据 #{{ messages.find(item => item.id === id)?.sequenceNo || id }}</a-button></p>
            <a-alert v-else-if="row.review.status === 'COMPLETED'" type="error" message="人工修订快照无法读取" />
          </a-collapse-panel>
        </a-collapse>
      </a-spin>
    </template>
  </section>
</template>
