<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Modal, message } from "ant-design-vue";
import { createMcpServer, disableMcpServer, enableMcpServer, listMcpServers, updateMcpServer, type IqcMcpServer, type IqcMcpServerRequest } from "@/api/config";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import { usePermission } from "@/composables/permission";

const mcps = ref<IqcMcpServer[]>([]); const loading = ref(false); const saving = ref(false); const modalOpen = ref(false); const selected = ref<IqcMcpServer>();
const transports = ref<DictionaryItem[]>([{ value: "STREAMABLE_HTTP", label: "Streamable HTTP" }, { value: "SSE", label: "SSE" }]);
const authTypes = ref<DictionaryItem[]>([{ value: "NONE", label: "无认证" }, { value: "BEARER", label: "Bearer Token" }, { value: "HEADER", label: "自定义请求头" }]);
const emptyForm = (): IqcMcpServerRequest => ({ name: "", code: "", description: "", transport: "STREAMABLE_HTTP", endpoint: "", authType: "NONE", secretRef: "", timeoutSeconds: 30, allowedToolsJson: "[]" });
const form = ref<IqcMcpServerRequest>(emptyForm()); const { can } = usePermission();
const canSave = computed(() => can(selected.value ? "iqc:mcp:update" : "iqc:mcp:manage"));
function canStatus(item:IqcMcpServer){return can(item.status === "DISABLED" ? "iqc:mcp:enable" : "iqc:mcp:disable");}
let disposed = false, generation = 0;
async function refresh() {
  if (disposed) return;
  const current = ++generation;
  if(!can("iqc:mcp:view")){mcps.value=[];loading.value=false;return;}
  loading.value = true;
  try { const rows = await listMcpServers(); if (!disposed && current === generation) mcps.value = rows; }
  catch { if (!disposed && current === generation) message.error("MCP 加载失败"); }
  finally { if (!disposed && current === generation) loading.value = false; }
}
async function dictionaries() { try { const data = await getCachedDictionaries(["iqc_mcp_transport", "iqc_mcp_auth_type"]); if (disposed) return; if (data.iqc_mcp_transport?.length) transports.value = data.iqc_mcp_transport; if (data.iqc_mcp_auth_type?.length) authTypes.value = data.iqc_mcp_auth_type; } catch { /* 使用安全的本地兜底选项。 */ } }
function createNew() { if (disposed || saving.value || !can("iqc:mcp:manage")) return; selected.value = undefined; form.value = emptyForm(); modalOpen.value = true; }
function edit(item: IqcMcpServer) { if (disposed || saving.value || !can("iqc:mcp:view")) return; selected.value = item; form.value = { name:item.name, code:item.code, description:item.description || "", transport:item.transport, endpoint:item.endpoint, authType:item.authType, secretRef:item.secretRef || "", timeoutSeconds:item.timeoutSeconds, allowedToolsJson:item.allowedToolsJson || "[]" }; modalOpen.value = true; }
async function save() { if (disposed || saving.value || !modalOpen.value || !canSave.value) return; if (!form.value.name || !form.value.code || !form.value.endpoint) { message.warning("请填写名称、编码和地址"); return; } if (form.value.authType !== "NONE" && !form.value.secretRef) { message.warning("认证配置只能填写平台密钥引用，不能为空"); return; } try { const tools = JSON.parse(form.value.allowedToolsJson || "[]"); if (!Array.isArray(tools)) throw new Error(); } catch { message.warning("工具白名单必须是 JSON 数组"); return; }
  const id = selected.value?.id; const command = { ...form.value }; const permission=id?"iqc:mcp:update":"iqc:mcp:manage";
  saving.value = true;
  try {
    if (id) await updateMcpServer(id, command); else await createMcpServer(command);
    if (disposed || !can(permission)) return;
    message.success(id ? "MCP 已更新" : "MCP 已创建"); modalOpen.value = false; await refresh();
  } catch { if (!disposed) message.error("保存未确认，请核对配置后再重试"); }
  finally { if (!disposed) saving.value = false; }
}

