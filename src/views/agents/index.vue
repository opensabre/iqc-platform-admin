<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { message } from "ant-design-vue";
import { useRouter } from "vue-router";
import { approveAgent, createAgent, createAgentVersion, disableAgent, listAgents, listMcpServers, listModelProfiles, listRuleSets, listSkills, rejectAgent, submitAgent, agentPayloadRestricted, type AgentRuntimeConfig, type IqcMcpServer, type IqcModelProfile, type IqcSkill, type QualityAgent, type QualityRuleSet } from "@/api/config";
import {listInstructionVersions,skillPayloadRestricted,type IqcInstructionVersion} from "@/api/config";
import PublishedAssetReference from "@/components/PublishedAssetReference.vue";
import type {AssetReference} from "@/api/pipelines";
import DictTag from "@/components/DictTag.vue";
import { usePermission } from "@/composables/permission";

const defaults = (): AgentRuntimeConfig => ({ schemaVersion: "3.0", systemPrompt: "你是专业的客服质检 Agent。依据检查目标判断，输出可追溯的理由和证据；证据不足时明确说明，不自行决定最终评分。", primaryModelProfileId: "", fallbackModelProfileIds: [], mcpServerIds: [], skillIds: [] });
type StepKey = "basic" | "model" | "capabilities" | "prompt" | "confirm";
const router = useRouter();
const { can } = usePermission();
const agents = ref<QualityAgent[]>([]), models = ref<IqcModelProfile[]>([]), mcps = ref<IqcMcpServer[]>([]), skills = ref<IqcSkill[]>([]), ruleSets = ref<QualityRuleSet[]>([]);
const modalOpen = ref(false), saving = ref(false), assetsLoading = ref(false), legacy = ref(false), currentStep = ref(0);
const selected = ref<QualityAgent>();
const restricted=ref(false),error=ref(''),legacyConfigJson=ref<string>();
let listGeneration=0,assetGeneration=0,disposed=false;
const writable=computed(()=>!restricted.value&&(selected.value?can('iqc:agent:version:manage'):can('iqc:agent:manage')));
const form = ref({ name: "", code: "", description: "" });
const runtime = ref<AgentRuntimeConfig>(defaults());
const promptMode=ref(false),promptSourceId=ref(''),promptVersions=ref<IqcInstructionVersion[]>([]),promptLoading=ref(false),promptError=ref('');
let promptGeneration=0;
const promptBodyAccess=computed(()=>can('iqc:sensitive:conversation:read')&&can('iqc:sensitive:pii:read')&&can('iqc:sensitive:prompt:read'));
async function loadPromptVersions(id:string){
 const ticket=++promptGeneration;promptVersions.value=[];promptError.value='';promptLoading.value=false;
 if(!id||!can('iqc:skill:view')||!promptBodyAccess.value)return;
 promptLoading.value=true;
 try{const rows=await listInstructionVersions(id);
  if(disposed||ticket!==promptGeneration||!modalOpen.value||!can('iqc:skill:view')||!promptBodyAccess.value)return;
  promptVersions.value=rows.filter(row=>row.skillId===id&&row.status==='ENABLED'&&!skillPayloadRestricted(row)&&!!row.instructions?.trim()&&row.instructions.length<=8000);
  if(!promptVersions.value.length)promptError.value='没有可用且可读取正文的指令版本。';
 }catch{if(ticket===promptGeneration)promptError.value='指令版本读取失败，请核对权限并重试。';}
 finally{if(ticket===promptGeneration)promptLoading.value=false;}
}
function togglePromptMode(enabled:boolean){
 if(disposed||saving.value||!writable.value||runtime.value.schemaVersion!=='3.0')return;
 promptMode.value=enabled;++promptGeneration;promptVersions.value=[];promptError.value='';promptLoading.value=false;
 if(!enabled){delete runtime.value.promptAsset;promptSourceId.value='';}
 else if(promptSourceId.value)void loadPromptVersions(promptSourceId.value);
}
function choosePromptSource(id:string){
 if(disposed||saving.value||!writable.value||!promptMode.value||!can('iqc:skill:view'))return;
 promptSourceId.value=id;delete runtime.value.promptAsset;void loadPromptVersions(id);
}
function choosePromptVersion(versionNo:number){
 if(disposed||saving.value||!writable.value||!promptMode.value||!can('iqc:skill:view')||!promptBodyAccess.value)return;
 const source=promptVersions.value.find(row=>row.skillId===promptSourceId.value&&row.versionNo===versionNo);
 if(!source?.instructions)return;
 runtime.value.systemPrompt=source.instructions;runtime.value.promptAsset={skillId:source.skillId,versionNo:source.versionNo};
}
const primaryModel = computed(() => models.value.find(item => item.id === runtime.value.primaryModelProfileId));
const selectedFallbackModels = computed(() => models.value.filter(item => runtime.value.fallbackModelProfileIds?.includes(item.id)));
const selectedMcps = computed(() => mcps.value.filter(item => runtime.value.mcpServerIds?.includes(item.id)));
const canKnowledgeReferences=computed(()=>can('iqc:knowledge:view')&&can('iqc:knowledge:versions:view')&&can('iqc:knowledge:version:view'));
function addKnowledge(){if(disposed||saving.value||!writable.value||runtime.value.schemaVersion!=='3.0'||!canKnowledgeReferences.value)return;
 const references=runtime.value.knowledgeAssets??[];if(references.length<4)runtime.value.knowledgeAssets=[...references,{knowledgeBaseId:'',versionNo:0}];}
