<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import {
  createInsightLabel,
  createLabelCategory,
  createLabelGroup,
  getLabelTree,
  getLabelDetail,
  publishLabel,
  replaceLabelBindings,
  replaceLabelValues,
  reviseLabelCategory,
  reviseLabelGroup,
  reviseInsightLabel,
  disableLabelCategory,
  disableLabelGroup,
  disableInsightLabel,
  type InsightLabel,
  type LabelTree,
  type LabelDetail,
  type LabelCategory,
  type LabelGroup,
} from "@/api/labels";
import { listRules, type QualityRule } from "@/api/config";
import { usePermission } from "@/composables/permission";
import LabelValueEditor from "@/components/LabelValueEditor.vue";
import type { LabelValueRequest } from "@/api/labels";

const { can } = usePermission();
type AssetKind='CATEGORY'|'GROUP'|'LABEL';
let disposed=false,listGeneration=0,detailGeneration=0,editorGeneration=0,commandGeneration=0;
function resource(type:AssetKind,operation:'create'|'update'|'disable'){
  return type==='LABEL'?(operation==='create'?'iqc:label:manage':`iqc:label:${operation}`):`iqc:label:${type.toLowerCase()}:${operation}`;
}
function canWrite(type:AssetKind,editing:boolean){
  return can(resource(type,editing?'update':'create'))&&(type!=='LABEL'||can('iqc:label:bindings:update')&&can('iqc:label:values:update')&&(!editing||can('iqc:label:detail:view')));
}
function clearSelection(){++detailGeneration;selected.value=undefined;selectedNode.value=undefined;selectedKind.value=undefined;selectedDetail.value=undefined;}
function closeEditor(){++editorGeneration;open.value=false;editId.value='';hitMappings.value={};form.value={name:'',code:'',parentId:'',description:'',prompt:'',maxChildCount:0,allowAutoExpand:false,targetRole:'all',weight:1,ruleIds:[],values:[]};}

const loading = ref(false),
  keyword = ref(""),
  open = ref(false),
  saving = ref(false);
const kind = ref<"CATEGORY" | "GROUP" | "LABEL">("CATEGORY");
const data = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const rules = ref<QualityRule[]>([]);
const hitMappings = ref<Record<string, { valueCode: string; rawValue: string }>>({});
const locatableTypes = new Set(["KEYWORD", "CONTAINS", "FORBIDDEN_CONTAINS", "REGEX", "FORBIDDEN_REGEX", "STARTS_WITH", "ENDS_WITH"]);
const selected = ref<InsightLabel>();
const selectedNode = ref<LabelCategory | LabelGroup | InsightLabel>();
const selectedKind = ref<"CATEGORY" | "GROUP" | "LABEL">();
const editId = ref("");
const selectedDetail = ref<LabelDetail>();
const form = ref({
  name: "",
  code: "",
  parentId: "",
  description: "",
  prompt: "",
  maxChildCount: 0,
  allowAutoExpand: false,
  targetRole: "all",
  weight: 1,
  ruleIds: [] as string[],
  values: [] as LabelValueRequest[],
});
const publishedRules = computed(() =>
  rules.value.filter((v) => v.status === "PUBLISHED")
);
const locatableRules = computed(() => publishedRules.value.filter(rule => form.value.ruleIds.includes(rule.id) && locatableTypes.has(rule.ruleType.toUpperCase())));
function mappedValue(ruleId: string) {
  for (const value of form.value.values) {
    if (!value.configJson) continue;
    try {
      const mapped = JSON.parse(value.configJson).onRuleHit?.[ruleId];
      if (mapped !== undefined) return { valueCode: value.valueCode, rawValue: String(mapped) };
    } catch { /* The backend reports invalid legacy config on save; do not erase it here. */ }
  }
  return { valueCode: "", rawValue: "" };
}
function resetHitMappings() {
  hitMappings.value = Object.fromEntries(form.value.ruleIds.map(id => [id, mappedValue(id)]));
}
function parseMappedValue(type: LabelValueRequest["valueType"], raw: string): string | number | boolean {
  if (type === "BOOLEAN") {
    if (raw !== "true" && raw !== "false") throw new Error("请选择命中后的明确布尔值");
    return raw === "true";
  }
  if (type === "FIXED") {
    if (!raw.trim()) throw new Error("请填写命中后的固定值");
    return raw.trim();
  }
  if (type === "DATE") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))
        || new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw) throw new Error("日期请使用真实的 YYYY-MM-DD 日期");
    return raw;
  }
  const number = Number(raw);
  if (!raw.trim() || !Number.isFinite(number) || number < 0 || (type === "PERCENTAGE" && number > 100)
      || (type === "MONTH" && (number < 1 || number > 12 || !Number.isInteger(number)))
      || (type === "DURATION_MONTHS" && !Number.isInteger(number))) throw new Error("命中值与标签值类型不匹配");
  return number;
}
function applyHitMapping(ruleId: string) {
  const draft = hitMappings.value[ruleId];
  const selected = form.value.values.find(value => value.valueCode && value.valueCode === draft?.valueCode);
  if (!selected) return void message.warning("请先选择已有标签值");
  try {
    const mapped = parseMappedValue(selected.valueType, draft.rawValue);
    form.value.values = form.value.values.map(value => {
      const config = value.configJson ? JSON.parse(value.configJson) : {};
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("已有标签值配置无效，请先修正");
      if (config.onRuleHit && (typeof config.onRuleHit !== "object" || Array.isArray(config.onRuleHit)))
        throw new Error("已有命中值配置无效，请先修正");
      const onRuleHit = { ...(config.onRuleHit || {}) };
      delete onRuleHit[ruleId];
      if (value.valueCode === selected.valueCode) onRuleHit[ruleId] = mapped;
      if (Object.keys(onRuleHit).length) config.onRuleHit = onRuleHit; else delete config.onRuleHit;
      return { ...value, configJson: Object.keys(config).length ? JSON.stringify(config) : undefined };
    });
    message.success("命中值映射已写入草稿；保存并发布标签后，再到方案中检查依赖。");
  } catch (error) { message.error(error instanceof Error ? error.message : "命中值映射无效"); }
}
const treeData = computed(() =>
  data.value.categories.map((category) => ({
    key: `CATEGORY:${category.id}`,
    title: `${category.name} (${
      data.value.groups.filter((v) => v.categoryId === category.id).length
    })`,
    children: data.value.groups
      .filter((v) => v.categoryId === category.id)
      .map((group) => ({
        key: `GROUP:${group.id}`,
        title: `${group.name} (${
          data.value.labels.filter((v) => v.groupId === group.id).length
        })`,
        children: data.value.labels
          .filter((v) => v.groupId === group.id)
          .map((label) => ({ key: `LABEL:${label.id}`, title: label.name })),
      })),
  }))
);

