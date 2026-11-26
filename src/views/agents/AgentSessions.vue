<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { getAgentSession, listAgentSessions, queryAgentSessions, queryAgentExecutions, type AgentExecution, type AgentSession, type AgentSessionDetail } from "@/api/agent-sessions";

import AgentExecutionDetails from "./AgentExecutionDetails.vue";
import { listAgents, type QualityAgent } from "@/api/config";

const props = defineProps<{ open: boolean; agentId?: string; agentName?: string; embedded?: boolean }>();
const agents = ref<QualityAgent[]>([]), selectedAgentId = ref<string>();
const agentName = (id: string) => agents.value.find(agent => agent.id === id)?.name || id;
async function loadAgents() {
  try { agents.value = await listAgents(); }
  catch { message.error("智能体筛选列表加载失败，可继续查询会话"); }
}
const emit = defineEmits<{ "update:open": [boolean] }>();
const title = ref(""), owner = ref(""), startedFrom = ref(""), startedTo = ref("");
const sessionId = ref(""), caller = ref(""), source = ref<string>(), versionNo = ref<number>();
const executionStatus = ref<string>();
const statusOptions = [{ value: "SUCCEEDED", label: "含成功执行" }, { value: "FAILED", label: "含失败执行" }, { value: "RUNNING", label: "含进行中的执行" }];
const sourceOptions = [{ value: "TEST", label: "测试聊天" }, { value: "API", label: "外部调用" }];
const sourceName = (value: string) => sourceOptions.find(option => option.value === value)?.label ?? value;
const current = ref(1), size = ref(10), total = ref(0);
const records = ref<AgentSession[]>([]), loading = ref(false), detailLoading = ref(false);
const detail = ref<AgentSessionDetail>(), detailOpen = ref(false);
const view = ref("sessions");
const requestId = ref(""), taskId = ref(""), executionPage = ref(1), executionTotal = ref(0);
const executionResults = ref<AgentExecution[]>([]), executionLoading = ref(false), executionSearched = ref(false);
let executionGeneration = 0;

async function lookupExecutions(page = 1) {
  if (!requestId.value.trim() && !taskId.value.trim()) {
    message.warning("请输入请求 ID 或任务标识");
    return;
  }
  const generation = ++executionGeneration;
  executionLoading.value = true;
  try {
    const result = await queryAgentExecutions({
      requestId: requestId.value.trim() || undefined, businessReference: taskId.value.trim() || undefined,
      current: page, size: 10,
    });
    if (generation !== executionGeneration) return;
    executionResults.value = result.records;
    executionPage.value = result.current;
    executionTotal.value = result.total;
    executionSearched.value = true;
  } catch {
    if (generation === executionGeneration) {
      executionResults.value = [];
      executionTotal.value = 0;
      executionSearched.value = false;
      message.error("执行明细查询失败");
    }
  } finally {
    if (generation === executionGeneration) executionLoading.value = false;
  }
}