function chooseKnowledge(index:number,value:AssetReference|undefined){if(disposed||saving.value||!writable.value||!canKnowledgeReferences.value||!runtime.value.knowledgeAssets?.[index])return;
 runtime.value.knowledgeAssets[index]={knowledgeBaseId:value?.id??'',versionNo:value?.versionNo??0};}
function removeKnowledge(index:number){if(disposed||saving.value||!writable.value)return;runtime.value.knowledgeAssets?.splice(index,1);}
const selectedSkills = computed(() => skills.value.filter(item => runtime.value.skillIds?.includes(item.id)));
const publishedRuleSets = computed(() => ruleSets.value.filter(item => item.status === "PUBLISHED"));
const activeSteps = computed<{ key: StepKey; title: string; description: string }[]>(() => {
  const result = [{ key: "basic" as StepKey, title: "基本信息", description: "名称与能力用途" }];
  if (runtime.value.mode !== "RULE_ONLY") result.push({ key: "model", title: "智能模型", description: "主模型与降级" });
  if (runtime.value.schemaVersion === "3.0" || runtime.value.mode === "AGENT_LLM") result.push({ key: "capabilities", title: "能力配置", description: "MCP 与 Skill" });
  if (runtime.value.mode !== "RULE_ONLY") result.push({ key: "prompt", title: "行为设定", description: "身份与判断边界" });
  result.push({ key: "confirm", title: "确认", description: "检查配置" });
  return result;
});
const currentStepKey = computed<StepKey>(() => activeSteps.value[currentStep.value]?.key || "basic");
const modeName = computed(() => runtime.value.schemaVersion === "3.0" ? "LLM 能力（策略由任务指定）" : modeNames[runtime.value.mode || ""] || "旧版兼容");
const modeNames: Record<string, string> = { RULE_ONLY: "普通规则", RULE_THEN_LLM: "规则 + 智能体", LLM_THEN_RULE: "智能提取 + 规则复核", AGENT_LLM: "智能体" };

