<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { useRouter } from "vue-router";
import { approveAgent, createAgent, createAgentVersion, disableAgent, listAgents, listMcpServers, listModelProfiles, listRuleSets, listSkills, rejectAgent, submitAgent, type AgentRuntimeConfig, type IqcMcpServer, type IqcModelProfile, type IqcSkill, type QualityAgent, type QualityRuleSet } from "@/api/config";
import DictTag from "@/components/DictTag.vue";
import { usePermission } from "@/composables/permission";

const defaults = (): AgentRuntimeConfig => ({ schemaVersion: "2.0", mode: "RULE_ONLY", systemPrompt: "你是专业的客服质检 Agent。严格依据已发布规则判断，输出可追溯的理由和证据。", primaryModelProfileId: "", fallbackModelProfileIds: [], mcpServerIds: [], skillIds: [] });
type StepKey = "basic" | "model" | "capabilities" | "prompt" | "confirm";
const router = useRouter();
const { can } = usePermission();
const agents = ref<QualityAgent[]>([]), models = ref<IqcModelProfile[]>([]), mcps = ref<IqcMcpServer[]>([]), skills = ref<IqcSkill[]>([]), ruleSets = ref<QualityRuleSet[]>([]);
const modalOpen = ref(false), saving = ref(false), assetsLoading = ref(false), legacy = ref(false), currentStep = ref(0);
const selected = ref<QualityAgent>();
const form = ref({ name: "", code: "", description: "" });
const runtime = ref<AgentRuntimeConfig>(defaults());
const primaryModel = computed(() => models.value.find(item => item.id === runtime.value.primaryModelProfileId));
const selectedFallbackModels = computed(() => models.value.filter(item => runtime.value.fallbackModelProfileIds?.includes(item.id)));
const selectedMcps = computed(() => mcps.value.filter(item => runtime.value.mcpServerIds?.includes(item.id)));
const selectedSkills = computed(() => skills.value.filter(item => runtime.value.skillIds?.includes(item.id)));
const publishedRuleSets = computed(() => ruleSets.value.filter(item => item.status === "PUBLISHED"));
const activeSteps = computed<{ key: StepKey; title: string; description: string }[]>(() => {
  const result = [{ key: "basic" as StepKey, title: "基本信息", description: "名称、用途与模式" }];
  if (runtime.value.mode !== "RULE_ONLY") result.push({ key: "model", title: "智能模型", description: "主模型与降级" });
  if (runtime.value.mode === "AGENT_LLM") result.push({ key: "capabilities", title: "能力配置", description: "MCP 与 Skill" });
  if (runtime.value.mode !== "RULE_ONLY") result.push({ key: "prompt", title: "行为设定", description: "身份与判断边界" });
  result.push({ key: "confirm", title: "确认", description: "检查配置" });
  return result;
});
const currentStepKey = computed<StepKey>(() => activeSteps.value[currentStep.value]?.key || "basic");
const modeName = computed(() => ({ RULE_ONLY: "普通规则", RULE_THEN_LLM: "规则 + 智能体", AGENT_LLM: "智能体" })[runtime.value.mode]);