const executionsById = computed(() => new Map(detail.value?.executions?.map(execution => [execution.requestId, execution])));
const otherExecutions = computed(() => {
  const linked = new Set(detail.value?.messages.map(turn => turn.requestId));
  return detail.value?.executions?.filter(execution => !linked.has(execution.requestId)) ?? [];
});
let listGeneration = 0, detailGeneration = 0;
const pagination = computed(() => ({ current: current.value, pageSize: size.value, total: total.value, showSizeChanger: false }));
const time = (value?: string) => value ? value.replace("T", " ") : "—";
async function load() {
  const token = ++listGeneration;
  loading.value = true;
  try {
    const filters = {
      current: current.value, size: size.value, title: title.value.trim() || undefined, owner: owner.value.trim() || undefined,
      sessionId: sessionId.value.trim() || undefined, caller: caller.value.trim() || undefined,
      source: source.value, executionStatus: executionStatus.value, versionNo: versionNo.value ?? undefined,
      startedFrom: startedFrom.value || undefined, startedTo: startedTo.value || undefined,
    };
    const page = props.embedded
      ? await queryAgentSessions({ ...filters, agentId: selectedAgentId.value })
      : await listAgentSessions(props.agentId!, filters);
    if (token !== listGeneration) return;
    records.value = page.records; total.value = page.total;
  } catch { if (token === listGeneration) { records.value = []; total.value = 0; message.error("会话历史加载失败，请重试"); } }
  finally { if (token === listGeneration) loading.value = false; }
}
function search() {
  if (startedFrom.value && startedTo.value && startedFrom.value > startedTo.value) { message.warning("开始时间不能晚于结束时间"); return; }
  current.value = 1; void load();
}
function reset() {
  selectedAgentId.value = undefined; title.value = ""; owner.value = ""; startedFrom.value = ""; startedTo.value = "";
  sessionId.value = ""; caller.value = ""; source.value = undefined; versionNo.value = undefined; executionStatus.value = undefined;
  search();
}
function changePage(page: { current?: number }) { current.value = page.current || 1; void load(); }
async function showDetail(session: AgentSession) {
  const token = ++detailGeneration;
  detail.value = undefined; detailOpen.value = true; detailLoading.value = true;
  try {
    const response = await getAgentSession(session.agentId, session.id);
    if (token === detailGeneration) detail.value = response;
  } catch { if (token === detailGeneration) { message.error("会话详情加载失败，请重试"); detailOpen.value = false; } }
  finally { if (token === detailGeneration) detailLoading.value = false; }
}
watch(() => [props.open, props.agentId], () => {
  ++listGeneration; ++detailGeneration; detailOpen.value = false; detail.value = undefined;
  records.value = []; total.value = 0;
  if (props.open && (props.embedded || props.agentId)) {
    reset();
    if (props.embedded) void loadAgents();
  }
}, { immediate: true });
</script>

