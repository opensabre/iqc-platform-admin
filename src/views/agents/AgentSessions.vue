<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { getAgentSession, listAgentSessions, queryAgentSessions, type AgentSession, type AgentSessionDetail } from "@/api/agent-sessions";

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
const current = ref(1), size = ref(10), total = ref(0);
const records = ref<AgentSession[]>([]), loading = ref(false), detailLoading = ref(false);
const detail = ref<AgentSessionDetail>(), detailOpen = ref(false);
let listGeneration = 0, detailGeneration = 0;
const pagination = computed(() => ({ current: current.value, pageSize: size.value, total: total.value, showSizeChanger: false }));
const time = (value?: string) => value ? value.replace("T", " ") : "—";
async function load() {
  const token = ++listGeneration;
  loading.value = true;
  try {
    const filters = {
      current: current.value, size: size.value, title: title.value.trim() || undefined, owner: owner.value.trim() || undefined,
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
function reset() { selectedAgentId.value = undefined; title.value = ""; owner.value = ""; startedFrom.value = ""; startedTo.value = ""; search(); }
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
    <p class="session-help">查询智能体的历史对话。测试聊天标记为“测试”，仅记录功能启用后的成功问答。</p>
    <a-space wrap class="session-filters">
      <a-select v-if="embedded" v-model:value="selectedAgentId" allow-clear show-search option-filter-prop="label" placeholder="全部智能体" style="width:220px" :options="agents.map(agent => ({ value: agent.id, label: agent.name }))" @change="search"/>
      <a-input v-model:value="title" placeholder="会话标题" allow-clear @press-enter="search" />
      <a-input v-model:value="owner" placeholder="发起人账号" allow-clear @press-enter="search" />
      <label>开始时间 <input v-model="startedFrom" type="datetime-local" aria-label="开始时间起点" /></label>
      <label>至 <input v-model="startedTo" type="datetime-local" aria-label="开始时间终点" /></label>
      <a-button type="primary" @click="search">查询</a-button><a-button @click="reset">重置</a-button>
    </a-space>
    <a-table :data-source="records" :loading="loading" :pagination="pagination" row-key="id" :scroll="{x:850}" @change="changePage">
      <a-table-column v-if="embedded" title="智能体" :width="160"><template #default="{record}">{{agentName(record.agentId)}}</template></a-table-column>
      <a-table-column title="会话标题" data-index="title" :ellipsis="true" />
      <a-table-column title="来源" :width="70"><template #default="{record}"><a-tag>{{record.source === 'TEST' ? '测试' : '正式'}}</a-tag></template></a-table-column>
      <a-table-column title="发起人" data-index="owner" :width="120" />
      <a-table-column title="版本" :width="70"><template #default="{record}">V{{record.versionNo}}</template></a-table-column>
      <a-table-column title="消息数" data-index="messageCount" :width="80" />
      <a-table-column title="开始时间" :width="180"><template #default="{record}">{{time(record.createdTime)}}</template></a-table-column>
      <a-table-column title="最后消息" :width="180"><template #default="{record}">{{time(record.lastMessageTime)}}</template></a-table-column>
      <a-table-column title="操作" :width="100"><template #default="{record}"><a-button type="link" @click="showDetail(record)">查看消息</a-button></template></a-table-column>
    </a-table>
    <a-modal v-model:open="detailOpen" :title="detail?.session.title || '会话详情'" :footer="null" width="min(800px, 94vw)">
      <a-spin :spinning="detailLoading">
        <template v-if="detail">
          <p class="session-help">{{detail.session.owner}} · V{{detail.session.versionNo}} · {{detail.session.source === 'TEST' ? '测试会话' : '正式会话'}}</p>
          <div class="session-messages">
            <article v-for="(turn,index) in detail.messages" :key="index" class="session-message">
              <div><strong>{{turn.role === 'user' ? '用户' : '智能体'}}</strong><span class="message-time">{{time(turn.time)}}</span></div>
              <p>{{turn.content}}</p>
              <div v-if="turn.role === 'assistant'" class="session-help">{{turn.model || '模型未返回名称'}} · {{turn.latencyMillis}} ms<span v-if="turn.calledTools?.length"> · 工具：{{turn.calledTools.join('、')}}</span></div>
            </article>
          </div>
        </template>
      </a-spin>
    </a-modal>
  </component>
</template>

<style scoped>
.session-help{color:var(--text-secondary,#666);font-size:13px}.session-filters{margin-bottom:16px}.session-filters label{display:flex;align-items:center;gap:8px}.session-filters input[type=datetime-local]{padding:4px 8px;border:1px solid #d9d9d9;border-radius:6px;background:transparent;color:inherit}.session-messages{max-height:65vh;overflow:auto}.session-message{padding:16px 0;border-bottom:1px solid #eee}.session-message p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.message-time{margin-left:12px;color:#888;font-size:12px}
</style>