function parseConfig(value?: string) { try { const parsed = value ? JSON.parse(value) : defaults(); if (parsed.schemaVersion === "2.0") return { ...defaults(), ...parsed }; legacy.value = true; return defaults(); } catch { return defaults(); } }
async function refresh() { try { agents.value = await listAgents(); } catch { message.error("Agent 加载失败"); } }
async function loadAssets() {
  assetsLoading.value = true;
  try {
    const [modelResult, mcpResult, skillResult, ruleSetResult] = await Promise.allSettled([listModelProfiles(), listMcpServers(), listSkills(), listRuleSets()]);
    if (modelResult.status === "fulfilled") models.value = modelResult.value.filter(item => item.status === "ENABLED");
    if (mcpResult.status === "fulfilled") mcps.value = mcpResult.value.filter(item => item.status === "ENABLED");
    if (skillResult.status === "fulfilled") skills.value = skillResult.value.filter(item => item.status === "ENABLED");
    if (ruleSetResult.status === "fulfilled") ruleSets.value = ruleSetResult.value;
    if (modelResult.status === "rejected") message.error("模型配置加载失败，请检查模型查看权限");
    else if (ruleSetResult.status === "rejected") message.warning("规则集加载失败；智能体模式仍可配置，普通规则模式暂不可保存");
  } catch { message.error("关联资产加载失败"); }
  finally { assetsLoading.value = false; }
}
function createNew() { selected.value = undefined; legacy.value = false; currentStep.value = 0; form.value = { name: "", code: "", description: "" }; runtime.value = defaults(); modalOpen.value = true; void loadAssets(); }
function edit(item: QualityAgent) { selected.value = item; legacy.value = false; currentStep.value = 0; form.value = { name: item.name, code: item.code, description: item.description || "" }; runtime.value = parseConfig(item.configJson); modalOpen.value = true; void loadAssets(); }
function validateStep(step: StepKey) {
  if (step === "basic" && (!form.value.name.trim() || !form.value.code.trim())) { message.warning("请填写 Agent 名称和编码"); return false; }
  if (step === "basic" && runtime.value.mode === "RULE_ONLY" && !runtime.value.ruleSetId) { message.warning("普通规则 Agent 必须选择已发布规则集"); return false; }
  if (step === "model" && !runtime.value.primaryModelProfileId) { message.warning("请选择一个已启用的主模型"); return false; }
  if (step === "prompt" && !runtime.value.systemPrompt?.trim()) { message.warning("请填写默认提示词"); return false; }
  return true;
}
function next() { if (validateStep(currentStepKey.value)) currentStep.value += 1; }
function openAsset(path: string) { window.open(router.resolve(path).href, "_blank", "noopener,noreferrer"); }
async function save() {
  if (!activeSteps.value.map(item => item.key).every(validateStep)) return;
  saving.value = true;
  try {
    const config = { ...runtime.value };
    if (config.mode === "RULE_ONLY") { config.primaryModelProfileId = ""; config.fallbackModelProfileIds = []; config.mcpServerIds = []; config.skillIds = []; }
    if (config.mode === "RULE_THEN_LLM") { config.mcpServerIds = []; config.skillIds = []; }
    const data = { ...form.value, configJson: JSON.stringify(config) };
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
  <a-card :bordered="false"><a-table :data-source="agents" :pagination="false" row-key="id"><a-table-column title="名称" data-index="name"/><a-table-column title="编码" data-index="code"/><a-table-column title="版本" data-index="versionNo"/><a-table-column title="状态" data-index="status"><template #default="{record}"><DictTag code="iqc_agent_status" :value="record.status" :fallback="record.status" tag/></template></a-table-column><a-table-column title="操作" :width="340"><template #default="{record}"><a-button type="link" @click="edit(record)">配置</a-button><a-button v-if="record.status==='DRAFT'&&can('iqc:agent:manage')" type="link" @click="action(record.id,'submit')">提交</a-button><a-button v-if="record.status==='PENDING_APPROVAL'&&can('iqc:agent:approve')" type="link" @click="action(record.id,'approve')">通过</a-button><a-button v-if="record.status==='PENDING_APPROVAL'&&can('iqc:agent:approve')" type="link" danger @click="action(record.id,'reject')">驳回</a-button><a-button v-if="record.status==='PUBLISHED'&&can('iqc:agent:manage')" type="link" danger @click="action(record.id,'disable')">停用</a-button></template></a-table-column></a-table></a-card>

  <a-modal v-model:open="modalOpen" :title="selected?`配置新版本：${selected.name}`:'创建 Agent'" width="min(860px, calc(100vw - 32px))" :styles="{body:{maxHeight:'calc(100vh - 190px)',overflowY:'auto',overflowX:'hidden'}}" :confirm-loading="saving">
    <a-alert v-if="legacy" type="warning" show-icon message="旧版内嵌配置需要重新选择独立资产，历史版本保持不变。" style="margin-bottom:16px"/>
    <a-steps :current="currentStep" :items="activeSteps" size="small" class="agent-wizard-steps"/>
    <a-spin :spinning="assetsLoading"><div class="agent-wizard-body">
      <a-form v-show="currentStepKey==='basic'" layout="vertical"><a-alert type="info" show-icon message="选择质检模式后，后续向导只展示该模式需要的配置。" style="margin-bottom:16px"/><a-row :gutter="16"><a-col :span="12"><a-form-item label="Agent 名称" required><a-input v-model:value="form.name" placeholder="例如：客服服务质量质检 Agent"/></a-form-item></a-col><a-col :span="12"><a-form-item label="唯一编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected)" placeholder="例如：service_quality_agent"/></a-form-item></a-col></a-row><a-form-item label="质检模式" required><a-radio-group v-model:value="runtime.mode"><a-radio value="RULE_ONLY">普通规则</a-radio><a-radio value="RULE_THEN_LLM">规则 + 智能体</a-radio><a-radio value="AGENT_LLM">智能体</a-radio></a-radio-group><template #extra><span v-if="runtime.mode==='RULE_ONLY'">仅执行已发布规则集，不调用 LLM。</span><span v-else-if="runtime.mode==='RULE_THEN_LLM'">本地规则命中后交给智能体复核，需要配置模型和行为设定。</span><span v-else>由智能体配合模型、提示词、Skill 和 MCP 能力进行质检。</span></template></a-form-item><a-form-item v-if="runtime.mode==='RULE_ONLY'" label="规则集" required><a-select v-model:value="runtime.ruleSetId" show-search option-filter-prop="label" placeholder="选择已发布规则集"><a-select-option v-for="item in publishedRuleSets" :key="item.id" :value="item.id" :label="`${item.name} ${item.code}`">{{item.name}} · {{item.code}}</a-select-option></a-select><template #extra>普通规则 Agent 保存后默认使用该规则集；质检任务仍可临时覆盖。</template></a-form-item><a-form-item label="用途说明"><a-textarea v-model:value="form.description" :rows="4" placeholder="说明适用业务、质检目标和使用边界"/></a-form-item></a-form>

      <a-form v-show="currentStepKey==='model'" layout="vertical"><div class="wizard-heading"><div><h3>配置智能模型</h3><p>主模型负责执行质检，备用模型按选择顺序降级。</p></div><a-button type="link" @click="openAsset('/agent-models')">管理模型配置 ↗</a-button></div><a-empty v-if="!assetsLoading&&!models.length" description="暂无已启用模型"><a-button type="primary" @click="openAsset('/agent-models')">去创建并启用模型</a-button></a-empty><template v-else><a-form-item label="主模型" required><a-select v-model:value="runtime.primaryModelProfileId" show-search option-filter-prop="label" placeholder="选择已启用模型"><a-select-option v-for="item in models" :key="item.id" :value="item.id" :label="`${item.name} ${item.modelName}`">{{item.name}} · {{item.provider}} / {{item.modelName}}</a-select-option></a-select></a-form-item><a-form-item label="备用模型（按顺序降级）"><a-select v-model:value="runtime.fallbackModelProfileIds" mode="multiple" placeholder="可选"><a-select-option v-for="item in models.filter(x=>x.id!==runtime.primaryModelProfileId)" :key="item.id" :value="item.id">{{item.name}} · {{item.modelName}}</a-select-option></a-select><template #extra>主模型不可用时依次尝试，避免单一模型故障中断任务。</template></a-form-item></template></a-form>

      <a-form v-show="currentStepKey==='capabilities'" layout="vertical"><div class="wizard-heading"><div><h3>关联扩展能力</h3><p>MCP 提供外部工具，Skill 提供可复用的专业判断流程；均为可选。</p></div></div><a-form-item label="可用 MCP"><a-select v-model:value="runtime.mcpServerIds" mode="multiple" placeholder="不选择则不调用 MCP"><a-select-option v-for="item in mcps" :key="item.id" :value="item.id">{{item.name}} · {{item.transport}}</a-select-option></a-select><template #extra>只展示已启用的 MCP，智能体执行时按授权工具调用。</template><a-button type="link" class="asset-link" @click="openAsset('/agent-mcps')">管理 MCP ↗</a-button></a-form-item><a-form-item label="可用 Skill"><a-select v-model:value="runtime.skillIds" mode="multiple" placeholder="不选择则仅使用提示词"><a-select-option v-for="item in skills" :key="item.id" :value="item.id">{{item.name}} · V{{item.versionNo}}</a-select-option></a-select><template #extra>选择与当前质检场景匹配的专业判断能力。</template><a-button type="link" class="asset-link" @click="openAsset('/agent-skills')">管理 Skill ↗</a-button></a-form-item><a-alert v-if="!mcps.length&&!skills.length" type="info" show-icon message="当前没有已启用的 MCP 或 Skill，可以跳过此步骤，稍后创建新版本关联。"/></a-form>

      <a-form v-show="currentStepKey==='prompt'" layout="vertical"><div class="wizard-heading"><div><h3>设置智能体行为</h3><p>定义智能体的身份、判断边界和输出要求。</p></div></div><a-form-item label="默认提示词" required><a-textarea v-model:value="runtime.systemPrompt" :rows="7" :maxlength="8000" show-count/></a-form-item></a-form>

      <a-form v-show="currentStepKey==='confirm'" layout="vertical"><div class="wizard-heading"><div><h3>确认配置</h3><p>提交前检查当前质检模式需要的配置。</p></div></div><a-card size="small" title="配置摘要" class="wizard-summary"><a-descriptions :column="2" size="small"><a-descriptions-item label="名称">{{form.name}}</a-descriptions-item><a-descriptions-item label="质检模式">{{modeName}}</a-descriptions-item><a-descriptions-item v-if="runtime.mode==='RULE_ONLY'" label="规则集">{{publishedRuleSets.find(x=>x.id===runtime.ruleSetId)?.name||'未选择'}}</a-descriptions-item><template v-if="runtime.mode!=='RULE_ONLY'"><a-descriptions-item label="主模型">{{primaryModel?.name||'未选择'}}</a-descriptions-item><a-descriptions-item label="备用模型">{{selectedFallbackModels.map(x=>x.name).join('、')||'无'}}</a-descriptions-item></template><template v-if="runtime.mode==='AGENT_LLM'"><a-descriptions-item label="MCP">{{selectedMcps.map(x=>x.name).join('、')||'无'}}</a-descriptions-item><a-descriptions-item label="Skill">{{selectedSkills.map(x=>x.name).join('、')||'无'}}</a-descriptions-item></template></a-descriptions></a-card></a-form>
    </div></a-spin>
    <template #footer><a-button @click="modalOpen=false">取消</a-button><a-button v-if="currentStep>0" @click="currentStep--">上一步</a-button><a-button v-if="currentStep<activeSteps.length-1" type="primary" @click="next">下一步</a-button><a-button v-else type="primary" :loading="saving" @click="save">{{selected?'创建草稿版本':'创建 Agent'}}</a-button></template>
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
