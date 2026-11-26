<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { listAgents, listAgentVersions, type QualityAgent, type QualityAgentVersion } from "@/api/config";
import {
  createAgentApplication, listAgentApplications, updateAgentApplication,
  type AgentApplication, type AgentApplicationCommand, type AgentGrant,
} from "@/api/agent-applications";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const canCreate = computed(() => auth.permissions.includes("iac:consumer:create"));
const canEdit = computed(() => auth.permissions.includes("iac:consumer:update"));
const applications = ref<AgentApplication[]>([]);
const agents = ref<QualityAgent[]>([]);
const versions = ref<Record<string, QualityAgentVersion[]>>({});
const loading = ref(false);
const saving = ref(false);
const editing = ref(false);
const open = ref(false);
const initial = (): AgentApplicationCommand => ({ clientId: "", displayName: "", enabled: true, perMinute: 20, perDay: 200, grants: [] });
const draft = ref<AgentApplicationCommand>(initial());
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

async function load() {
  loading.value = true;
  try { applications.value = await listAgentApplications(); }
  catch (error) { message.error(errorText(error, "接入应用加载失败")); }
  finally { loading.value = false; }
}
async function loadAgents() {
  try { agents.value = await listAgents(); }
  catch (error) { message.error(errorText(error, "智能体列表加载失败")); }
}
async function loadVersions(agentId: string) {
  if (!agentId) return;
  try {
    versions.value[agentId] = (await listAgentVersions(agentId)).filter(version => version.status === "PUBLISHED");
  } catch (error) { message.error(errorText(error, "版本列表加载失败")); }
}
async function changeAgent(grant: AgentGrant) {
  grant.versionNo = undefined;
  await loadVersions(grant.agentId);
}
function start(application?: AgentApplication) {
  editing.value = !!application;
  draft.value = application ? {
    clientId: application.clientId, displayName: application.displayName, enabled: application.enabled,
    perMinute: application.perMinute, perDay: application.perDay,
    grants: application.grants.map(grant => ({ ...grant })),
  } : initial();
  open.value = true;
  void loadAgents();
  for (const agentId of new Set(draft.value.grants.map(grant => grant.agentId))) void loadVersions(agentId);
}
async function save() {
  const command = { ...draft.value, clientId: draft.value.clientId.trim(), displayName: draft.value.displayName.trim() };
  const grantKeys = command.grants.map(grant => `${grant.agentId}:${grant.versionNo}`);
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(command.clientId) || !command.displayName || !command.perMinute || !command.perDay
      || command.grants.some(grant => !grant.agentId || !grant.versionNo) || new Set(grantKeys).size !== grantKeys.length) {
    message.warning("请填写客户端 ID、名称、配额及完整且唯一的版本授权");
    return;
  }
  saving.value = true;
  try {
    if (editing.value) await updateAgentApplication(command);
    else await createAgentApplication(command);
    open.value = false;
    message.success("接入应用已保存");
    await load();
  } catch (error) { message.error(errorText(error, "接入应用保存失败")); }
  finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <section class="page-intro"><div><h2>接入应用</h2><p>将 OAuth 客户端绑定到已发布的智能体版本，并设置请求配额。</p></div></section>
  <a-card :bordered="false">
    <a-space class="actions">
      <a-button v-if="canCreate" type="primary" @click="start()">登记应用</a-button>
      <a-button :loading="loading" @click="load">刷新</a-button>
    </a-space>
    <a-table :data-source="applications" :loading="loading" row-key="clientId" :scroll="{ x: 780 }">
      <a-table-column title="应用名称" data-index="displayName" />
      <a-table-column title="OAuth 客户端 ID" data-index="clientId" />
      <a-table-column title="状态"><template #default="{ record }"><a-tag :color="record.enabled ? 'green' : undefined">{{ record.enabled ? '启用' : '停用' }}</a-tag></template></a-table-column>
      <a-table-column title="本分钟用量"><template #default="{ record }">{{ record.requestsThisMinute }} / {{ record.perMinute }}</template></a-table-column>
      <a-table-column title="今日用量（UTC）"><template #default="{ record }">{{ record.requestsToday }} / {{ record.perDay }}</template></a-table-column>
      <a-table-column title="授权版本数"><template #default="{ record }">{{ record.grants.length }}</template></a-table-column>
      <a-table-column v-if="canEdit" title="操作"><template #default="{ record }"><a-button type="link" @click="start(record)">编辑</a-button></template></a-table-column>
    </a-table>
  </a-card>

  <a-modal v-model:open="open" :title="editing ? '编辑接入应用' : '登记接入应用'" width="min(720px, 95vw)"
    :confirm-loading="saving" ok-text="保存" cancel-text="取消" @ok="save">
    <a-form layout="vertical">
      <a-form-item label="OAuth 客户端 ID" required>
        <a-input v-model:value="draft.clientId" :disabled="editing" :maxlength="128" />
        <div class="field-help">使用授权服务中仅允许 client_credentials 的客户端，添加 iac.invoke scope。凭据由授权服务管理。</div>
      </a-form-item>
      <a-form-item label="应用名称" required><a-input v-model:value="draft.displayName" :maxlength="120" /></a-form-item>
      <a-space wrap>
        <a-form-item label="启用"><a-switch v-model:checked="draft.enabled" /></a-form-item>
        <a-form-item label="每分钟请求上限" required><a-input-number v-model:value="draft.perMinute" :min="1" :max="10000" :precision="0" /></a-form-item>
        <a-form-item label="每日请求上限" required><a-input-number v-model:value="draft.perDay" :min="1" :max="1000000" :precision="0" /></a-form-item>
      </a-space>
      <a-form-item label="智能体版本授权">
        <div v-for="(grant, index) in draft.grants" :key="index" class="grant-row">
          <a-select v-model:value="grant.agentId" placeholder="选择智能体" show-search option-filter-prop="label"
            :options="agents.map(agent => ({ value: agent.id, label: agent.name }))" @change="changeAgent(grant)" />
          <a-select v-model:value="grant.versionNo" placeholder="选择已发布版本"
            :options="(versions[grant.agentId] || []).map(version => ({ value: version.versionNo, label: `V${version.versionNo} · ${version.name}` }))" />
          <a-button type="text" danger @click="draft.grants.splice(index, 1)">移除</a-button>
        </div>
        <a-button :disabled="draft.grants.length >= 100" @click="draft.grants.push({ agentId: '' })">添加授权</a-button>
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.actions { margin-bottom: 16px; }
.field-help { color: var(--text-secondary, #666); margin-top: 4px; }
.grant-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; margin-bottom: 8px; }
</style>
