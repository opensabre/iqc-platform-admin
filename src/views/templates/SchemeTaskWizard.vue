<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import ConversationPicker from "@/components/ConversationPicker.vue";
import { createSchemeTask, type PublishedTemplate, type SchemeTaskRequest, type SchemeItem } from "@/api/schemes";
import { getTask, runTask, type InspectionTask } from "@/api/tasks";
import { usePermission } from "@/composables/permission";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{ template: PublishedTemplate; readOnly?: boolean; historicalVersion?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const { can } = usePermission();
const auth = useAuthStore();
const limits = props.template.snapshot.definition.runLimits;
const hasConditions = props.template.snapshot.definition.items.some(item => item.appliesWhen);
const hasLabels = Boolean(props.template.snapshot.definition.labels?.length);
const hasInputScope = props.template.snapshot.definition.items.some(item => item.inputScope != null);
const hasItemRoutes = props.template.snapshot.definition.items.some(item => item.execution != null);
const executionVariants = props.template.snapshot.definition.executionVariants;
const variantOptions = executionVariants?.variants ?? [];
const executionMode = props.template.snapshot.dependencies.executionMode;
const supportedRoute = ["RULE_ONLY", "INDEPENDENT"].includes(executionMode);
const routeName = !supportedRoute ? "暂不支持的执行路线" : hasItemRoutes ? "逐项冻结路线"
  : executionMode === "RULE_ONLY" ? "仅规则检查" : "各项独立检测";
const capabilityBlocked = !supportedRoute;
/** Standard explanations use frozen dependencies, never today's editable rule catalogue. */
function conditionName(item: SchemeItem) {
  const reference = item.appliesWhen;
  return props.template.snapshot.dependencies.rules?.find(rule => rule.id === reference?.id
    && rule.versionNo === reference.versionNo)?.name?.trim() || "模板指定的业务条件";
}
const maxConversations = limits?.maxConversations ?? 1000;
const ownerId = String(auth.user?.userId || auth.user?.id || "");
const pendingKey = ownerId ? `iqc-template-submit:${ownerId}:${props.template.schemeId}:${props.template.versionNo}` : "";
type PendingSubmission = { contentHash: string; request: SchemeTaskRequest; taskId?: string };
function validPendingRequest(request: SchemeTaskRequest | undefined) {
  if (!request || !/^[A-Za-z0-9_-]{16,64}$/.test(request.requestId)
    || !request.name?.trim() || request.name.length > 128
    || !Number.isInteger(request.concurrency) || request.concurrency < 1
    || request.concurrency > (limits?.maxConcurrency ?? 1)
    || (executionVariants
      ? !variantOptions.some(variant => variant.code === request.variantCode)
      : request.variantCode !== undefined)) return false;
  if (request.taskType === "SCHEDULED") {
    const filter = request.selectionFilter;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(request.scheduledTime)
      && filter?.status === "IMPORTED" && Number.isInteger(filter.limit)
      && filter.limit >= 1 && filter.limit <= maxConversations
      && (filter.fileName === undefined || (typeof filter.fileName === "string" && filter.fileName.length <= 255));
  }
  return (request.taskType === undefined || request.taskType === "BATCH")
    && Array.isArray(request.conversationIds) && request.conversationIds.length > 0
    && request.conversationIds.length <= maxConversations
    && request.conversationIds.every(id => typeof id === "string" && !!id.trim());
}
function localDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
const defaultScheduledTime = localDateTime(new Date(Date.now() + 60 * 60 * 1000));
function readPending(): PendingSubmission | undefined {
  if (props.readOnly || capabilityBlocked || !pendingKey) return;
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey) || "null") as PendingSubmission | null;
    const request = value?.request;
    if (value?.contentHash !== props.template.contentHash
      || (value.taskId !== undefined && (typeof value.taskId !== "string" || !value.taskId.trim()))
      || !validPendingRequest(request)) return;
    return value;
  } catch { return; }
}
const recovered = readPending();
const step = ref(recovered ? 2 : 0);
const selectedVariantCode = ref(recovered?.request.variantCode ?? executionVariants?.recommendedCode);
type TaskType = "BATCH" | "SCHEDULED";
const taskType = ref<TaskType>(recovered?.request.taskType === "SCHEDULED" ? "SCHEDULED" : "BATCH");
const name = ref(recovered?.request.name ?? (props.template.snapshot.name.endsWith("质检")
  ? props.template.snapshot.name : `${props.template.snapshot.name}质检`));