async function refresh(){
  if(disposed)return;const generation=++listGeneration;loading.value=true;data.value={categories:[],groups:[],labels:[]};rules.value=[];clearSelection();
  try{const [tree,availableRules]=await Promise.all([can('iqc:label:view')?getLabelTree(keyword.value):Promise.resolve({categories:[],groups:[],labels:[]}),can('iqc:rule:view')?listRules():Promise.resolve([])]);
    if(disposed||generation!==listGeneration)return;data.value=tree;rules.value=availableRules;
  }catch{if(!disposed&&generation===listGeneration)message.error('标签树加载失败');}finally{if(!disposed&&generation===listGeneration)loading.value=false;}
}
function create(type: "CATEGORY" | "GROUP" | "LABEL") {
  if(disposed||saving.value||!canWrite(type,false))return;
  closeEditor();
  editId.value = "";
  kind.value = type;
  form.value = {
    name: "",
    code: "",
    parentId: "",
    description: "",
    prompt: "",
    maxChildCount: 0,
    allowAutoExpand: false,
    targetRole: "all",
    weight: 1,
    ruleIds: [],
    values: [],
  };
  hitMappings.value = {};
  open.value = true;
}
async function selectNode(keys:(string|number)[]){
  if(disposed||!can('iqc:label:view'))return;clearSelection();const generation=detailGeneration;
  const [type,id]=String(keys[0]||'').split(':');
  selected.value=type==='LABEL'?data.value.labels.find(v=>v.id===id):undefined;
  selectedKind.value=type as AssetKind;selectedNode.value=type==='CATEGORY'?data.value.categories.find(v=>v.id===id):type==='GROUP'?data.value.groups.find(v=>v.id===id):selected.value;
  if(!selected.value||!can('iqc:label:detail:view'))return;
  try{const detail=await getLabelDetail(id);if(disposed||generation!==detailGeneration||selected.value?.id!==id||!can('iqc:label:detail:view'))return;selectedDetail.value=detail;}
  catch{if(!disposed&&generation===detailGeneration)message.error('标签详情加载失败，请重新选择。');}
}
function editSelected() {
  if (disposed||saving.value||!selectedNode.value||!selectedKind.value||!canWrite(selectedKind.value,true)||(selectedKind.value==='LABEL'&&!selectedDetail.value)) return;
  closeEditor();
  const value = selectedNode.value;
  kind.value = selectedKind.value; editId.value = value.id;
  form.value = { name:value.name, code:value.code, parentId:"", description:"description" in value ? value.description || "" : "", prompt:"prompt" in value ? value.prompt || "" : "", maxChildCount:"maxChildCount" in value ? value.maxChildCount : 0, allowAutoExpand:"allowAutoExpand" in value ? value.allowAutoExpand : false, targetRole:"targetRole" in value ? value.targetRole : "all", weight:"weight" in value ? value.weight : 1, ruleIds:selectedDetail.value?.bindings.map(v=>v.ruleId) || [], values:selectedDetail.value?.values.map(v=>({...v})) || [] };
  if (kind.value === "GROUP") form.value.parentId = (value as LabelGroup).categoryId;
  if (kind.value === "LABEL") form.value.parentId = (value as InsightLabel).groupId;
  resetHitMappings();
  open.value = true;
}
function disableSelected(){
  const node=selectedNode.value,type=selectedKind.value;
  if(disposed||saving.value||!node||!type||node.status==='DISABLED'||!can(resource(type,'disable')))return;
  const id=node.id,generation=commandGeneration,permission=resource(type,'disable');
  Modal.confirm({title:`确认停用“${node.name}”？`,content:'分类和群组必须先停用所有有效子项；历史任务仍按快照展示。',async onOk(){
    if(disposed||saving.value||generation!==commandGeneration||!can(permission))return;saving.value=true;
    try{if(type==='CATEGORY')await disableLabelCategory(id);else if(type==='GROUP')await disableLabelGroup(id);else await disableInsightLabel(id);
      if(disposed||generation!==commandGeneration||!can(permission))return;message.success('已停用');clearSelection();await refresh();
    }catch{if(!disposed&&generation===commandGeneration)message.error('停用失败，请确认子项状态和权限');}finally{saving.value=false;}
  }});
}
async function save() {
  const type=kind.value,id=editId.value,generation=editorGeneration;
  if(disposed||saving.value||!open.value||!canWrite(type,!!id))return;
  const request:typeof form.value=JSON.parse(JSON.stringify(form.value));
  const current=()=>!disposed&&generation===editorGeneration&&canWrite(type,!!id);
  const continueWrite=()=>{if(current())return true;if(!disposed)message.info('权限或编辑上下文已变化，请重新读取核对；已完成操作不会撤销。');return false;};
  if (!request.name || !request.code)
    return void message.warning("请填写名称和编码");
  saving.value = true;
  try {
    if (type === "CATEGORY") {
      const payload = {
        name: request.name,
        code: request.code,
        prompt: request.prompt,
        maxChildCount: request.maxChildCount,
        allowAutoExpand: request.allowAutoExpand,
      };
      if (id) await reviseLabelCategory(id, payload); else await createLabelCategory(payload);
    }
    else if (type === "GROUP") {
      if (!request.parentId) throw new Error("请选择一级标签");
      const payload = {
        categoryId: request.parentId,
        name: request.name,
        code: request.code,
        description: request.description,
        maxChildCount: request.maxChildCount,
        allowAutoExpand: request.allowAutoExpand,
      };
      if (id) await reviseLabelGroup(id, payload); else await createLabelGroup(payload);
    } else {
      if (!request.parentId || !request.ruleIds.length)
        throw new Error("请选择标签群组和规则");
      if (locatableRules.value.some(rule => {
        const draft = hitMappings.value[rule.id];
        const saved = mappedValue(rule.id);
        return draft && (draft.valueCode !== saved.valueCode || draft.rawValue !== saved.rawValue);
      })) throw new Error("命中值已修改但未确认，请先点击“确认命中值”再保存标签");
      const payload = {
        groupId: request.parentId,
        name: request.name,
        code: request.code,
        description: request.description,
        targetRole: request.targetRole,
        weight: request.weight,
      };
      if (request.values.some(value=>!value.valueCode))throw new Error("标签值编码不能为空");
      const label = id ? await reviseInsightLabel(id, payload) : await createInsightLabel(payload);
      if(!continueWrite())return;
      await replaceLabelBindings(label.id, request.ruleIds);
      if(!continueWrite())return;
      await replaceLabelValues(label.id, request.values);
    }
    if(!continueWrite())return;
    message.success("标签配置已保存");
    open.value = false;
    await refresh();
  } catch (e) {
    if(current())message.error(e instanceof Error ? e.message : "保存失败");
  } finally {
    saving.value = false;
  }
}
async function publish(label: InsightLabel) {
  if(disposed||saving.value||!can('iqc:label:approve')||label.status!=='DRAFT')return;const generation=commandGeneration;saving.value=true;
  try {
    await publishLabel(label.id);
    if(disposed||generation!==commandGeneration||!can('iqc:label:approve'))return;
    message.success("标签已发布");
    await refresh();
  } catch {
    if(!disposed&&generation===commandGeneration)message.error("发布失败，请确认已绑定已发布规则");
  }finally{saving.value=false;}
}
watch(()=>JSON.stringify(['iqc:label:view','iqc:label:detail:view','iqc:rule:view','iqc:label:manage','iqc:label:update','iqc:label:bindings:update','iqc:label:values:update','iqc:label:disable','iqc:label:approve','iqc:label:category:create','iqc:label:category:update','iqc:label:category:disable','iqc:label:group:create','iqc:label:group:update','iqc:label:group:disable'].map(can)),()=>{++listGeneration;++commandGeneration;clearSelection();closeEditor();data.value={categories:[],groups:[],labels:[]};rules.value=[];loading.value=false;void refresh();},{flush:'sync'});
watch(open,visible=>{if(!visible)closeEditor();});
onBeforeUnmount(()=>{disposed=true;++listGeneration;++commandGeneration;clearSelection();closeEditor();});
onMounted(refresh);
</script>