function parseConfig(value:string):AgentRuntimeConfig{
 const parsed=JSON.parse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!['1.0','2.0','3.0'].includes(parsed.schemaVersion))throw Error('Unsupported Agent config');
 if(parsed.schemaVersion==='1.0'){legacy.value=true;legacyConfigJson.value=value;return defaults();}
 legacy.value=parsed.schemaVersion==='2.0';return {...defaults(),...parsed};
}
function agentModeName(item:QualityAgent){
 if(item.privacy){const p=item.agentPresentation;if(item.privacy.policyVersion!=='iqc-agent-read-v1'||p?.policyVersion!=='iqc-agent-presentation-v1'||p.state!=='AVAILABLE')return '配置摘要未提供';return p.schemaVersion==='3.0'?'LLM 能力':p.schemaVersion==='1.0'?'旧版内嵌配置':`旧版：${modeNames[p.mode||'']||'未声明模式'}`;}
 try{const p=JSON.parse(item.configJson||'{}');return p.schemaVersion==='3.0'?'LLM 能力':`旧版：${modeNames[p.mode]||'未配置'}`;}catch{return '配置摘要未提供';}
}
function clearEditor(){++promptGeneration;promptMode.value=false;promptSourceId.value='';promptVersions.value=[];promptError.value='';promptLoading.value=false;selected.value=undefined;form.value={name:'',code:'',description:''};runtime.value=defaults();legacyConfigJson.value=undefined;restricted.value=false;legacy.value=false;models.value=[];mcps.value=[];skills.value=[];ruleSets.value=[];++assetGeneration;assetsLoading.value=false;}
async function refresh(){
 const ticket=++listGeneration;agents.value=[];error.value='';if(selected.value){modalOpen.value=false;clearEditor();}
 try{const rows=await listAgents();if(!disposed&&ticket===listGeneration)agents.value=rows;}
 catch{if(!disposed&&ticket===listGeneration)error.value='Agent重新读取失败，请重试；已完成操作不会撤销。';}
}
async function loadAssets() {
  const ticket=++assetGeneration;assetsLoading.value = true;models.value=[];mcps.value=[];skills.value=[];ruleSets.value=[];
  try {
    const [modelResult, mcpResult, skillResult, ruleSetResult] = await Promise.allSettled([listModelProfiles(), listMcpServers(), listSkills(), runtime.value.schemaVersion === "3.0" ? Promise.resolve([] as QualityRuleSet[]) : listRuleSets()]);
    if(disposed||ticket!==assetGeneration)return;
    if (modelResult.status === "fulfilled") models.value = modelResult.value.filter(item => item.status === "ENABLED");
    if (mcpResult.status === "fulfilled") mcps.value = mcpResult.value.filter(item => item.status === "ENABLED");
    if (skillResult.status === "fulfilled") skills.value = skillResult.value.filter(item => item.status === "ENABLED");
    if (ruleSetResult.status === "fulfilled") ruleSets.value = ruleSetResult.value;
    if(promptMode.value&&promptSourceId.value)void loadPromptVersions(promptSourceId.value);
    if (modelResult.status === "rejected") message.error("模型配置加载失败，请检查模型查看权限");
    else if (ruleSetResult.status === "rejected") message.warning("规则集加载失败；智能体模式仍可配置，普通规则模式暂不可保存");
  } catch { if(!disposed&&ticket===assetGeneration)message.error("关联资产加载失败"); }
  finally { if(!disposed&&ticket===assetGeneration)assetsLoading.value = false; }
}
function createNew(){if(saving.value||disposed)return;clearEditor();currentStep.value=0;modalOpen.value=true;void loadAssets();}
function edit(item:QualityAgent){
 if(saving.value||disposed)return;clearEditor();selected.value=item;currentStep.value=0;form.value={name:item.name,code:item.code,description:item.description??''};restricted.value=agentPayloadRestricted(item)||!item.configJson;
 if(!restricted.value)try{runtime.value=parseConfig(item.configJson!);}catch{restricted.value=true;}
 promptMode.value=!!runtime.value.promptAsset;promptSourceId.value=runtime.value.promptAsset?.skillId??'';
 modalOpen.value=true;if(!restricted.value&&legacyConfigJson.value===undefined)void loadAssets();
}
function validateStep(step: StepKey) {
  if (step === "basic" && (!form.value.name.trim() || !form.value.code.trim())) { message.warning("请填写 Agent 名称和编码"); return false; }
  if (step === "basic" && runtime.value.mode === "RULE_ONLY" && !runtime.value.ruleSetId) { message.warning("普通规则 Agent 必须选择已发布规则集"); return false; }
  if(step==='capabilities'){
   const references=runtime.value.knowledgeAssets??[];
   if(references.length>4||new Set(references.map(reference=>reference.knowledgeBaseId)).size!==references.length||references.some(reference=>!reference.knowledgeBaseId||!Number.isInteger(reference.versionNo)||reference.versionNo<1)){
    message.warning('知识库最多4个，每个须选择不同知识库的精确发布版本');return false;
   }
  }
  if (step === "model" && !runtime.value.primaryModelProfileId) { message.warning("请选择一个已启用的主模型"); return false; }
  if(step==='prompt'&&promptMode.value&&!runtime.value.promptAsset){message.warning('请选择精确指令版本');return false;}
  if (step === "prompt" && !runtime.value.systemPrompt?.trim()) { message.warning("请填写默认提示词"); return false; }
  return true;
}
function next() { if (validateStep(currentStepKey.value)) currentStep.value += 1; }
function openAsset(path: string) { window.open(router.resolve(path).href, "_blank", "noopener,noreferrer"); }
async function save() {
  if(disposed||saving.value||!writable.value||!modalOpen.value)return;
  if(legacyConfigJson.value!==undefined){
   if(!form.value.name.trim()||!form.value.code.trim()){message.warning('请填写名称和编码');return;}
   try{if(JSON.parse(legacyConfigJson.value).schemaVersion!=='1.0')throw Error();}catch{message.warning('内嵌配置须保持原1.0协议及有效JSON');return;}
  }else if (!activeSteps.value.map(item => item.key).every(validateStep)) return;
  saving.value = true;
  try {
    const config = { ...runtime.value };
    if (config.mode === "RULE_ONLY") { config.primaryModelProfileId = ""; config.fallbackModelProfileIds = []; config.mcpServerIds = []; config.skillIds = []; }
    if (["RULE_THEN_LLM", "LLM_THEN_RULE"].includes(config.mode || "")) { config.mcpServerIds = []; config.skillIds = []; }
    if (config.schemaVersion === "3.0") { delete config.mode; delete config.ruleSetId; }
    const data = { ...form.value, configJson: legacyConfigJson.value??JSON.stringify(config) };
    if (selected.value) await createAgentVersion(selected.value.id, data); else await createAgent(data);
    if(disposed)return;
    message.success(selected.value ? "已创建 Agent 草稿版本" : "Agent 已创建，可继续提交审批"); modalOpen.value = false; await refresh();
  } catch { if(!disposed)message.error("保存失败，请确认权限、配置及所选模型、MCP 和 Skill 仍有效"); }
  finally { if(!disposed)saving.value = false; }
}
async function action(id:string,type:string){
 const resources:Record<string,string>={submit:'iqc:agent:submit',approve:'iqc:agent:approve',reject:'iqc:agent:approve',disable:'iqc:agent:disable'};
 if(disposed||saving.value||!resources[type]||!can(resources[type]!))return;saving.value=true;
 try{if(type==='submit')await submitAgent(id);else if(type==='approve')await approveAgent(id);else if(type==='reject')await rejectAgent(id);else await disableAgent(id);if(disposed)return;await refresh();}
 catch{if(!disposed)message.error('操作未确认，请重新读取核对状态。');}finally{if(!disposed)saving.value=false;}
}
watch(canKnowledgeReferences,()=>{agents.value=[];++listGeneration;modalOpen.value=false;clearEditor();},{flush:'sync'});
watch(()=>can('iqc:skill:view'),()=>{++promptGeneration;promptVersions.value=[];promptLoading.value=false;promptError.value='';if(promptMode.value){modalOpen.value=false;clearEditor();}},{flush:'sync'});
watch(promptBodyAccess,()=>{++promptGeneration;promptVersions.value=[];promptLoading.value=false;agents.value=[];++listGeneration;modalOpen.value=false;clearEditor();},{flush:'sync'});
watch(modalOpen,value=>{if(!value)clearEditor();});
onBeforeUnmount(()=>{disposed=true;++listGeneration;agents.value=[];clearEditor();});
onMounted(() => void refresh());
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AGENT WORKSHOP</span><h2>智能体列表</h2><p>通过向导关联模型、MCP 与 Skill，所有变更纳入版本审批。</p></div><a-button v-if="can('iqc:agent:manage')" type="primary" :disabled="saving" @click="createNew">创建 Agent</a-button></section>
  <a-alert v-if="error" type="error" :message="error"/><a-button :disabled="saving" @click="refresh">重新读取</a-button>
  <a-card :bordered="false"><a-table :data-source="agents" :pagination="false" row-key="id"><a-table-column title="名称" data-index="name"/><a-table-column title="编码" data-index="code"/><a-table-column title="质检模式"><template #default="{record}"><a-tag color="blue">{{agentModeName(record)}}</a-tag></template></a-table-column><a-table-column title="版本" data-index="versionNo"/><a-table-column title="状态" data-index="status"><template #default="{record}"><DictTag code="iqc_agent_status" :value="record.status" :fallback="record.status" tag/></template></a-table-column><a-table-column title="操作" :width="340"><template #default="{record}"><a-button type="link" :disabled="saving" @click="edit(record)">配置</a-button><a-button v-if="record.status==='DRAFT'&&can('iqc:agent:submit')" type="link" :disabled="saving" @click="action(record.id,'submit')">提交</a-button><a-button v-if="record.status==='PENDING_APPROVAL'&&can('iqc:agent:approve')" type="link" :disabled="saving" @click="action(record.id,'approve')">通过</a-button><a-button v-if="record.status==='PENDING_APPROVAL'&&can('iqc:agent:approve')" type="link" :disabled="saving" danger @click="action(record.id,'reject')">驳回</a-button><a-button v-if="record.status==='PUBLISHED'&&can('iqc:agent:disable')" type="link" :disabled="saving" danger @click="action(record.id,'disable')">停用</a-button></template></a-table-column></a-table></a-card>

  <a-modal v-model:open="modalOpen" :title="selected?`配置新版本：${selected.name}`:'创建 Agent'" width="min(860px, calc(100vw - 32px))" :styles="{body:{maxHeight:'calc(100vh - 190px)',overflowY:'auto',overflowX:'hidden'}}" :confirm-loading="saving" :closable="!saving" :mask-closable="!saving" :keyboard="!saving">
    <a-alert v-if="restricted" type="info" message="配置正文受限或协议无效，未加载编辑器。请核对完整会话、PII、Prompt读取权限后重新读取；可继续按原权限使用已发布版本。"/>
    <template v-else-if="legacyConfigJson!==undefined"><a-alert type="info" message="旧版内嵌配置按原1.0协议编辑，保存为新草稿版本；历史记录保留。"/><a-form layout="vertical"><a-form-item label="名称"><a-input v-model:value="form.name" :disabled="!writable||saving"/></a-form-item><a-form-item label="说明"><a-input v-model:value="form.description" :disabled="!writable||saving"/></a-form-item><a-form-item label="原始配置JSON"><a-textarea v-model:value="legacyConfigJson" :disabled="!writable||saving" :rows="16"/></a-form-item></a-form></template>
    <template v-else>
    <a-alert v-if="legacy" type="warning" show-icon message="旧版配置保留原有模式语义，不会自动迁移；新建智能体只配置 LLM 能力。内嵌资产需重新选择，历史版本不变。" style="margin-bottom:16px"/>
    <a-steps :current="currentStep" :items="activeSteps" size="small" class="agent-wizard-steps"/>
    <a-spin :spinning="assetsLoading"><div class="agent-wizard-body">
      <a-form :disabled="!writable||saving" v-show="currentStepKey==='basic'" layout="vertical">
        <a-alert type="info" show-icon message="智能体负责模型、提示词和工具能力。质检执行策略在任务中选择；纯规则任务无需智能体。" style="margin-bottom:16px"/>
        <a-row :gutter="16"><a-col :span="12"><a-form-item label="Agent 名称" required><a-input v-model:value="form.name" placeholder="例如：客服服务质量质检 Agent"/></a-form-item></a-col><a-col :span="12"><a-form-item label="唯一编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected)" placeholder="例如：service_quality_agent"/></a-form-item></a-col></a-row>
        <a-form-item v-if="runtime.schemaVersion !== '3.0'" label="旧版质检模式（兼容配置）" required>
          <a-radio-group v-model:value="runtime.mode"><a-radio value="RULE_ONLY">普通规则</a-radio><a-radio value="RULE_THEN_LLM">规则 + 智能体</a-radio><a-radio value="LLM_THEN_RULE">智能提取 + 规则复核</a-radio><a-radio value="AGENT_LLM">智能体</a-radio></a-radio-group>
          <template #extra><span v-if="runtime.mode==='RULE_ONLY'">仅执行已发布规则集，不调用 LLM。</span><span v-else-if="runtime.mode==='RULE_THEN_LLM'">本地规则命中后交给智能体复核，需要配置模型和行为设定。</span><span v-else-if="runtime.mode==='LLM_THEN_RULE'">先由模型提取候选，再由确定性规则复核。</span><span v-else>由智能体配合模型、提示词、Skill 和 MCP 能力进行质检。</span></template>
        </a-form-item>
        <a-form-item v-if="runtime.mode==='RULE_ONLY'" label="规则集" required><a-select v-model:value="runtime.ruleSetId" show-search option-filter-prop="label" placeholder="选择已发布规则集"><a-select-option v-for="item in publishedRuleSets" :key="item.id" :value="item.id" :label="`${item.name} ${item.code}`">{{item.name}} · {{item.code}}</a-select-option></a-select><template #extra>普通规则 Agent 保存后默认使用该规则集；质检任务仍可临时覆盖。</template></a-form-item>
        <a-form-item label="用途说明"><a-textarea v-model:value="form.description" :rows="4" placeholder="说明适用业务、质检目标和使用边界"/></a-form-item>
      </a-form>

      <a-form :disabled="!writable||saving" v-show="currentStepKey==='model'" layout="vertical"><div class="wizard-heading"><div><h3>配置智能模型</h3><p>主模型负责执行质检，备用模型按选择顺序降级。</p></div><a-button type="link" @click="openAsset('/agent-models')">管理模型配置 ↗</a-button></div><a-empty v-if="!assetsLoading&&!models.length" description="暂无已启用模型"><a-button type="primary" @click="openAsset('/agent-models')">去创建并启用模型</a-button></a-empty><template v-else><a-form-item label="主模型" required><a-select v-model:value="runtime.primaryModelProfileId" show-search option-filter-prop="label" placeholder="选择已启用模型"><a-select-option v-for="item in models" :key="item.id" :value="item.id" :label="`${item.name} ${item.modelName}`">{{item.name}} · {{item.provider}} / {{item.modelName}}</a-select-option></a-select></a-form-item><a-form-item label="备用模型（按顺序降级）"><a-select v-model:value="runtime.fallbackModelProfileIds" mode="multiple" placeholder="可选"><a-select-option v-for="item in models.filter(x=>x.id!==runtime.primaryModelProfileId)" :key="item.id" :value="item.id">{{item.name}} · {{item.modelName}}</a-select-option></a-select><template #extra>主模型不可用时依次尝试，避免单一模型故障中断任务。</template></a-form-item></template></a-form>

      <a-form :disabled="!writable||saving" v-show="currentStepKey==='capabilities'" layout="vertical"><div class="wizard-heading"><div><h3>关联扩展能力</h3><p>MCP 提供外部工具，Skill 提供可复用的专业判断流程；均为可选。</p></div></div><a-form-item label="可用 MCP"><a-select v-model:value="runtime.mcpServerIds" mode="multiple" placeholder="不选择则不调用 MCP"><a-select-option v-for="item in mcps" :key="item.id" :value="item.id">{{item.name}} · {{item.transport}}</a-select-option></a-select><template #extra>只展示已启用的 MCP，智能体执行时按授权工具调用。</template><a-button type="link" class="asset-link" @click="openAsset('/agent-mcps')">管理 MCP ↗</a-button></a-form-item><a-form-item label="可用 Skill"><a-select v-model:value="runtime.skillIds" mode="multiple" placeholder="不选择则仅使用提示词"><a-select-option v-for="item in skills" :key="item.id" :value="item.id">{{item.name}} · V{{item.versionNo}}</a-select-option></a-select><template #extra>选择与当前质检场景匹配的专业判断能力。</template><a-button type="link" class="asset-link" @click="openAsset('/agent-skills')">管理 Skill ↗</a-button></a-form-item><a-form-item v-if="runtime.schemaVersion==='3.0'" label="知识库精确版本"><p>只保存引用与摘要，不把私有参考正文复制进共享智能体配置。</p><div v-for="(reference,index) in runtime.knowledgeAssets??[]" :key="index" style="margin:12px 0"><PublishedAssetReference v-if="canKnowledgeReferences" kind="KNOWLEDGE" :model-value="reference.knowledgeBaseId?{id:reference.knowledgeBaseId,versionNo:reference.versionNo}:undefined" :disabled="saving||!writable" @update:model-value="value=>chooseKnowledge(index,value)"/><p>{{reference.knowledgeBaseId||'请选择知识库'}} · v{{reference.versionNo||'未选择'}} · {{reference.contentHash??'保存时核对摘要'}}</p><a-button :disabled="saving||!writable" @click="removeKnowledge(index)">移除引用</a-button></div><a-button v-if="canKnowledgeReferences" :disabled="saving||!writable||(runtime.knowledgeAssets?.length??0)>=4" @click="addKnowledge">添加知识库引用</a-button><a-button v-if="can('iqc:knowledge:view')" type="link" @click="openAsset('/knowledge-bases')">管理知识库 ↗</a-button></a-form-item><a-alert v-if="!mcps.length&&!skills.length" type="info" show-icon message="当前没有已启用的 MCP 或 Skill，可以跳过此步骤，稍后创建新版本关联。"/></a-form>

      <a-form :disabled="!writable||saving" v-show="currentStepKey==='prompt'" layout="vertical"><div class="wizard-heading"><div><h3>设置智能体行为</h3><p>定义智能体的身份、判断边界和输出要求。</p></div></div><a-form-item v-if="runtime.schemaVersion==='3.0'" label="绑定版本化指令"><a-switch :checked="promptMode" @change="togglePromptMode"/><p>选择精确历史版本，指令库更新不会自动更换本 Agent 的提示词。</p></a-form-item><template v-if="promptMode"><a-form-item label="指令来源"><a-select :value="promptSourceId" :disabled="!can('iqc:skill:view')||!promptBodyAccess" :options="skills.map(item=>({value:item.id,label:item.name}))" @change="choosePromptSource"/></a-form-item><a-form-item label="精确版本"><a-select :value="runtime.promptAsset?.versionNo" :loading="promptLoading" :disabled="promptLoading||!can('iqc:skill:view')||!promptBodyAccess" :options="promptVersions.map(item=>({value:item.versionNo,label:`v${item.versionNo} · ${item.name}`}))" @change="choosePromptVersion"/><p v-if="runtime.promptAsset">引用 {{runtime.promptAsset.skillId}} · v{{runtime.promptAsset.versionNo}} · {{runtime.promptAsset.contentHash??'保存时生成摘要'}}</p><a-alert v-if="promptError" type="warning" :message="promptError"/></a-form-item></template><a-form-item label="默认提示词" required><a-textarea v-model:value="runtime.systemPrompt" :disabled="promptMode" :rows="7" :maxlength="8000" show-count/></a-form-item></a-form>

      <a-form :disabled="!writable||saving" v-show="currentStepKey==='confirm'" layout="vertical">
        <div class="wizard-heading"><div><h3>确认配置</h3><p>检查智能体能力；新智能体的执行策略由任务指定。</p></div></div>
        <a-card size="small" title="配置摘要" class="wizard-summary">
          <a-descriptions :column="2" size="small">
            <a-descriptions-item label="名称">{{form.name}}</a-descriptions-item>
            <a-descriptions-item label="配置类型">{{modeName}}</a-descriptions-item>
            <a-descriptions-item v-if="runtime.mode==='RULE_ONLY'" label="规则集">{{publishedRuleSets.find(x=>x.id===runtime.ruleSetId)?.name||'未选择'}}</a-descriptions-item>
            <template v-if="runtime.mode!=='RULE_ONLY'">
              <a-descriptions-item label="主模型">{{primaryModel?.name||'未选择'}}</a-descriptions-item>
              <a-descriptions-item label="备用模型">{{selectedFallbackModels.map(x=>x.name).join('、')||'无'}}</a-descriptions-item>
            </template>
            <template v-if="runtime.schemaVersion==='3.0'||runtime.mode==='AGENT_LLM'">
              <a-descriptions-item label="MCP">{{selectedMcps.map(x=>x.name).join('、')||'无'}}</a-descriptions-item>
              <a-descriptions-item label="知识库引用">{{runtime.knowledgeAssets?.map(reference=>`${reference.knowledgeBaseId} · v${reference.versionNo}`).join('、')||'无'}}</a-descriptions-item>
              <a-descriptions-item label="Skill">{{selectedSkills.map(x=>x.name).join('、')||'无'}}</a-descriptions-item>
            </template>
          </a-descriptions>
        </a-card>
      </a-form>
    </div></a-spin>
    </template>
    <template #footer><a-button :disabled="saving" @click="modalOpen=false">关闭</a-button><a-button v-if="!restricted&&legacyConfigJson===undefined&&currentStep>0" :disabled="saving" @click="currentStep--">上一步</a-button><a-button v-if="!restricted&&legacyConfigJson===undefined&&currentStep<activeSteps.length-1" type="primary" :disabled="saving" @click="next">下一步</a-button><a-button v-else-if="!restricted" type="primary" :disabled="!writable" :loading="saving" @click="save">{{selected?'创建草稿版本':'创建 Agent'}}</a-button></template>
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