const recoveredIds = recovered?.request.taskType === "SCHEDULED" ? [] : recovered?.request.conversationIds ?? [];
const ids = ref<string[]>(recoveredIds.slice());
const concurrency = ref<number | null>(recovered?.request.concurrency ?? limits?.defaultConcurrency ?? 1);
const scheduledTime = ref(recovered?.request.taskType === "SCHEDULED" ? recovered.request.scheduledTime : defaultScheduledTime);
const scheduleLimit = ref<number | null>(recovered?.request.taskType === "SCHEDULED"
  ? recovered.request.selectionFilter.limit : maxConversations);
const scheduleFileName = ref(recovered?.request.taskType === "SCHEDULED"
  ? recovered.request.selectionFilter.fileName ?? "" : "");
const validSettings = computed(() => {
  const common = !!name.value.trim() && name.value.trim().length <= 128
    && Number.isInteger(concurrency.value) && concurrency.value! >= 1 && concurrency.value! <= (limits?.maxConcurrency ?? 1);
  if (!common) return false;
  if (taskType.value === "BATCH") return ids.value.length > 0 && ids.value.length <= maxConversations;
  const dueAt = Date.parse(scheduledTime.value);
  return Number.isFinite(dueAt) && dueAt > Date.now()
    && Number.isInteger(scheduleLimit.value) && scheduleLimit.value! >= 1 && scheduleLimit.value! <= maxConversations
    && scheduleFileName.value.length <= 255;
});
const busy = ref(false);
const error = ref("");
const task = ref<InspectionTask | undefined>(recovered?.taskId ? { id: recovered.taskId, status: "CREATED" } as InspectionTask : undefined);
// Keep the exact payload after the first attempt: a timeout may happen after the server committed.
const submitted = ref<SchemeTaskRequest | undefined>(recovered?.request);
const persistentRetry = ref(Boolean(pendingKey));
const allowed = computed(() => !capabilityBlocked && can("iqc:scheme:use") && can("iqc:task:execute") && can("iqc:conversation:view"));
function savePending() {
  if (!pendingKey || !submitted.value) { persistentRetry.value = false; return; }
  try { sessionStorage.setItem(pendingKey, JSON.stringify({ contentHash: props.template.contentHash,
    request: submitted.value, ...(task.value ? { taskId: task.value.id } : {}) } satisfies PendingSubmission)); }
  catch { persistentRetry.value = false; /* In-memory retries remain safe while the modal stays open. */ }
}
function clearPending() {
  if (!pendingKey) return;
  try { sessionStorage.removeItem(pendingKey); } catch { /* Storage may be unavailable. */ }
}
async function submit() {
  if (props.readOnly || !allowed.value || busy.value) return;
  if (!submitted.value && !validSettings.value) { error.value = "请检查任务名称、会话数量和允许的整数并发范围。"; return; }
  submitted.value ??= taskType.value === "SCHEDULED"
    ? { requestId: crypto.randomUUID(), name: name.value.trim(), concurrency: concurrency.value!, taskType: "SCHEDULED",
      scheduledTime: scheduledTime.value, selectionFilter: { status: "IMPORTED", limit: scheduleLimit.value!,
        ...(scheduleFileName.value.trim() ? { fileName: scheduleFileName.value.trim() } : {}) },
      ...(selectedVariantCode.value ? { variantCode: selectedVariantCode.value } : {}) }
    : { requestId: crypto.randomUUID(), name: name.value.trim(), conversationIds: [...ids.value], concurrency: concurrency.value!,
      ...(selectedVariantCode.value ? { variantCode: selectedVariantCode.value } : {}) };
  savePending();
  busy.value = true; error.value = "";
  try {
    task.value = task.value ? await getTask(task.value.id)
      : await createSchemeTask(props.template.schemeId, props.template.versionNo, submitted.value);
    savePending();
    if (submitted.value.taskType !== "SCHEDULED" && task.value.status === "CREATED") task.value = await runTask(task.value.id);
    if (task.value.status === "CREATED") throw new Error("任务已创建但尚未进入执行队列，请重试提交。");
    clearPending();
    step.value = 3;
  } catch (reason) {
    error.value = `${task.value ? "任务已创建，重试只会继续提交此任务。" : "提交未确认，重试会使用同一请求标识。"} ${reason instanceof Error ? reason.message : "请稍后重试。"}`;
  } finally { busy.value = false; }
}
function viewTask() { if (task.value) { emit("close"); void router.push({ path: "/tasks", query: { taskId: task.value.id } }); } }
function minScheduledTime() { return localDateTime(new Date(Date.now() + 60 * 1000)); }
</script>
<template>
  <a-modal :open="true" :title="readOnly ? '查看已发布检查标准' : '使用业务模板'" :width="900" :footer="null" :mask-closable="false" :closable="!busy" :keyboard="!busy" @cancel="emit('close')">
    <a-steps v-if="!readOnly && step < 3" :current="step" size="small" :items="[{ title: '确认模板' }, { title: taskType === 'SCHEDULED' ? '设置计划' : '选择会话' }, { title: taskType === 'SCHEDULED' ? '确认计划' : '确认执行' }]" style="margin: 16px 0 24px" />
    <template v-if="step === 0">
      <h3>{{ template.snapshot.name }} <a-tag>V{{ template.versionNo }}</a-tag></h3>
      <a-alert v-if="historicalVersion" message="你选择了历史发布版本。本次任务会冻结并使用该版本，不会自动切换到较新标准。" type="warning" show-icon style="margin-bottom: 12px" />
      <p>{{ template.snapshot.description || '按统一业务标准检查每个会话，并生成评分和可追溯证据。' }}</p>
      <a-descriptions :column="2" bordered size="small">
        <a-descriptions-item label="业务场景">{{ template.snapshot.businessScene }}</a-descriptions-item>
        <a-descriptions-item label="执行路线">{{ routeName }}</a-descriptions-item>
        <a-descriptions-item label="每批会话上限">{{ maxConversations }} 个</a-descriptions-item>
        <a-descriptions-item label="默认并发">{{ limits?.defaultConcurrency ?? 1 }} 个会话</a-descriptions-item>
        <a-descriptions-item v-if="limits" label="允许并发范围">1–{{ limits.maxConcurrency }} 个会话</a-descriptions-item>
        <a-descriptions-item label="评分方式">{{ !template.snapshot.definition.scoring.items.length ? '不计分' : template.snapshot.definition.scoring.mode === 'POINTS' ? '得分制（归一为百分制）' : '扣分制' }}</a-descriptions-item>
        <a-descriptions-item v-if="template.snapshot.definition.scoring.items.length" label="合格线">{{ template.snapshot.definition.scoring.passingScore }}</a-descriptions-item>
        <a-descriptions-item v-if="template.snapshot.definition.scoring.items.length && template.snapshot.definition.scoring.mode === 'DEDUCTION'" label="基础分">{{ template.snapshot.definition.scoring.baseScore }}</a-descriptions-item>
      </a-descriptions>
      <a-list size="small" :data-source="template.snapshot.definition.items"><template #renderItem="{ item }"><a-list-item><div>{{ item.name }}<p v-if="template.snapshot.definition.scoring.items.some(score => score.itemCode === item.itemCode)">
        {{ template.snapshot.definition.scoring.mode === 'POINTS' ? '满足时得分权重' : '不满足时扣分' }}：{{ template.snapshot.definition.scoring.items.find(score => score.itemCode === item.itemCode)?.points }}
        <a-tag v-if="template.snapshot.definition.scoring.items.find(score => score.itemCode === item.itemCode)?.veto" color="red">不满足时一票否决</a-tag>
      </p><p v-else>仅检查，不计分</p><p v-if="item.appliesWhen">适用范围：仅在“{{ conditionName(item) }}”明确命中时检查；条件完整未命中时，本项不适用、不计分。</p></div></a-list-item></template></a-list>
      <a-alert v-if="hasConditions" message="条件完整评估且未命中时，本项不适用且不计分；条件异常或待复核时任务保持待确认。所有评分项不适用时无分数，不是满分。" type="info" show-icon style="margin-bottom: 12px" />
      <a-alert v-if="hasLabels" message="此模板还会独立生成画像标签；任务结果中可查看标签状态与证据，标签不会改变质检评分。" type="info" show-icon style="margin-bottom: 12px" />
      <a-alert v-if="hasInputScope" message="LLM 按模板冻结的单消息或完整会话范围执行。" type="info" show-icon style="margin-bottom: 12px" />
      <a-alert v-if="hasItemRoutes" message="各质检项按模板冻结的阶段路线执行；中间阶段不直接计分，最终检测结果独立评分。" type="info" show-icon style="margin-bottom: 12px" />
      <a-alert v-if="!supportedRoute" message="此模板的执行路线尚未支持，不能创建任务。请联系专家检查发布版本，不能自动改用另一种路线。" type="warning" show-icon style="margin-bottom: 12px" />
      <a-alert message="规则、评分和检测能力已由专家配置，无需选择智能体。" type="info" show-icon />
      <p v-if="supportedRoute && !hasItemRoutes">{{ executionMode === 'RULE_ONLY' ? '按模板的规则检查各项，不调用 AI。' : '各检查项按自身检测方式独立执行；某项未命中不会跳过其他检查项，不代表每项都经过 AI 复核。' }} 当前使用模板固定策略。</p>
    </template>
    <template v-else-if="step === 1">
      <a-form layout="vertical">
        <a-form-item label="任务名称" required><a-input v-model:value="name" :maxlength="128" /></a-form-item>
        <a-form-item v-if="executionVariants" label="执行方案" required>
          <a-select v-model:value="selectedVariantCode" :options="variantOptions.map(variant => ({
            value: variant.code, label: `${variant.name}${variant.code === executionVariants?.recommendedCode ? '（推荐）' : ''}` }))" />
          <p>{{ variantOptions.find(variant => variant.code === selectedVariantCode)?.coverage }} · 成本与耗时：{{ variantOptions.find(variant => variant.code === selectedVariantCode)?.cost }}</p>
        </a-form-item>
      </a-form>
      <fieldset style="border: 0; padding: 0; margin: 0 0 16px">
        <legend>执行方式</legend>
        <label style="margin-right: 20px"><input v-model="taskType" type="radio" name="scheme-task-type" value="BATCH" :disabled="!!submitted" /> 立即选择会话</label>
        <label><input v-model="taskType" type="radio" name="scheme-task-type" value="SCHEDULED" :disabled="!!submitted" /> 定时筛选导入数据</label>
      </fieldset>
      <template v-if="taskType === 'BATCH'"><ConversationPicker v-model="ids" :max="maxConversations" /></template>
      <template v-else>
        <a-form layout="vertical">
          <a-form-item label="计划执行时间" required><input v-model="scheduledTime" type="datetime-local" :min="minScheduledTime()" aria-label="计划执行时间" /></a-form-item>
          <a-form-item label="到期时最多处理的导入会话数" required><a-input-number v-model:value="scheduleLimit" :min="1" :max="maxConversations" :precision="0" /></a-form-item>
          <a-form-item label="导入文件名包含（可选）"><a-input v-model:value="scheduleFileName" :maxlength="255" placeholder="留空表示当前可见范围内的全部导入数据" /></a-form-item>
        </a-form>
        <a-alert type="info" show-icon message="任务会在计划时间冻结的可见数据范围内筛选当时已导入且匹配的数据；此模板版本和运行设置从现在起固定。之后新增且符合条件的数据也会被纳入。" />
      </template>
      <a-collapse v-if="limits && limits.maxConcurrency > 1" style="margin-top: 16px">
        <a-collapse-panel key="runtime" header="高级运行设置（可选）">
          <a-form layout="vertical"><a-form-item label="同时处理的会话数">
            <a-input-number v-model:value="concurrency" :min="1" :max="limits.maxConcurrency" :precision="0" />
            <p>默认 {{ limits.defaultConcurrency }}，最多 {{ limits.maxConcurrency }}。不确定时保持默认即可。</p>
          </a-form-item></a-form>
        </a-collapse-panel>
      </a-collapse>
    </template>
    <template v-else-if="step === 2">
      <a-alert v-if="recovered" type="info" show-icon message="已恢复上次未确认的提交；重试会使用原会话、参数和请求标识，不会另建任务。" style="margin-bottom: 16px" />
      <a-descriptions :column="1" bordered>
        <a-descriptions-item label="任务名称">{{ name }}</a-descriptions-item>
        <a-descriptions-item label="业务模板">{{ template.snapshot.name }} · V{{ template.versionNo }}</a-descriptions-item>
        <a-descriptions-item label="执行路线">{{ routeName }}（模板固定策略）</a-descriptions-item>
        <a-descriptions-item v-if="selectedVariantCode" label="执行方案">{{ variantOptions.find(variant => variant.code === selectedVariantCode)?.name }} · {{ selectedVariantCode }}</a-descriptions-item>
        <a-descriptions-item v-if="taskType === 'BATCH'" label="数据范围">{{ ids.length }} 个会话</a-descriptions-item>
        <a-descriptions-item v-else label="计划执行时间">{{ scheduledTime }}</a-descriptions-item>
        <a-descriptions-item v-if="taskType === 'SCHEDULED'" label="到期筛选">已导入数据，最多 {{ scheduleLimit }} 个会话{{ scheduleFileName.trim() ? `，文件名包含“${scheduleFileName.trim()}”` : '' }}</a-descriptions-item>
        <a-descriptions-item label="同时处理">{{ concurrency }} 个会话</a-descriptions-item>
      </a-descriptions>
      <p v-if="taskType === 'BATCH'">执行后可在“质检任务”跟踪进度，在结果中查看各质检项、分数和证据。后续模板更新不会改变此任务。</p>
      <p v-else>计划创建后可在“质检任务”查看；到期后自动筛选并开始执行。筛选范围和模板版本不会随之后的修改改变。</p>
      <a-alert v-if="submitted && !task" type="warning" show-icon :message="persistentRetry
        ? '如网络超时，请重试；关闭后在本浏览器会话重开同一模板版本可恢复本次提交。'
        : '如网络超时，请保持当前窗口并重试；浏览器未能保存本次请求，关闭后可能重复创建任务。'" />
      <p v-if="task">任务编号：{{ task.id }}</p>
    </template>
    <a-result v-else status="success" :title="submitted?.taskType === 'SCHEDULED' ? '定时任务已创建' : '任务已提交'" :sub-title="`任务编号：${task?.id}。执行状态和结果以任务详情为准。`"><template #extra><a-button type="primary" @click="viewTask">查看任务</a-button></template></a-result>
    <a-alert v-if="error" type="error" :message="error" show-icon style="margin-top: 16px" />
    <a-alert v-if="!readOnly && !allowed && !capabilityBlocked" type="warning" message="需要模板使用、会话查看和任务执行权限，请联系管理员。" />
    <a-space v-if="!readOnly && step < 3" style="display: flex; justify-content: flex-end; margin-top: 24px">
      <a-button v-if="step > 0" :disabled="busy || !!submitted" @click="step--">上一步</a-button>
      <a-button v-if="step < 2" type="primary" :disabled="!allowed || (step === 1 && !validSettings)" @click="step++">下一步</a-button>
      <a-button v-else type="primary" :loading="busy" :disabled="!allowed || (!submitted && !validSettings)" @click="submit">{{ submitted ? '重试提交' : taskType === 'SCHEDULED' ? '创建定时任务' : '开始质检' }}</a-button>
      <a-button v-if="task && can('iqc:task:view')" :disabled="busy" @click="viewTask">查看已创建任务</a-button>
    </a-space>
  </a-modal>
</template>
