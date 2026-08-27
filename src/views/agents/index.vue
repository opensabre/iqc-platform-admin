<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { useRouter } from "vue-router";
import { approveAgent, createAgent, createAgentVersion, disableAgent, listAgents, listMcpServers, listModelProfiles, listSkills, rejectAgent, submitAgent, type AgentRuntimeConfig, type IqcMcpServer, type IqcModelProfile, type IqcSkill, type QualityAgent } from "@/api/config";
import { usePermission } from "@/composables/permission";

const defaults = (): AgentRuntimeConfig => ({ schemaVersion: "2.0", systemPrompt: "你是专业的客服质检 Agent。严格依据已发布规则判断，输出可追溯的理由和证据。", primaryModelProfileId: "", fallbackModelProfileIds: [], mcpServerIds: [], skillIds: [] });
const steps = [
  { title: "基本信息", description: "名称与用途" },
  { title: "大模型", description: "主模型与降级" },
  { title: "能力配置", description: "MCP 与 Skill" },
  { title: "提示词与确认", description: "行为约束与预览" },
];
const router = useRouter();
const { can } = usePermission();
const agents = ref<QualityAgent[]>([]), models = ref<IqcModelProfile[]>([]), mcps = ref<IqcMcpServer[]>([]), skills = ref<IqcSkill[]>([]);
const modalOpen = ref(false), saving = ref(false), assetsLoading = ref(false), legacy = ref(false), currentStep = ref(0);
const selected = ref<QualityAgent>();
const form = ref({ name: "", code: "", description: "" });
const runtime = ref<AgentRuntimeConfig>(defaults());
const primaryModel = computed(() => models.value.find(item => item.id === runtime.value.primaryModelProfileId));
const selectedFallbackModels = computed(() => models.value.filter(item => runtime.value.fallbackModelProfileIds?.includes(item.id)));
const selectedMcps = computed(() => mcps.value.filter(item => runtime.value.mcpServerIds?.includes(item.id)));
const selectedSkills = computed(() => skills.value.filter(item => runtime.value.skillIds?.includes(item.id)));