function changeStatus(item:IqcMcpServer) { if (disposed || !canStatus(item)) return; const id=item.id; const enabling=item.status === "DISABLED"; const permission=enabling?"iqc:mcp:enable":"iqc:mcp:disable"; Modal.confirm({ title:`${enabling ? "启用" : "停用"} MCP`, content: enabling ? "启用后可被 Agent 选择。" : "停用后不能被新 Agent 版本选择，历史版本不受影响。", async onOk(){ if(disposed || !can(permission)) return; if(enabling) await enableMcpServer(id); else await disableMcpServer(id); if(!disposed) await refresh(); } }); }
watch(() => can("iqc:mcp:view"), allowed => { if(!allowed){generation++;mcps.value=[];modalOpen.value=false;}else void refresh(); });
watch(() => [can("iqc:mcp:manage"),can("iqc:mcp:update")], ([create,update],[oldCreate,oldUpdate]) => {if(modalOpen.value && (selected.value?oldUpdate&&!update:oldCreate&&!create))modalOpen.value=false;});
watch(modalOpen, visible => { if (!visible) { form.value = emptyForm(); selected.value = undefined; } });
onBeforeUnmount(() => { disposed = true; generation++; form.value = emptyForm(); selected.value = undefined; mcps.value = []; });
onMounted(() => { void Promise.all([refresh(), dictionaries()]); });
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AGENT ASSETS</span><h2>MCP 管理</h2><p>集中管理 MCP 服务地址、认证引用和工具白名单，不保存密钥明文。</p></div><a-button v-if="can('iqc:mcp:manage')" type="primary" @click="createNew">创建 MCP</a-button></section>
  <a-card :bordered="false"><a-table :data-source="mcps" :loading="loading" row-key="id" :scroll="{x:1000}"><a-table-column title="名称" data-index="name" :width="160"/><a-table-column title="编码" data-index="code" :width="160"/><a-table-column title="传输" data-index="transport" :width="150"/><a-table-column title="服务地址" data-index="endpoint"/><a-table-column title="健康" data-index="healthStatus" :width="90"/><a-table-column title="状态" :width="80"><template #default="{record}"><a-tag :color="record.status === 'ENABLED' ? 'green' : 'default'">{{ record.status === 'ENABLED' ? '启用' : '停用' }}</a-tag></template></a-table-column><a-table-column title="操作" :width="150" fixed="right"><template #default="{record}"><a-button type="link" @click="edit(record)">查看/编辑</a-button><a-button v-if="canStatus(record)" type="link" :danger="record.status === 'ENABLED'" @click="changeStatus(record)">{{record.status === 'ENABLED' ? '停用' : '启用'}}</a-button></template></a-table-column></a-table></a-card>
  <a-modal v-model:open="modalOpen" :title="selected ? `编辑 MCP：${selected.name}` : '创建 MCP'" width="min(720px, calc(100vw - 32px))" :styles="{body:{maxHeight:'calc(100vh - 190px)',overflowY:'auto'}}" :confirm-loading="saving" :closable="!saving" :mask-closable="!saving" :keyboard="!saving" :cancel-button-props="{disabled:saving}" :ok-button-props="{disabled:!canSave}" @ok="save"><a-form layout="vertical" :disabled="saving || !canSave">
    <a-row :gutter="16"><a-col :span="12"><a-form-item label="名称" required><a-input v-model:value="form.name"/></a-form-item></a-col><a-col :span="12"><a-form-item label="编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected)" placeholder="例如 KNOWLEDGE_MCP"/></a-form-item></a-col></a-row>
    <a-form-item label="说明"><a-input v-model:value="form.description"/></a-form-item><a-row :gutter="16"><a-col :span="12"><a-form-item label="传输类型" required><a-select v-model:value="form.transport"><a-select-option v-for="item in transports" :key="item.value" :value="item.value">{{item.label}}</a-select-option></a-select></a-form-item></a-col><a-col :span="12"><a-form-item label="超时秒数"><a-input-number v-model:value="form.timeoutSeconds" :min="1" :max="300" style="width:100%"/></a-form-item></a-col></a-row>
    <a-form-item label="服务地址" required><a-input v-model:value="form.endpoint" placeholder="https://mcp.example.com/mcp"/></a-form-item><a-row :gutter="16"><a-col :span="12"><a-form-item label="认证方式"><a-select v-model:value="form.authType"><a-select-option v-for="item in authTypes" :key="item.value" :value="item.value">{{item.label}}</a-select-option></a-select></a-form-item></a-col><a-col :span="12"><a-form-item label="平台密钥引用"><a-input v-model:value="form.secretRef" :disabled="form.authType === 'NONE'" placeholder="例如 secrets/iqc/mcp-token"/></a-form-item></a-col></a-row>
    <a-alert type="info" show-icon message="这里只填写平台密钥引用，不要填写 Token 或密码明文。" style="margin-bottom:16px"/><a-form-item label="允许调用的工具（JSON 数组）"><a-textarea v-model:value="form.allowedToolsJson" :rows="4" placeholder='["search", "lookup"]'/></a-form-item>
  </a-form></a-modal>
</template>
