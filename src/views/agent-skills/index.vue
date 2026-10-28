<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { Modal, message } from "ant-design-vue";
import { createSkill, disableSkill, enableSkill, listSkills, updateSkill, skillPayloadRestricted, type IqcSkill, type IqcSkillRequest } from "@/api/config";
import { usePermission } from "@/composables/permission";

const emptyForm = (): IqcSkillRequest => ({ name: "", code: "", description: "", instructions: "", inputSchemaJson: "", outputSchemaJson: "" });
const skills = ref<IqcSkill[]>([]);
const loading = ref(false);
const saving = ref(false);
const payloadRestricted=ref(false),error=ref("");
let generation=0,disposed=false;
const modalOpen = ref(false);
const selected = ref<IqcSkill>();
const form = ref<IqcSkillRequest>(emptyForm());
const { can } = usePermission();

const canSave=computed(()=>can(selected.value?"iqc:skill:update":"iqc:skill:manage"));
function canStatus(skill:IqcSkill){return can(skill.status==="DISABLED"?"iqc:skill:enable":"iqc:skill:disable");}
function clearForm(){selected.value=undefined;form.value=emptyForm();payloadRestricted.value=false;}
async function refresh() {
  const ticket=++generation;loading.value=true;error.value='';skills.value=[];
  if(selected.value){modalOpen.value=false;clearForm();}
  if(!can("iqc:skill:view")){loading.value=false;return;}
  try {const rows=await listSkills();if(!disposed&&ticket===generation)skills.value=rows;}
  catch {if(!disposed&&ticket===generation)error.value='Skill列表读取失败，请重新读取；已完成的操作不会撤销。';}
  finally {if(!disposed&&ticket===generation)loading.value=false;}
}
function createNew(){if(saving.value||disposed||!can("iqc:skill:manage"))return;clearForm();modalOpen.value=true;}
function edit(skill:IqcSkill){
 if(saving.value||disposed||!can("iqc:skill:view"))return;clearForm();selected.value=skill;
 payloadRestricted.value=skillPayloadRestricted(skill)||typeof skill.instructions!=='string';
 if(!payloadRestricted.value)form.value={name:skill.name,code:skill.code,description:skill.description??'',instructions:skill.instructions!,inputSchemaJson:skill.inputSchemaJson??'',outputSchemaJson:skill.outputSchemaJson??''};
 modalOpen.value=true;
}
function validJsonObject(value?: string) {
  if (!value?.trim()) return true;
  try { const parsed = JSON.parse(value); return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed); } catch { return false; }
}
async function save() {
  if(disposed||saving.value||payloadRestricted.value||!modalOpen.value||!canSave.value)return;
  if (!form.value.name.trim() || !form.value.code.trim() || !form.value.instructions.trim()) { message.warning("请填写名称、编码和执行指令"); return; }
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(form.value.code)) { message.warning("编码必须为大写字母、数字或下划线"); return; }
  if (!validJsonObject(form.value.inputSchemaJson) || !validJsonObject(form.value.outputSchemaJson)) { message.warning("输入、输出 Schema 必须是 JSON 对象"); return; }
  const id=selected.value?.id, permission=id?"iqc:skill:update":"iqc:skill:manage";
  const command={...form.value};
  saving.value = true;
  try {
    if (id) await updateSkill(id, command); else await createSkill(command);
    if(disposed||!can(permission))return;
    message.success(id ? "Skill 已更新" : "Skill 已创建"); modalOpen.value = false; await refresh();
  } catch { if(!disposed)message.error("保存失败，请检查权限、编码是否重复或 Schema 是否有效"); }
  finally { if(!disposed)saving.value = false; }
}
function changeStatus(skill: IqcSkill) {
  if(disposed||saving.value||!canStatus(skill))return;
  const enabling = skill.status === "DISABLED";
  const permission=enabling?"iqc:skill:enable":"iqc:skill:disable";
  Modal.confirm({ title: `${enabling ? "启用" : "停用"} Skill`, content: `${enabling ? "启用后可被 Agent 选择。" : "停用后将不能被新 Agent 版本选择，历史版本不受影响。"}`,
    async onOk() {if(disposed||saving.value||!can(permission))return;saving.value=true;try{if(enabling)await enableSkill(skill.id);else await disableSkill(skill.id);if(disposed)return;message.success("状态已更新");await refresh();}catch{if(!disposed)message.error("状态操作未确认，请重新读取核对。");}finally{if(!disposed)saving.value=false;}} });
}
watch(()=>can("iqc:skill:view"),allowed=>{if(!allowed){generation++;skills.value=[];modalOpen.value=false;clearForm();}else void refresh();});
watch(()=>[can("iqc:skill:manage"),can("iqc:skill:update")],([create,update],[oldCreate,oldUpdate])=>{if(modalOpen.value&&(selected.value?oldUpdate&&!update:oldCreate&&!create))modalOpen.value=false;});
watch(modalOpen,value=>{if(!value)clearForm();});
onBeforeUnmount(()=>{disposed=true;++generation;skills.value=[];clearForm();});
onMounted(() => { void refresh(); });
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AGENT ASSETS</span><h2>Skill 管理</h2><p>集中维护可复用的专家指令和输入输出约束，Agent 创建时只选择已启用 Skill。</p></div><a-button v-if="can('iqc:skill:manage')" type="primary" :disabled="saving" @click="createNew">创建 Skill</a-button></section>
  <a-alert v-if="error" type="error" :message="error"/><a-button :loading="loading" :disabled="saving" @click="refresh">重新读取</a-button>
  <a-card :bordered="false"><a-table :data-source="skills" :loading="loading" row-key="id" :pagination="{ pageSize: 10 }" :scroll="{ x: 900 }">
    <a-table-column title="名称" data-index="name" :width="180" />
    <a-table-column title="编码" data-index="code" :width="180" />
    <a-table-column title="说明" data-index="description" />
    <a-table-column title="版本" data-index="versionNo" :width="80" />
    <a-table-column title="状态" :width="90"><template #default="{ record }"><a-tag :color="record.status === 'ENABLED' ? 'green' : 'default'">{{ record.status === 'ENABLED' ? '启用' : '停用' }}</a-tag></template></a-table-column>
    <a-table-column title="操作" :width="150" fixed="right"><template #default="{ record }"><a-button type="link" :disabled="saving" @click="edit(record)">查看<span v-if="can('iqc:skill:update')">/编辑</span></a-button><a-button v-if="canStatus(record)" type="link" :disabled="saving" :danger="record.status === 'ENABLED'" @click="changeStatus(record)">{{ record.status === "ENABLED" ? "停用" : "启用" }}</a-button></template></a-table-column>
  </a-table></a-card>
  <a-modal v-model:open="modalOpen" :title="selected ? `编辑 Skill：${selected.name}` : '创建 Skill'" width="min(720px, calc(100vw - 32px))" :styles="{ body: { maxHeight: 'calc(100vh - 190px)', overflowY: 'auto' } }" :confirm-loading="saving" :closable="!saving" :mask-closable="!saving" :keyboard="!saving" :ok-button-props="{ disabled: payloadRestricted || !canSave }" @ok="save">
    <a-alert v-if="payloadRestricted" type="info" message="配置正文未提供。请核对完整会话、PII、Prompt读取权限后重新读取；当前仅显示资产元数据，不能保存为空配置。"/>
    <p v-if="payloadRestricted&&selected">{{selected.code}} · v{{selected.versionNo}} · {{selected.status}}</p>
    <a-form v-if="!payloadRestricted" layout="vertical" :disabled="saving || !canSave"><a-row :gutter="16"><a-col :span="12"><a-form-item label="名称" required><a-input v-model:value="form.name" :disabled="!canSave" /></a-form-item></a-col><a-col :span="12"><a-form-item label="编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected) || !canSave" placeholder="例如 COMPLIANCE_REVIEW" /></a-form-item></a-col></a-row>
      <a-form-item label="说明"><a-input v-model:value="form.description" :disabled="!canSave" /></a-form-item>
      <a-form-item label="执行指令" required><a-textarea v-model:value="form.instructions" :disabled="!canSave" :rows="8" :maxlength="16000" show-count /></a-form-item>
      <a-form-item label="输入 Schema（JSON 对象）"><a-textarea v-model:value="form.inputSchemaJson" :disabled="!canSave" :rows="4" placeholder='{"type":"object"}' /></a-form-item>
      <a-form-item label="输出 Schema（JSON 对象）"><a-textarea v-model:value="form.outputSchemaJson" :disabled="!canSave" :rows="4" placeholder='{"type":"object"}' /></a-form-item>
    </a-form>
  </a-modal>
</template>
