<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { message, Modal } from "ant-design-vue";
import { useRouter } from "vue-router";
import {
  cancelTask,
  createTask,
  getTask,
  listTasks,
  runTask,
  type InspectionTask,
} from "@/api/tasks";
import {
  listAgents,
  listRules,
  listRuleSets,
  type QualityAgent,
  type QualityRule,
  type QualityRuleSet,
} from "@/api/config";
import { usePermission } from "@/composables/permission";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import {
  listConversations,
  type ConversationSummary,
} from "@/api/conversations";
import {
  getBatchResultSummary,
  getConversationResultDetail,
  type BatchResultSummary,
  type ConversationResultDetail,
  type InspectionResult,
} from "@/api/results";

const tasks = ref<InspectionTask[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const modalOpen = ref(false);
const creating = ref(false);
const currentStep = ref(0);
const router = useRouter();
const createSteps = [
  { title: "任务信息", description: "名称与执行方式" },
  { title: "数据范围", description: "会话或筛选条件" },
  { title: "质检方案", description: "Agent 与规则" },
  { title: "执行与确认", description: "并发及配置预览" },
];
const agents = ref<QualityAgent[]>([]);
const rules = ref<QualityRule[]>([]);
const ruleSets = ref<QualityRuleSet[]>([]);
const conversations = ref<ConversationSummary[]>([]);
const detailOpen = ref(false);
const detail = ref<InspectionTask>();
const resultOpen = ref(false),
  conversationResultOpen = ref(false),
  resultLoading = ref(false);
const batchResult = ref<BatchResultSummary>();
const conversationResult = ref<ConversationResultDetail>();
const taskStatuses = ref<DictionaryItem[]>([]);
let pollingTimer: number | undefined;
const form = ref({
  name: "",
  taskType: "BATCH" as "BATCH" | "SCHEDULED" | "SAMPLE",
  conversationIds: [] as string[],
  scheduledTime: "",
  createdRange: [] as string[],
  fileName: "",
  status: "IMPORTED",
  ownerGroupId: "",
  employeeId: "",
  customerExternalId: "",
  channel: "",
  businessNo: "",
  limit: 1000,
  sampleSize: 100,
  sampleSeed: "",
  agentId: "",
  ruleSetId: "",
  ruleIds: [] as string[],
  concurrencyLimit: 4,
});
const selectedAgent = computed(() =>
  agents.value.find((item) => item.id === form.value.agentId)
);
const selectedRules = computed(() =>
  rules.value.filter((item) => form.value.ruleIds.includes(item.id))
);
const selectedRuleSet = computed(() =>
  ruleSets.value.find((item) => item.id === form.value.ruleSetId)
);
const { can } = usePermission();
const statusMap: Record<string, { label: string; color: string }> = {
  CREATED: { label: "待处理", color: "default" },
  QUEUED: { label: "排队中", color: "processing" },
  SCHEDULED: { label: "等待调度", color: "processing" },
  MATERIALIZING: { label: "正在选取会话", color: "processing" },
  RUNNING: { label: "质检中", color: "processing" },
  SUCCEEDED: { label: "已完成", color: "success" },
  PARTIAL_FAILED: { label: "部分失败", color: "warning" },
  FAILED: { label: "失败", color: "error" },
  NO_DATA: { label: "无匹配数据", color: "default" },
  CANCELLED: { label: "已取消", color: "default" },
};
function statusLabel(status: string) {
  return (
    taskStatuses.value.find((item) => item.value === status)?.label ||
    statusMap[status]?.label ||
    status
  );
}
async function loadDictionaries() {
  try {
    const data = await getCachedDictionaries(["iqc_task_status"]);
    if (data.iqc_task_status?.length) taskStatuses.value = data.iqc_task_status;
  } catch {
    /* 治理中心不可用时保留本地展示兜底 */
  }
}

async function refresh() {
  loading.value = true;
  try {
    const [taskPage, agentList, ruleList, ruleSetList, conversationPage] =
      await Promise.all([
        listTasks({ current: page.value, size: pageSize.value }),
        listAgents(),
        listRules(),
        listRuleSets(),
        listConversations({ current: 1, size: 100 }),
      ]);
    tasks.value = taskPage.records;
    total.value = taskPage.total;
    agents.value = agentList.filter((item) => item.status === "PUBLISHED");
    rules.value = ruleList.filter((item) => item.status === "PUBLISHED");
    ruleSets.value = ruleSetList.filter((item) => item.status === "PUBLISHED");
    conversations.value = conversationPage.records.filter(
      (item) => item.status === "IMPORTED"
    );
  } catch {
    message.error("任务列表加载失败");
  } finally {
    loading.value = false;
  }
}
async function poll() {
  if (
    !tasks.value.some((item) =>
      ["SCHEDULED", "MATERIALIZING", "QUEUED", "RUNNING"].includes(item.status)
    )
  )
    return;
  try {
    const result = await listTasks({
      current: page.value,
      size: pageSize.value,
    });
    tasks.value = result.records;
    total.value = result.total;
  } catch {
    /* 刷新失败不打断正在执行的任务 */
  }
}
async function changePage(current: number, size: number) {
  page.value = current;
  pageSize.value = size;
  await refresh();
}
async function showDetail(id: string) {
  try {
    detail.value = await getTask(id);
    detailOpen.value = true;
  } catch {
    message.error("任务详情加载失败");
  }
}
function openCreate() {
  const recent = localStorage.getItem("iqc-last-conversation-id");
  form.value = {
    name: "",
    taskType: "BATCH",
    conversationIds:
      recent && conversations.value.some((item) => item.id === recent)
        ? [recent]
        : [],
    scheduledTime: "",
    createdRange: [],
    fileName: "",
    status: "IMPORTED",
    ownerGroupId: "",
    employeeId: "",
    customerExternalId: "",
    channel: "",
    businessNo: "",
    limit: 1000,
    sampleSize: 100,
    sampleSeed: "",
    agentId: agents.value[0]?.id || "",
    ruleSetId: ruleSets.value[0]?.id || "",
    ruleIds: [],
    concurrencyLimit: 4,
  };
  currentStep.value = 0;
  modalOpen.value = true;
}
function validateStep(step: number) {
  if (
    step === 1 &&
    form.value.taskType === "BATCH" &&
    !form.value.conversationIds.length
  ) {
    message.warning("请至少选择一个会话");
    return false;
  }
  if (
    step === 1 &&
    form.value.taskType === "SCHEDULED" &&
    !form.value.scheduledTime
  ) {
    message.warning("请选择计划执行时间");
    return false;
  }
  if (step === 2 && !form.value.agentId) {
    message.warning("请选择已发布 Agent");
    return false;
  }
  if (step === 2 && !form.value.ruleSetId && !form.value.ruleIds.length) {
    message.warning("请选择已发布规则集或至少一条规则");
    return false;
  }
  return true;
}
function nextStep() {
  if (validateStep(currentStep.value)) currentStep.value += 1;
}
function openRelated(path: string) {
  window.open(router.resolve(path).href, "_blank", "noopener,noreferrer");
}
async function submit() {
  if (![1, 2].every(validateStep)) return;
  creating.value = true;
  try {
    await createTask({
      name: form.value.name || undefined,
      taskType: form.value.taskType,
      conversationIds:
        form.value.taskType === "BATCH"
          ? form.value.conversationIds
          : undefined,
      scheduledTime:
        form.value.taskType === "SCHEDULED"
          ? form.value.scheduledTime
          : undefined,
      sampleSize: form.value.taskType === "SAMPLE" ? form.value.sampleSize : undefined,
      sampleSeed: form.value.taskType === "SAMPLE" ? form.value.sampleSeed || undefined : undefined,
      selectionFilter:
        form.value.taskType !== "BATCH"
          ? {
              createdFrom: form.value.createdRange?.[0],
              createdTo: form.value.createdRange?.[1],
              fileName: form.value.fileName || undefined,
              status: form.value.status || undefined,
              ownerGroupId: form.value.ownerGroupId || undefined,
              employeeId: form.value.employeeId || undefined,
              customerExternalId: form.value.customerExternalId || undefined,
              channel: form.value.channel || undefined,
              businessNo: form.value.businessNo || undefined,
              limit: form.value.limit,
            }
          : undefined,
      agentId: form.value.agentId,
      ruleSetId: form.value.ruleSetId || undefined,
      ruleIds: form.value.ruleSetId ? undefined : form.value.ruleIds,
      concurrencyLimit: form.value.concurrencyLimit,
    });
    message.success(
      form.value.taskType === "SCHEDULED" ? "定时质检任务已创建"
        : form.value.taskType === "SAMPLE" ? "抽样质检任务已创建" : "批量质检任务已创建"
    );
    modalOpen.value = false;
    await refresh();
  } catch {
    message.error("任务创建失败，请检查会话、Agent 和规则");
  } finally {
    creating.value = false;
  }
}
function conversationCount(task: InspectionTask) {
  try {
    return task.conversationIdsJson
      ? JSON.parse(task.conversationIdsJson).length
      : task.conversationId
      ? 1
      : 0;
  } catch {
    return task.conversationId ? 1 : 0;
  }
}
async function cancel(id: string) {
  Modal.confirm({
    title: "确认取消任务？",
    content:
      "待处理、排队中或执行中的任务可以取消；执行中的任务会在当前消息完成后停止。",
    async onOk() {
      await cancelTask(id);
      message.success("任务已取消");
      await refresh();
    },
  });
}
async function run(id: string) {
  try {
    await runTask(id);
    message.success("任务已进入执行队列");
    await refresh();
  } catch {
    message.error("任务执行失败");
  }
}
async function showResults(id: string) {
  resultLoading.value = true;
  try {
    batchResult.value = await getBatchResultSummary(id);
    resultOpen.value = true;
  } catch {
    message.error("批次结果加载失败");
  } finally {
    resultLoading.value = false;
  }
}
async function showConversationResult(conversationId: string) {
  if (!batchResult.value) return;
  resultLoading.value = true;
  try {
    conversationResult.value = await getConversationResultDetail(
      batchResult.value.taskId,
      conversationId
    );
    conversationResultOpen.value = true;
  } catch {
    message.error("会话质检明细加载失败");
  } finally {
    resultLoading.value = false;
  }
}
function resultFor(messageId: string): InspectionResult | undefined {
  return conversationResult.value?.results.find(
    (item) => item.messageId === messageId
  );
}
function annotations(result?: InspectionResult) {
  if (!result) return [];
  try {
    return JSON.parse(result.evidenceJson || "[]");
  } catch {
    return [];
  }
}
onMounted(() => {
  void refresh();
  void loadDictionaries();
  pollingTimer = window.setInterval(poll, 3000);
});
onBeforeUnmount(() => {
  if (pollingTimer) window.clearInterval(pollingTimer);
});
</script>

<template>
  <section class="page-intro task-page-intro">
    <div>
      <span class="section-kicker">INSPECTION TASKS</span>
      <h2>质检任务</h2>
      <p>批量选择会话和 Agent，跟踪批次执行进度与结果。</p>
    </div>
    <a-button v-if="can('iqc:task:create')" type="primary" @click="openCreate"
      >新建任务</a-button
    >
  </section>
  <a-card :bordered="false" class="tasks-card">
    <a-table
      :data-source="tasks"
      :loading="loading"
      :pagination="false"
      row-key="id"
    >
      <a-table-column key="name" title="任务名称" data-index="name" />
      <a-table-column key="conversations" title="会话数" :width="90"
        ><template #default="{ record }">{{
          conversationCount(record)
        }}</template></a-table-column
      >
      <a-table-column key="status" title="状态" :width="120"
        ><template #default="{ record }"
          ><a-tag :color="statusMap[record.status]?.color">{{
            statusLabel(record.status)
          }}</a-tag></template
        ></a-table-column
      >
      <a-table-column key="progress" title="进度" :width="220"
        ><template #default="{ record }"
          ><a-progress
            :percent="
              record.totalMessages
                ? Math.round(
                    (record.processedMessages / record.totalMessages) * 100
                  )
                : 0
            "
            size="small" /></template
      ></a-table-column>
      <a-table-column
        key="createdTime"
        title="创建时间"
        data-index="createdTime"
        :width="190"
      />
      <a-table-column key="actions" title="操作" :width="250"
        ><template #default="{ record }"
          ><a-button type="link" @click="showDetail(record.id)">详情</a-button
          ><a-button
            v-if="
              ['SUCCEEDED', 'PARTIAL_FAILED', 'FAILED'].includes(
                record.status
              ) && can('iqc:result:view')
            "
            type="link"
            @click="showResults(record.id)"
            >查看结果</a-button
          ><a-button
            v-if="
              ['CREATED', 'FAILED', 'PARTIAL_FAILED'].includes(record.status) &&
              can('iqc:task:execute')
            "
            type="link"
            @click="run(record.id)"
            >{{
              ["FAILED", "PARTIAL_FAILED"].includes(record.status)
                ? "重试"
                : "执行"
            }}</a-button
          ><a-button
            v-if="
              ['CREATED', 'QUEUED', 'RUNNING'].includes(record.status) &&
              can('iqc:task:cancel')
            "
            type="link"
            danger
            @click="cancel(record.id)"
            >取消</a-button
          ></template
        ></a-table-column
      >
    </a-table>
    <a-pagination
      v-if="total"
      v-model:current="page"
      v-model:page-size="pageSize"
      :total="total"
      show-size-changer
      style="margin-top: 16px; text-align: right"
      @change="changePage"
    />
    <a-empty
      v-if="!loading && !tasks.length"
      description="暂无质检任务，请先导入会话"
    />
  </a-card>
  <a-modal
    v-model:open="modalOpen"
    title="新建质检任务"
    width="min(860px, calc(100vw - 32px))"
    :styles="{
      body: {
        maxHeight: 'calc(100vh - 190px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      },
    }"
  >
    <a-steps
      :current="currentStep"
      :items="createSteps"
      size="small"
      class="task-wizard-steps"
    />
    <div class="task-wizard-body">
      <a-form v-show="currentStep === 0" layout="vertical">
        <a-alert
          type="info"
          show-icon
          message="选择立即处理指定会话，或按条件在计划时间自动选取会话。"
          style="margin-bottom: 16px"
        />
        <a-form-item label="任务类型"
          ><a-radio-group v-model:value="form.taskType"
            ><a-radio-button value="BATCH">立即批量</a-radio-button
            ><a-radio-button value="SAMPLE">随机抽样</a-radio-button
            ><a-radio-button value="SCHEDULED"
              >定时筛选</a-radio-button
            ></a-radio-group
          ></a-form-item
        >
        <a-form-item label="任务名称"
          ><a-input v-model:value="form.name" placeholder="不填则自动生成名称"
        /></a-form-item>
      </a-form>

      <a-form v-show="currentStep === 1" layout="vertical">
        <div class="wizard-heading">
          <div>
            <h3>选择质检数据</h3>
            <p>
              {{
                form.taskType === "BATCH"
                  ? "选择本次要立即质检的已导入会话。"
                  : "设置执行时间和会话筛选范围。"
              }}
            </p>
          </div>
          <a-button type="link" @click="openRelated('/conversations')"
            >管理会话 ↗</a-button
          >
        </div>
        <template v-if="form.taskType === 'BATCH'">
          <a-empty v-if="!conversations.length" description="暂无已导入会话"
            ><a-button type="primary" @click="openRelated('/conversations')"
              >去导入会话</a-button
            ></a-empty
          >
          <a-form-item v-else label="会话数据" required
            ><a-select
              v-model:value="form.conversationIds"
              mode="multiple"
              show-search
              option-filter-prop="label"
              placeholder="选择一个或多个已导入会话"
              ><a-select-option
                v-for="item in conversations"
                :key="item.id"
                :value="item.id"
                :label="item.sourceFileName"
                >{{ item.sourceFileName }} ·
                {{ item.messageCount }}条消息</a-select-option
              ></a-select
            ></a-form-item
          >
        </template>
        <a-row v-else-if="form.taskType === 'SAMPLE'" :gutter="16">
          <a-col :span="12"><a-form-item label="抽样数量" required><a-input-number v-model:value="form.sampleSize" :min="1" :max="1000" style="width:100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="抽样种子"><a-input v-model:value="form.sampleSeed" placeholder="相同种子可复现相同样本" /></a-form-item></a-col>
          <a-col :span="24"><a-alert type="info" show-icon message="从当前可见、已导入会话中稳定随机抽样；创建后会固化会话 ID 和种子。" /></a-col>
        </a-row>
        <template v-else
          ><a-form-item label="计划执行时间" required
            ><a-date-picker
              v-model:value="form.scheduledTime"
              show-time
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 100%" /></a-form-item
          ><a-form-item label="会话创建时间"
            ><a-range-picker
              v-model:value="form.createdRange"
              show-time
              value-format="YYYY-MM-DDTHH:mm:ss"
              style="width: 100%" /></a-form-item
          ><a-form-item label="来源文件名包含"
            ><a-input v-model:value="form.fileName" allow-clear /></a-form-item
          ><a-row :gutter="12"><a-col :span="12"><a-form-item label="沟通员工 ID"><a-input v-model:value="form.employeeId" allow-clear /></a-form-item></a-col><a-col :span="12"><a-form-item label="客户外部 ID"><a-input v-model:value="form.customerExternalId" allow-clear /></a-form-item></a-col></a-row
          ><a-row :gutter="12"><a-col :span="12"><a-form-item label="渠道"><a-input v-model:value="form.channel" allow-clear placeholder="WEB / PHONE / WECHAT" /></a-form-item></a-col><a-col :span="12"><a-form-item label="业务编号"><a-input v-model:value="form.businessNo" allow-clear /></a-form-item></a-col></a-row
          ><a-row :gutter="12"
            ><a-col :span="12"
              ><a-form-item label="会话状态"
                ><a-select v-model:value="form.status"
                  ><a-select-option value="IMPORTED">已导入</a-select-option
                  ><a-select-option value="PARTIAL"
                    >部分导入</a-select-option
                  ></a-select
                ></a-form-item
              ></a-col
            ><a-col :span="12"
              ><a-form-item label="最多选取"
                ><a-input-number
                  v-model:value="form.limit"
                  :min="1"
                  :max="1000"
                  style="width: 100%" /></a-form-item></a-col></a-row
          ><a-form-item label="归属部门 ID"
            ><a-input
              v-model:value="form.ownerGroupId"
              allow-clear
              placeholder="留空则按当前数据权限范围" /></a-form-item
        ></template>
      </a-form>

      <a-form v-show="currentStep === 2" layout="vertical">
        <div class="wizard-heading">
          <div>
            <h3>配置质检方案</h3>
            <p>任务只引用已发布的 Agent 和规则，确保执行版本稳定。</p>
          </div>
        </div>
        <a-form-item label="质检 Agent" required
          ><a-select v-model:value="form.agentId" placeholder="选择已发布 Agent"
            ><a-select-option
              v-for="agent in agents"
              :key="agent.id"
              :value="agent.id"
              >{{ agent.name }}</a-select-option
            ></a-select
          ><a-button
            type="link"
            class="related-link"
            @click="openRelated('/agents')"
            >管理 Agent ↗</a-button
          ></a-form-item
        >
        <a-alert
          v-if="!agents.length"
          type="warning"
          show-icon
          message="暂无已发布 Agent，请先创建并完成审批发布。"
          style="margin-bottom: 16px"
        />
        <a-form-item label="已发布规则集"
          ><a-select
            v-model:value="form.ruleSetId"
            allow-clear
            placeholder="优先选择专业规则集"
            ><a-select-option
              v-for="set in ruleSets"
              :key="set.id"
              :value="set.id"
              >{{ set.name }} · v{{ set.versionNo }}</a-select-option
            ></a-select
          ><a-button
            type="link"
            class="related-link"
            @click="openRelated('/rules/sets')"
            >管理规则集 ↗</a-button
          ></a-form-item
        ><a-form-item label="临时规则组合" :required="!form.ruleSetId"
          ><a-select
            v-model:value="form.ruleIds"
            mode="multiple"
            :disabled="Boolean(form.ruleSetId)"
            placeholder="未选规则集时可临时多选规则"
            ><a-select-option
              v-for="rule in rules"
              :key="rule.id"
              :value="rule.id"
              >{{ rule.name }}</a-select-option
            ></a-select
          ></a-form-item
        >
        <a-alert
          v-if="!rules.length"
          type="warning"
          show-icon
          message="暂无已发布规则，请先创建并发布规则。"
        />
      </a-form>

      <a-form v-show="currentStep === 3" layout="vertical">
        <div class="wizard-heading">
          <div>
            <h3>执行参数与确认</h3>
            <p>确认数据范围和质检方案后创建任务。</p>
          </div>
        </div>
        <a-form-item label="并发数"
          ><a-input-number
            v-model:value="form.concurrencyLimit"
            :min="1"
            :max="32"
          /><template #extra
            >限制同时处理的会话数，同一会话内消息仍按顺序执行。</template
          ></a-form-item
        >
        <a-card size="small" title="任务摘要" class="wizard-summary"
          ><a-descriptions :column="2" size="small"
            ><a-descriptions-item label="任务名称">{{
              form.name || "自动生成"
            }}</a-descriptions-item
            ><a-descriptions-item label="任务类型">{{
              form.taskType === "BATCH" ? "立即批量" : "定时筛选"
            }}</a-descriptions-item
            ><a-descriptions-item label="数据范围">{{
              form.taskType === "BATCH"
                ? `${form.conversationIds.length} 个会话`
                : `最多 ${form.limit} 个会话`
            }}</a-descriptions-item
            ><a-descriptions-item label="执行时间">{{
              form.taskType === "BATCH" ? "创建后手动执行" : form.scheduledTime
            }}</a-descriptions-item
            ><a-descriptions-item label="Agent">{{
              selectedAgent?.name || "未选择"
            }}</a-descriptions-item
            ><a-descriptions-item label="规则方案">{{
              selectedRuleSet?.name ||
              selectedRules.map((item) => item.name).join("、") ||
              "未选择"
            }}</a-descriptions-item
            ><a-descriptions-item label="并发数">{{
              form.concurrencyLimit
            }}</a-descriptions-item></a-descriptions
          ></a-card
        >
      </a-form>
    </div>
    <template #footer
      ><a-button @click="modalOpen = false">取消</a-button
      ><a-button v-if="currentStep > 0" @click="currentStep--">上一步</a-button
      ><a-button
        v-if="currentStep < createSteps.length - 1"
        type="primary"
        @click="nextStep"
        >下一步</a-button
      ><a-button v-else type="primary" :loading="creating" @click="submit"
        >创建任务</a-button
      ></template
    >
  </a-modal>
  <a-drawer v-model:open="detailOpen" title="质检任务详情" width="560"
    ><template v-if="detail"
      ><a-descriptions bordered :column="1"
        ><a-descriptions-item label="任务名称">{{
          detail.name
        }}</a-descriptions-item
        ><a-descriptions-item label="任务类型">批量质检</a-descriptions-item
        ><a-descriptions-item label="状态"
          ><a-tag :color="statusMap[detail.status]?.color">{{
            statusMap[detail.status]?.label || detail.status
          }}</a-tag></a-descriptions-item
        ><a-descriptions-item label="会话/并发"
          >{{ conversationCount(detail) }} 个 /
          {{ detail.concurrencyLimit }}</a-descriptions-item
        ><a-descriptions-item label="进度"
          ><a-progress
            :percent="
              detail.totalMessages
                ? Math.round(
                    (detail.processedMessages / detail.totalMessages) * 100
                  )
                : 0
            " /></a-descriptions-item
        ><a-descriptions-item label="消息统计"
          >总数 {{ detail.totalMessages }}，已处理
          {{ detail.processedMessages }}，失败
          {{ detail.failedMessages }}</a-descriptions-item
        ><a-descriptions-item label="执行次数">{{
          detail.attemptCount || 0
        }}</a-descriptions-item
        ><a-descriptions-item label="当前执行实例">{{
          detail.currentExecutionId || "—"
        }}</a-descriptions-item
        ><a-descriptions-item label="创建时间">{{
          detail.createdTime || "—"
        }}</a-descriptions-item></a-descriptions
      ></template
    ></a-drawer
  >
  <a-drawer
    v-model:open="resultOpen"
    title="批次质检结果"
    width="min(900px, calc(100vw - 24px))"
    ><a-spin :spinning="resultLoading"
      ><template v-if="batchResult"
        ><a-row :gutter="12" style="margin-bottom: 16px"
          ><a-col :span="6"
            ><a-statistic
              title="会话数"
              :value="batchResult.conversationCount" /></a-col
          ><a-col :span="6"
            ><a-statistic
              title="平均分"
              :value="batchResult.averageScore" /></a-col
          ><a-col :span="6"
            ><a-statistic title="命中数" :value="batchResult.hitCount" /></a-col
          ><a-col :span="6"
            ><a-statistic
              title="高风险"
              :value="batchResult.highRiskCount" /></a-col></a-row
        ><a-table
          :data-source="batchResult.conversations"
          row-key="conversationId"
          :pagination="false"
          ><a-table-column
            title="会话"
            data-index="sourceFileName"
          /><a-table-column title="消息/结果" :width="120"
            ><template #default="{ record }"
              >{{ record.messageCount }} / {{ record.resultCount }}</template
            ></a-table-column
          ><a-table-column
            title="平均分"
            data-index="averageScore"
            :width="90"
          /><a-table-column
            title="命中"
            data-index="hitCount"
            :width="70"
          /><a-table-column
            title="高风险"
            data-index="highRiskCount"
            :width="80"
          /><a-table-column title="操作" :width="90"
            ><template #default="{ record }"
              ><a-button
                type="link"
                @click="showConversationResult(record.conversationId)"
                >查看明细</a-button
              ></template
            ></a-table-column
          ></a-table
        ></template
      ></a-spin
    ></a-drawer
  >
  <a-drawer
    v-model:open="conversationResultOpen"
    :title="`会话质检明细：${
      conversationResult?.conversation.sourceFileName || ''
    }`"
    width="min(820px, calc(100vw - 24px))"
    ><a-spin :spinning="resultLoading"
      ><a-timeline v-if="conversationResult"
        ><a-timeline-item
          v-for="item in conversationResult.messages"
          :key="item.id"
          :color="resultFor(item.id)?.resultStatus === 'HIT' ? 'red' : 'green'"
          ><a-card size="small"
            ><template #title
              >#{{ item.sequenceNo }} · {{ item.speakerRole }} ·
              {{ item.relativeTime }}</template
            >
            <p>{{ item.content }}</p>
            <template v-if="resultFor(item.id)"
              ><a-space wrap
                ><a-tag>{{ resultFor(item.id)?.resultStatus }}</a-tag
                ><a-tag color="blue">{{ resultFor(item.id)?.score }}分</a-tag
                ><a-tag v-if="resultFor(item.id)?.riskLevel" color="orange">{{
                  resultFor(item.id)?.riskLevel
                }}</a-tag></a-space
              >
              <p style="margin-top: 8px">{{ resultFor(item.id)?.reason }}</p>
              <div
                v-for="(mark, index) in annotations(resultFor(item.id))"
                :key="index"
              >
                <a-alert
                  type="warning"
                  show-icon
                  :message="`标注：${mark.text || '命中片段'}`"
                  :description="`位置 ${mark.start ?? '-'} ~ ${
                    mark.end ?? '-'
                  }`"
                /></div></template></a-card></a-timeline-item></a-timeline></a-spin
  ></a-drawer>
</template>

<style scoped>
.task-wizard-steps {
  margin: 4px 0 24px;
}
.task-wizard-body {
  min-height: 350px;
  padding: 8px 4px 0;
}
.wizard-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.wizard-heading h3 {
  margin: 0 0 6px;
  color: var(--iqc-slate-900);
  font-size: 18px;
}
.wizard-heading p {
  margin: 0;
  color: var(--iqc-slate-600);
}
.related-link {
  height: auto;
  padding: 6px 0 0;
}
.wizard-summary {
  margin-top: 18px;
  background: var(--iqc-canvas);
}
</style>