<template>
  <component :is="embedded ? 'section' : 'a-drawer'" v-bind="embedded ? {} : { open, title: `会话管理 · ${props.agentName}`, width: 'min(1100px, 95vw)' }" @close="emit('update:open', false)">
    <a-radio-group v-if="embedded" v-model:value="view" class="session-filters">
      <a-radio-button value="sessions">会话</a-radio-button>
      <a-radio-button value="execution">按标识查询执行</a-radio-button>
    </a-radio-group>
    <section v-if="view === 'sessions'">
    <a-space wrap class="session-filters">
      <a-select v-if="embedded" v-model:value="selectedAgentId" allow-clear show-search option-filter-prop="label" placeholder="全部智能体" style="width:220px" :options="agents.map(agent => ({ value: agent.id, label: agent.name }))" @change="search"/>
      <a-input v-model:value="title" placeholder="会话标题" allow-clear @press-enter="search" />
      <a-input v-model:value="owner" placeholder="发起人账号" allow-clear @press-enter="search" />
      <a-input v-model:value="sessionId" placeholder="会话 ID" allow-clear @press-enter="search" />
      <a-input v-model:value="caller" placeholder="调用方" allow-clear @press-enter="search" />
      <a-select v-model:value="source" :options="sourceOptions" allow-clear placeholder="全部来源" style="width:130px" @change="search" />
      <a-input-number v-model:value="versionNo" :min="1" :precision="0" placeholder="版本号" @press-enter="search" />
      <a-select v-model:value="executionStatus" :options="statusOptions" allow-clear placeholder="执行结果" style="width:150px" @change="search" />
      <label>开始时间 <input v-model="startedFrom" type="datetime-local" aria-label="开始时间起点" /></label>
      <label>至 <input v-model="startedTo" type="datetime-local" aria-label="开始时间终点" /></label>
      <a-button type="primary" @click="search">查询</a-button><a-button @click="reset">重置</a-button>
    </a-space>
    <a-table :data-source="records" :loading="loading" :pagination="pagination" row-key="id" :scroll="{x:850}" @change="changePage">
      <a-table-column v-if="embedded" title="智能体" :width="160"><template #default="{record}">{{agentName(record.agentId)}}</template></a-table-column>
      <a-table-column title="会话标题" data-index="title" :ellipsis="true" />
      <a-table-column title="来源" :width="70"><template #default="{record}"><a-tag>{{sourceName(record.source)}}</a-tag></template></a-table-column>
      <a-table-column title="发起人" data-index="owner" :width="120" />
      <a-table-column title="版本" :width="70"><template #default="{record}">V{{record.versionNo}}</template></a-table-column>
      <a-table-column title="消息数" data-index="messageCount" :width="80" />
      <a-table-column title="开始时间" :width="180"><template #default="{record}">{{time(record.createdTime)}}</template></a-table-column>
      <a-table-column title="最后消息" :width="180"><template #default="{record}">{{time(record.lastMessageTime)}}</template></a-table-column>
      <a-table-column title="操作" :width="100"><template #default="{record}"><a-button type="link" @click="showDetail(record)">查看消息</a-button></template></a-table-column>
    </a-table>
    </section>
    <section v-else>
      <a-space wrap class="session-filters">
        <a-input v-model:value="requestId" placeholder="请求 ID" allow-clear @press-enter="lookupExecutions()" />
        <a-input v-model:value="taskId" placeholder="任务标识" allow-clear @press-enter="lookupExecutions()" />
        <a-button type="primary" :loading="executionLoading" @click="lookupExecutions()">查询</a-button>
      </a-space>
      <a-collapse v-if="executionResults.length">
        <a-collapse-panel v-for="execution in executionResults" :key="execution.requestId"
          :header="`${time(execution.startedTime)} · ${execution.requestId}`">
          <AgentExecutionDetails :execution="execution" />
        </a-collapse-panel>
      </a-collapse>
      <a-empty v-else-if="executionSearched && !executionLoading" description="未找到匹配的执行记录" />
      <a-pagination v-if="executionTotal > 10" :current="executionPage" :total="executionTotal" :page-size="10"
        :show-size-changer="false" @change="lookupExecutions" />
    </section>
    <a-modal v-model:open="detailOpen" :title="detail?.session.title || '会话详情'" :footer="null" width="min(800px, 94vw)">
      <a-spin :spinning="detailLoading">
        <template v-if="detail">
          <p class="session-help">{{detail.session.owner}} · V{{detail.session.versionNo}} · {{sourceName(detail.session.source)}}</p>
          <div class="session-messages">
            <article v-for="(turn,index) in detail.messages" :key="index" class="session-message">
              <div><strong>{{turn.role === 'user' ? '用户' : '智能体'}}</strong><span class="message-time">{{time(turn.time)}}</span></div>
              <p>{{turn.content}}</p>
              <div v-if="turn.role === 'assistant'" class="session-help">{{turn.model || '模型未返回名称'}} · {{turn.latencyMillis}} ms<span v-if="turn.calledTools?.length"> · 工具：{{turn.calledTools.join('、')}}</span></div>
              <details v-if="turn.requestId && executionsById.has(turn.requestId)">
                <summary>执行明细</summary>
                <AgentExecutionDetails :execution="executionsById.get(turn.requestId)!" />
              </details>
            </article>
          </div>
          <a-collapse v-if="otherExecutions.length">
            <a-collapse-panel v-for="execution in otherExecutions" :key="execution.requestId"
              :header="`执行 · ${time(execution.startedTime)}`">
              <AgentExecutionDetails :execution="execution" />
            </a-collapse-panel>
          </a-collapse>
        </template>
      </a-spin>
    </a-modal>
  </component>
</template>

<style scoped>
.session-help{color:var(--text-secondary,#666);font-size:13px}.session-filters{margin-bottom:16px}.session-filters label{display:flex;align-items:center;gap:8px}.session-filters input[type=datetime-local]{padding:4px 8px;border:1px solid #d9d9d9;border-radius:6px;background:transparent;color:inherit}.session-messages{max-height:65vh;overflow:auto}.session-message{padding:16px 0;border-bottom:1px solid #eee}.session-message p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.message-time{margin-left:12px;color:#888;font-size:12px}
</style>