function parseConfig(value?: string) { try { const parsed = value ? JSON.parse(value) : defaults(); if (parsed.schemaVersion === "2.0") return { ...defaults(), ...parsed }; legacy.value = true; return defaults(); } catch { return defaults(); } }
async function refresh() { try { agents.value = await listAgents(); } catch { message.error("Agent 加载失败"); } }
async function loadAssets() {
  assetsLoading.value = true;
  try {
    const [modelList, mcpList, skillList] = await Promise.all([listModelProfiles(), listMcpServers(), listSkills()]);
    models.value = modelList.filter(item => item.status === "ENABLED"); mcps.value = mcpList.filter(item => item.status === "ENABLED"); skills.value = skillList.filter(item => item.status === "ENABLED");
  } catch { message.error("关联资产加载失败，请检查模型、MCP、Skill 查看权限"); }
  finally { assetsLoading.value = false; }
}
function createNew() { selected.value = undefined; legacy.value = false; currentStep.value = 0; form.value = { name: "", code: "", description: "" }; runtime.value = defaults(); modalOpen.value = true; void loadAssets(); }
function edit(item: QualityAgent) { selected.value = item; legacy.value = false; currentStep.value = 0; form.value = { name: item.name, code: item.code, description: item.description || "" }; runtime.value = parseConfig(item.configJson); modalOpen.value = true; void loadAssets(); }
function validateStep(step: number) {
  if (step === 0 && (!form.value.name.trim() || !form.value.code.trim())) { message.warning("请填写 Agent 名称和编码"); return false; }
  if (step === 1 && !runtime.value.primaryModelProfileId) { message.warning("请选择一个已启用的主模型"); return false; }
  if (step === 3 && !runtime.value.systemPrompt?.trim()) { message.warning("请填写默认提示词"); return false; }
  return true;
}
function next() { if (validateStep(currentStep.value)) currentStep.value += 1; }
function openAsset(path: string) { window.open(router.resolve(path).href, "_blank", "noopener,noreferrer"); }
async function save() {
  if (![0, 1, 3].every(validateStep)) return;
  saving.value = true;
  try {
    const data = { ...form.value, configJson: JSON.stringify(runtime.value) };
    if (selected.value) await createAgentVersion(selected.value.id, data); else await createAgent(data);
    message.success(selected.value ? "已创建 Agent 草稿版本" : "Agent 已创建，可继续提交审批"); modalOpen.value = false; await refresh();
  } catch { message.error("保存失败，请确认所选模型、MCP 和 Skill 仍处于启用状态"); }
  finally { saving.value = false; }
}
async function action(id: string, type: string) { try { if (type === "submit") await submitAgent(id); if (type === "approve") await approveAgent(id); if (type === "reject") await rejectAgent(id); if (type === "disable") await disableAgent(id); await refresh(); } catch { message.error("操作失败"); } }
onMounted(() => void refresh());
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AGENT WORKSHOP</span><h2>智能体列表</h2><p>通过向导关联模型、MCP 与 Skill，所有变更纳入版本审批。</p></div><a-button v-if="can('iqc:agent:manage')" type="primary" @click="createNew">创建 Agent</a-button></section>
  <a-card :bordered="false"><a-table :data-source="agents" :pagination="false" row-key="id"><a-table-column title="名称" data-index="name"/><a-table-column title="编码" data-index="code"/><a-table-column title="版本" data-index="versionNo"/><a-table-column title="状态" data-index="status"/><a-table-column title="操作" :width="340"><template #default="{record}"><a-button type="link" @click="edit(record)">配置</a-button><a-button v-if="record.status==='DRAFT'&&can('iqc:agent:manage')" type="link" @click="action(record.id,'submit')">提交</a-button><a-button v-if="record.status==='PENDING_APPROVAL'&&can('iqc:agent:approve')" type="link" @click="action(record.id,'approve')">通过</a-button><a-button v-if="record.status==='PENDING_APPROVAL'&&can('iqc:agent:approve')" type="link" danger @click="action(record.id,'reject')">驳回</a-button><a-button v-if="record.status==='PUBLISHED'&&can('iqc:agent:manage')" type="link" danger @click="action(record.id,'disable')">停用</a-button></template></a-table-column></a-table></a-card>

  <a-modal v-model:open="modalOpen" :title="selected?`配置新版本：${selected.name}`:'创建 Agent'" width="min(860px, calc(100vw - 32px))" :styles="{body:{maxHeight:'calc(100vh - 190px)',overflowY:'auto',overflowX:'hidden'}}" :confirm-loading="saving">
    <a-alert v-if="legacy" type="warning" show-icon message="旧版内嵌配置需要重新选择独立资产，历史版本保持不变。" style="margin-bottom:16px"/>
    <a-steps :current="currentStep" :items="steps" size="small" class="agent-wizard-steps"/>
    <a-spin :spinning="assetsLoading"><div class="agent-wizard-body">
      <a-form v-show="currentStep===0" layout="vertical"><a-alert type="info" show-icon message="先定义 Agent 的身份；保存后仍可通过版本管理调整配置。" style="margin-bottom:16px"/><a-row :gutter="16"><a-col :span="12"><a-form-item label="Agent 名称" required><a-input v-model:value="form.name" placeholder="例如：客服服务质量质检 Agent"/></a-form-item></a-col><a-col :span="12"><a-form-item label="唯一编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected)" placeholder="例如：service_quality_agent"/></a-form-item></a-col></a-row><a-form-item label="用途说明"><a-textarea v-model:value="form.description" :rows="4" placeholder="说明适用业务、质检目标和使用边界"/></a-form-item></a-form>

      <a-form v-show="currentStep===1" layout="vertical"><div class="wizard-heading"><div><h3>配置大模型</h3><p>主模型负责执行质检，备用模型按选择顺序降级。</p></div><a-button type="link" @click="openAsset('/agent-models')">管理模型配置 ↗</a-button></div><a-empty v-if="!assetsLoading&&!models.length" description="暂无已启用模型"><a-button type="primary" @click="openAsset('/agent-models')">去创建并启用模型</a-button></a-empty><template v-else><a-form-item label="主模型" required><a-select v-model:value="runtime.primaryModelProfileId" show-search option-filter-prop="label" placeholder="选择已启用模型"><a-select-option v-for="item in models" :key="item.id" :value="item.id" :label="`${item.name} ${item.modelName}`">{{item.name}} · {{item.provider}} / {{item.modelName}}</a-select-option></a-select></a-form-item><a-form-item label="备用模型（按顺序降级）"><a-select v-model:value="runtime.fallbackModelProfileIds" mode="multiple" placeholder="可选"><a-select-option v-for="item in models.filter(x=>x.id!==runtime.primaryModelProfileId)" :key="item.id" :value="item.id">{{item.name}} · {{item.modelName}}</a-select-option></a-select><template #extra>主模型不可用时依次尝试，避免单一模型故障中断任务。</template></a-form-item></template></a-form>

      <a-form v-show="currentStep===2" layout="vertical"><div class="wizard-heading"><div><h3>关联扩展能力</h3><p>MCP 提供外部工具，Skill 提供可复用的专业判断流程；均为可选。</p></div></div><a-form-item label="可用 MCP"><a-select v-model:value="runtime.mcpServerIds" mode="multiple" placeholder="不选择则不调用 MCP"><a-select-option v-for="item in mcps" :key="item.id" :value="item.id">{{item.name}} · {{item.transport}}</a-select-option></a-select><template #extra>只展示已启用的 MCP，Agent 执行时按授权工具调用。</template><a-button type="link" class="asset-link" @click="openAsset('/agent-mcps')">管理 MCP ↗</a-button></a-form-item><a-form-item label="可用 Skill"><a-select v-model:value="runtime.skillIds" mode="multiple" placeholder="不选择则仅使用提示词和规则"><a-select-option v-for="item in skills" :key="item.id" :value="item.id">{{item.name}} · V{{item.versionNo}}</a-select-option></a-select><template #extra>选择与当前质检场景匹配的专业判断能力。</template><a-button type="link" class="asset-link" @click="openAsset('/agent-skills')">管理 Skill ↗</a-button></a-form-item><a-alert v-if="!mcps.length&&!skills.length" type="info" show-icon message="当前没有已启用的 MCP 或 Skill，可以跳过此步骤，稍后创建新版本关联。"/></a-form>

      <a-form v-show="currentStep===3" layout="vertical"><div class="wizard-heading"><div><h3>提示词与配置确认</h3><p>定义 Agent 的默认身份、判断边界和输出要求。</p></div></div><a-form-item label="默认提示词" required><a-textarea v-model:value="runtime.systemPrompt" :rows="7" :maxlength="8000" show-count/></a-form-item><a-card size="small" title="配置摘要" class="wizard-summary"><a-descriptions :column="2" size="small"><a-descriptions-item label="名称">{{form.name}}</a-descriptions-item><a-descriptions-item label="编码">{{form.code}}</a-descriptions-item><a-descriptions-item label="主模型">{{primaryModel?.name||'未选择'}}</a-descriptions-item><a-descriptions-item label="备用模型">{{selectedFallbackModels.map(x=>x.name).join('、')||'无'}}</a-descriptions-item><a-descriptions-item label="MCP">{{selectedMcps.map(x=>x.name).join('、')||'无'}}</a-descriptions-item><a-descriptions-item label="Skill">{{selectedSkills.map(x=>x.name).join('、')||'无'}}</a-descriptions-item></a-descriptions></a-card></a-form>
    </div></a-spin>
    <template #footer><a-button @click="modalOpen=false">取消</a-button><a-button v-if="currentStep>0" @click="currentStep--">上一步</a-button><a-button v-if="currentStep<steps.length-1" type="primary" @click="next">下一步</a-button><a-button v-else type="primary" :loading="saving" @click="save">{{selected?'创建草稿版本':'创建 Agent'}}</a-button></template>
  </a-modal>
</template>

<style scoped>
.agent-wizard-steps { margin: 4px 0 24px; }
.agent-wizard-body { min-height: 350px; padding: 8px 4px 0; }
.wizard-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.wizard-heading h3 { margin: 0 0 6px; color: var(--iqc-slate-900); font-size: 18px; }
.wizard-heading p { margin: 0; color: var(--iqc-slate-600); }
.asset-link { height: auto; padding: 6px 0 0; }
.wizard-summary { margin-top: 18px; background: var(--iqc-canvas); }
</style>