<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">INSIGHT TAXONOMY</span>
      <h2>标签树</h2>
      <p>标签定义业务含义，判定继续复用已发布规则、DLS 与 LLM。</p>
    </div>
    <a-space
      ><a-button v-if="canWrite('CATEGORY',false)" :disabled="saving" @click="create('CATEGORY')">新建一级标签</a-button
      ><a-button v-if="canWrite('GROUP',false)" :disabled="saving" @click="create('GROUP')">新建群组</a-button
      ><a-button v-if="canWrite('LABEL',false)" :disabled="saving" type="primary" @click="create('LABEL')"
        >新建标签</a-button
      ></a-space
    >
  </section>
  <a-row :gutter="16"
    ><a-col :span="8"
      ><a-card :bordered="false"
        ><a-input-search
          v-model:value="keyword"
          allow-clear
          placeholder="搜索标签、群组或编码"
          @search="refresh" /><a-spin :spinning="loading"
          ><a-tree
            :tree-data="treeData"
            default-expand-all
            block-node
            style="margin-top: 16px"
            @select="selectNode" /></a-spin></a-card
    ></a-col>
    <a-col :span="16"
      ><a-card :bordered="false" title="标签详情"
        ><a-empty
          v-if="!selectedNode"
          description="请选择一个标签资产"
        /><a-descriptions v-else bordered :column="2"
          ><a-descriptions-item label="名称">{{
            selectedNode?.name
          }}</a-descriptions-item
          ><a-descriptions-item label="编码">{{
            selectedNode?.code
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="生效角色">{{
            selected.targetRole
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="权重">{{
            selected.weight
          }}</a-descriptions-item
          ><a-descriptions-item label="状态"
            ><a-tag>{{ selectedNode?.status }}</a-tag></a-descriptions-item
          ><a-descriptions-item label="版本"
            >V{{ selectedNode?.versionNo }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="说明" :span="2">{{
            selected.description || "—"
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="标签值" :span="2">{{
            selectedDetail?.values
              .map((value) => `${value.valueCode} (${value.valueType})`)
              .join("、") || "无"
          }}</a-descriptions-item
          ><a-descriptions-item v-if="selected" label="绑定规则" :span="2">{{
            selectedDetail?.bindings
              .map(
                (binding) =>
                  `${
                    rules.find((rule) => rule.id === binding.ruleId)?.name ||
                    binding.ruleId
                  } V${binding.ruleVersionNo}`
              )
              .join("、") || "无"
          }}</a-descriptions-item></a-descriptions
        ><a-button
          v-if="selected?.status === 'DRAFT' && can('iqc:label:approve')"
          type="primary"
          style="margin-top: 16px"
          @click="publish(selected)"
          >发布标签</a-button
        ><a-space v-if="selectedNode && selectedKind" style="margin-top:16px"><a-button v-if="canWrite(selectedKind,true)" :disabled="saving || (selectedKind==='LABEL' && !selectedDetail)" @click="editSelected">编辑</a-button><a-button v-if="selectedNode.status !== 'DISABLED' && can(resource(selectedKind,'disable'))" :disabled="saving" danger @click="disableSelected">停用</a-button></a-space></a-card
      ></a-col
    ></a-row
  >
  <a-modal
    v-model:open="open"
    :title="editId ? '编辑标签资产' :
      kind === 'CATEGORY'
        ? '新建一级标签'
        : kind === 'GROUP'
        ? '新建标签群组'
        : '新建标签'
    "
    width="760"
    :confirm-loading="saving"
    @ok="save"
    ><a-form layout="vertical"
      ><a-row :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="名称" required
            ><a-input v-model:value="form.name" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="稳定编码" required
            ><a-input v-model:value="form.code" :disabled="Boolean(editId)" /></a-form-item></a-col
      ></a-row>
      <a-form-item v-if="kind === 'GROUP'" label="所属一级标签" required
        ><a-select v-model:value="form.parentId"
          ><a-select-option
            v-for="item in data.categories"
            :key="item.id"
            :value="item.id"
            >{{ item.name }}</a-select-option
          ></a-select
        ></a-form-item
      >
      <a-form-item v-if="kind === 'LABEL'" label="所属标签群组" required
        ><a-select v-model:value="form.parentId"
          ><a-select-option
            v-for="item in data.groups"
            :key="item.id"
            :value="item.id"
            >{{ item.name }}</a-select-option
          ></a-select
        ></a-form-item
      >
      <a-form-item v-if="kind === 'CATEGORY'" label="一级标签 Prompt"
        ><a-textarea
          v-model:value="form.prompt"
          :maxlength="500" /></a-form-item
      ><a-form-item v-else label="说明"
        ><a-textarea v-model:value="form.description"
      /></a-form-item>
      <a-row v-if="kind !== 'LABEL'" :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="最大子项数量"
            ><a-input-number
              v-model:value="form.maxChildCount"
              :min="0"
              style="width: 100%" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="允许自动扩展"
            ><a-switch
              v-model:checked="form.allowAutoExpand" /></a-form-item></a-col
      ></a-row>
      <template v-else
        ><a-row :gutter="16"
          ><a-col :span="12"
            ><a-form-item label="生效角色"
              ><a-select v-model:value="form.targetRole"
                ><a-select-option value="agent">坐席</a-select-option
                ><a-select-option value="user">客户</a-select-option
                ><a-select-option value="both">坐席+客户</a-select-option
                ><a-select-option value="all">全文</a-select-option></a-select
              ></a-form-item
            ></a-col
          ><a-col :span="12"
            ><a-form-item label="权重"
              ><a-input-number
                v-model:value="form.weight"
                :min="0"
                :max="100"
                style="width: 100%" /></a-form-item></a-col></a-row
        ><a-form-item label="判定规则" required
          ><a-select
            v-model:value="form.ruleIds"
            mode="multiple"
            option-filter-prop="label"
            @change="resetHitMappings"
            ><a-select-option
              v-for="rule in publishedRules"
              :key="rule.id"
              :value="rule.id"
              :label="rule.name"
              >{{ rule.name }} · {{ rule.ruleType }}</a-select-option
            ></a-select
          ></a-form-item
        ><a-form-item label="标签值"
          ><LabelValueEditor v-model="form.values" /></a-form-item
        ><a-form-item v-if="locatableRules.length" label="普通规则命中值映射（联合标签）">
          <p>每条规则命中时，只给一个标签值写入明确的事实；未命中保持“未提及”，不会自动取反。映射与标签版本一起发布。</p>
          <a-card v-for="rule in locatableRules" :key="rule.id" size="small" :title="`${rule.name} · ${rule.ruleType}`" style="margin-bottom: 8px">
            <a-space wrap>
              <a-select v-model:value="hitMappings[rule.id].valueCode" placeholder="选择标签值" style="width: 180px" :options="form.values.filter(value => value.valueCode).map(value => ({ label: `${value.valueCode} · ${value.valueType}`, value: value.valueCode }))" @change="hitMappings[rule.id].rawValue = ''" />
              <a-select v-if="form.values.find(value => value.valueCode === hitMappings[rule.id]?.valueCode)?.valueType === 'BOOLEAN'" v-model:value="hitMappings[rule.id].rawValue" placeholder="明确真/假" style="width: 160px" :options="[{ label: '是 / true', value: 'true' }, { label: '否 / false', value: 'false' }]" />
              <a-input v-else v-model:value="hitMappings[rule.id].rawValue" placeholder="命中后写入的值" style="width: 180px" />
              <a-button @click="applyHitMapping(rule.id)">确认命中值</a-button>
            </a-space>
          </a-card>
        </a-form-item
      ></template> </a-form
  ></a-modal>
</template>
