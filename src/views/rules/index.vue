<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { message } from "ant-design-vue";
import {
  approveRule,
  createRule,
  createRuleVersion,
  importDlsRules,
  listRuleVersions,
  listRules,
  rejectRule,
  submitRule,
  testRule,
  rulePayloadRestricted,
  type QualityRule,
  type QualityRuleVersion,
  type RuleTestResult,
  type DlsImportResult,
} from "@/api/config";
import { dictionaryLabel, getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import { usePermission } from "@/composables/permission";
import DlsDocumentEditor from "./DlsDocumentEditor.vue";

const route = useRoute();
const { can } = usePermission();
const rules = ref<QualityRule[]>([]);
const versionRestricted=ref(false),readError=ref('');
let disposed=false,listGeneration=0,versionGeneration=0,testGeneration=0,importGeneration=0;
function protectRule<T extends QualityRule|QualityRuleVersion>(row:T):T{return rulePayloadRestricted(row)?{...row,expression:null,description:null}:row;}
function protectTest(value:RuleTestResult):RuleTestResult{
 if(!rulePayloadRestricted(value))return value;
 const status=['HIT','NOT_HIT','ERROR','NOT_SUPPORTED'].includes(value.resultStatus)?value.resultStatus:'UNKNOWN';
 return {matched:value.matched,resultStatus:status,matchedText:null,reason:status==='NOT_SUPPORTED'?'此类型规则请在质检沙盒中测试':'测试回执正文未展示',evidence:[],privacy:value.privacy};
}
function protectImport(value:DlsImportResult):DlsImportResult{return rulePayloadRestricted(value)?{...value,items:value.items.map(item=>({...item,warnings:[],message:'诊断正文未展示'}))}:value;}

const open = ref(false);
const saving = ref(false);
const testOpen = ref(false);
const testing = ref(false);
const testRuleId = ref("");
const testContent = ref("");
const testResult = ref<RuleTestResult>();
const testingDls = computed(() => rules.value.find((rule) => rule.id === testRuleId.value)?.ruleType === "DLS");
const versionOpen = ref(false);
const versionSaving = ref(false);
const dlsFileInput = ref<HTMLInputElement>();
const dlsFile = ref<File>();
const dlsImportOpen = ref(false);
const dlsImporting = ref(false);
const dlsImportResult = ref<DlsImportResult>();
const dlsCanImport = computed(() => (dlsImportResult.value?.validCount || 0) > 0);
const versionRule = ref<QualityRule>();
const versions = ref<QualityRuleVersion[]>([]);
const ruleTypes = ref<DictionaryItem[]>([]);
const riskLevels = ref<DictionaryItem[]>([
  { value: "LOW", label: "低风险" },
  { value: "MEDIUM", label: "中风险" },
  { value: "HIGH", label: "高风险" },
]);
const ruleCategories = ref<DictionaryItem[]>([
  { value: "SERVICE_QUALITY", label: "服务质量" },
  { value: "COMPLIANCE", label: "合规审查" },
  { value: "SALES", label: "销售规范" },
  { value: "RISK_CONTROL", label: "风险控制" },
  { value: "DATA_PRIVACY", label: "数据与隐私" },
  { value: "CUSTOM", label: "自定义" },
]);
const targetRoles = ref<DictionaryItem[]>([
  { value: "all", label: "双方" },
  { value: "agent", label: "客服/销售" },
  { value: "user", label: "客户" },
]);
const emptyForm = () => ({
  name: "",
  code: "",
  category: "SERVICE_QUALITY",
  ruleType: "CONTAINS",
  targetRole: "all",
  expression: "",
  description: "",
  deduction: 10,
  riskLevel: "MEDIUM",
  veto: false,
});
const form = ref(emptyForm());
const versionForm = ref(emptyForm());
type ConditionRow = {
  field: string;
  operator: string;
  value: string;
  negated: boolean;
};
const compositeMode = ref<"ALL" | "ANY">("ALL");
const conditions = ref<ConditionRow[]>([]);
const advancedComposite = ref(false);
const advancedDls = ref(false);
const fields = [
  { value: "content", label: "消息内容" },
  { value: "speakerRole", label: "说话人角色" },
  { value: "sequenceNo", label: "消息序号" },
  { value: "relativeTime", label: "相对时间" },
];
const operators = [
  { value: "contains", label: "包含" },
  { value: "not_contains", label: "不包含" },
  { value: "contains_any", label: "包含任一" },
  { value: "contains_all", label: "包含全部" },
  { value: "equals", label: "等于" },
  { value: "not_equals", label: "不等于" },
  { value: "regex", label: "正则匹配" },
  { value: "not_regex", label: "正则不匹配" },
  { value: "starts_with", label: "开头是" },
  { value: "ends_with", label: "结尾是" },
  { value: "gt", label: "大于" },
  { value: "gte", label: "大于等于" },
  { value: "lt", label: "小于" },
  { value: "lte", label: "小于等于" },
  { value: "length_gt", label: "长度大于" },
  { value: "length_lt", label: "长度小于" },
];
const ruleTypeLabel = (type: string) => type === "COMPOSITE" ? "结构化规则" : type === "DLS" ? "DLS 会话规则" : ruleTypes.value.find((item) => item.value === type)?.label || type;
const categoryLabel = (category?: string) => dictionaryLabel(ruleCategories.value, category);
const selectableRuleTypes = computed(() => view.value === "dls"
  ? ruleTypes.value.filter((item) => item.value === "DLS")
  : ruleTypes.value.filter((item) => item.value !== "DLS"));
const view = computed(() => String(route.meta.ruleView || "library"));
const visibleRules = computed(() =>
  rules.value.filter((rule) =>
    view.value === "dls"
      ? rule.ruleType === "DLS"
      : view.value === "approval"
      ? rule.status === "PENDING_APPROVAL"
      : view.value === "library"
      ? rule.ruleType !== "DLS"
      : true
  )
);
const pageCopy = computed(
  () =>
    ({
      library: ["规则库", "集中管理关键词、正则、结构化和 LLM 等单消息规则。"],
      dls: [
        "会话规则",
        "使用私有 SLOT、RULE 和 ENTRY 构建可解释的 DLS 会话规则。",
      ],
      test: ["规则测试中心", "用真实会话片段验证规则命中结果和证据。"],
      approval: [
        "审批与发布",
        "复核待审批版本，确认语义后发布供质检任务使用。",
      ],
    }[view.value] || ["规则中心", "统一管理质检规则。"])
);
const expressionHelp = computed(() => {
  if (
    ["CONTAINS", "FORBIDDEN_CONTAINS", "REQUIRED_CONTAINS"].includes(
      form.value.ruleType
    )
  )
    return "多个内容用 | 或换行分隔，例如：保证收益|绝对安全";
  if (
    ["REGEX", "FORBIDDEN_REGEX", "REQUIRED_REGEX"].includes(form.value.ruleType)
  )
    return "Java 正则，例如：(保证|承诺).{0,8}(收益|回报)";
  if (["STRUCTURED", "COMPOSITE"].includes(form.value.ruleType))
    return 'JSON 示例：{"all":[{"field":"content","operator":"contains","value":"收益"},{"not":{"field":"content","operator":"contains","value":"风险"}}]}';
  if (form.value.ruleType === "DLS")
    return "DLS JSON 文档建议通过会话规则的可视化编辑器或导入功能生成";
  return form.value.ruleType === "LLM"
    ? "描述判断标准、正反例、证据要求和输出约束"
    : "输入需要比较的文本";
});

async function refresh(){
 const ticket=++listGeneration;rules.value=[];readError.value='';
 try{
  const rows=await listRules();if(disposed||ticket!==listGeneration)return;rules.value=rows.map(protectRule);
  if(versionRule.value){const current=rules.value.find(row=>row.id===versionRule.value?.id);if(!current||rulePayloadRestricted(current)){versionRestricted.value=true;versionForm.value=emptyForm();versions.value=[];++versionGeneration;}}
 }catch{if(!disposed&&ticket===listGeneration)readError.value='规则重新读取失败，请重试；已完成操作不会撤销。';}
}
async function openRuleFromQuery() {
  const ruleId = typeof route.query.ruleId === "string" ? route.query.ruleId : "";
  if (disposed||!ruleId) return;
  const rule = rules.value.find((item) => item.id === ruleId);
  if (rule) await openVersions(rule);
  else message.warning("未找到对应规则，可能已删除或无权查看");
}
async function submit(id: string) {
  if(disposed)return;
  try {
    await submitRule(id);if(disposed)return;
    message.success("规则已提交审批");
    await refresh();
  } catch {
    if(!disposed)message.error("规则提交审批失败");
  }
}
async function approve(id: string) {
  if(disposed)return;
  try {
    await approveRule(id);if(disposed)return;
    message.success("规则已审批发布");
    await refresh();
  } catch {
    if(!disposed)message.error("规则审批失败");
  }
}
async function reject(id: string) {
  if(disposed)return;
  try {
    await rejectRule(id);if(disposed)return;
    message.success("规则已驳回");
    await refresh();
  } catch {
    if(!disposed)message.error("规则驳回失败");
  }
}
function startCreate() {
  if(disposed||saving.value||!can("iqc:rule:manage"))return;
  if (!ruleTypes.value.length) {
    message.error("规则类型字典尚未加载，无法创建规则");
    return;
  }
  form.value = emptyForm();
  if (view.value === "dls") {
    form.value.ruleType = "DLS";
    form.value.targetRole = "all";
    form.value.expression = JSON.stringify({ languageVersion: "1.0", source: null, definitions: [], entryName: "", entryExpression: "" }, null, 2);
    advancedDls.value = false;
  } else if (form.value.ruleType === "COMPOSITE") {
    form.value.ruleType = "COMPOSITE";
    compositeMode.value = "ALL";
    conditions.value = [
      { field: "content", operator: "contains", value: "", negated: false },
    ];
    advancedComposite.value = false;
    syncComposite();
  }
  open.value = true;
}
function addCondition() {
  conditions.value.push({
    field: "content",
    operator: "contains",
    value: "",
    negated: false,
  });
  syncComposite();
}
function removeCondition(index: number) {
  conditions.value.splice(index, 1);
  syncComposite();
}
function syncComposite() {
  if (form.value.ruleType !== "COMPOSITE" || advancedComposite.value) return;
  const key = compositeMode.value.toLowerCase();
  const children = conditions.value.map((item) => {
    const leaf = {
      field: item.field,
      operator: item.operator,
      value: item.value,
    };
    return item.negated ? { not: leaf } : leaf;
  });
  form.value.expression = JSON.stringify({ [key]: children }, null, 2);
}
watch(() => form.value.ruleType, (type) => {
  if (type === "COMPOSITE" && !conditions.value.length) {
    compositeMode.value = "ALL";
    conditions.value = [{ field: "content", operator: "contains", value: "", negated: false }];
    advancedComposite.value = false;
    syncComposite();
  }
});
async function save() {
  if(disposed||saving.value||!open.value||!can("iqc:rule:manage"))return;
  if (!form.value.name || !form.value.code || !form.value.expression)
    return void message.warning("请填写名称、编码和规则配置");
  saving.value = true;
  try {
    await createRule({...form.value});if(disposed)return;
    message.success("规则已创建");
    open.value = false;
    await refresh();
  } catch {
    if(!disposed)message.error("规则创建结果未确认，请保留配置并重新读取核对编码。");
  } finally {
    if(!disposed)saving.value = false;
  }
}
function openTest(id: string) {
  if(disposed||testing.value||!can("iqc:rule:test"))return;++testGeneration;
  testRuleId.value = id;
  testContent.value = "";
  testResult.value = undefined;
  testOpen.value = true;
}
async function runTest() {
  if(disposed||testing.value||!testOpen.value||!can("iqc:rule:test"))return;
  const ticket=++testGeneration,id=testRuleId.value;testResult.value=undefined;
  if (!testContent.value.trim()) return void message.warning("请输入测试文本");
  testing.value = true;
  try {
    const messages = testingDls.value ? testContent.value.split("\n").map((line, index) => {
      const matched = line.match(/^\s*(agent|user|坐席|客服|客户)\s*[:：]\s*(.*)$/i);
      const role = matched?.[1]?.toLowerCase();
      return { sequenceNo:index + 1, speakerRole:role === "user" || role === "客户" ? "user" as const : "agent" as const, content:matched ? matched[2] : line };
    }).filter((item) => item.content.trim()) : [];
    const result=await testRule(id,testContent.value,messages);if(disposed||ticket!==testGeneration)return;testResult.value=protectTest(result);
  } catch {
    if(!disposed&&ticket===testGeneration)message.error("规则测试未获结果，请核对权限和输入后重试。");
  } finally {
    if(!disposed&&ticket===testGeneration)testing.value = false;
  }
}
async function openVersions(rule: QualityRule) {
  if(disposed||versionSaving.value)return;const ticket=++versionGeneration;versions.value=[];versionRestricted.value=rulePayloadRestricted(rule)||typeof rule.expression!=='string'||!rule.expression.trim();
  versionRule.value = rule;
  versionForm.value = versionRestricted.value?emptyForm():{
    name: rule.name,
    code: rule.code,
    category: rule.category || "CUSTOM",
    ruleType: rule.ruleType,
    targetRole: rule.targetRole || "all",
    expression: rule.expression || "",
    description: rule.description || "",
    deduction: rule.deduction ?? 10,
    riskLevel: rule.riskLevel || "MEDIUM",
    veto: rule.veto ?? false,
  };
  versionOpen.value = true;
  try {
    const rows=await listRuleVersions(rule.id);if(disposed||ticket!==versionGeneration)return;versions.value=rows.map(protectRule);if(rows.some(rulePayloadRestricted)){versionRestricted.value=true;versionForm.value=emptyForm();}
  } catch {
    if(!disposed&&ticket===versionGeneration){versionRestricted.value=true;versionForm.value=emptyForm();message.error("版本读取未获确认，未加载配置编辑器，请重新读取。");}
  }
}
async function saveVersion() {
  if(disposed||versionSaving.value||versionRestricted.value||!versionOpen.value||!can("iqc:rule:manage"))return;
  if (!versionRule.value || !versionForm.value.expression)
    return void message.warning("请填写版本配置");
  const id=versionRule.value.id,requested={...versionForm.value};
  versionSaving.value = true;
  try {
    await createRuleVersion(id,requested);if(disposed)return;
    await submitRule(id);if(disposed)return;
    message.success("新版本已创建并提交审批");
    const ticket=++versionGeneration;versions.value=[];const rows=await listRuleVersions(id);if(disposed||ticket!==versionGeneration)return;versions.value=rows.map(protectRule);if(rows.some(rulePayloadRestricted)){versionRestricted.value=true;versionForm.value=emptyForm();}
    await refresh();
  } catch {
    if(!disposed)message.error("版本创建或提交未确认，请先重新读取核对已有草稿及状态，避免重复创建。");
  } finally {
    if(!disposed)versionSaving.value = false;
  }
}
async function loadDictionaries() {
  try {
    const data = await getCachedDictionaries([
      "iqc_rule_type",
      "iqc_rule_category",
      "iqc_risk_level",
      "iqc_target_role",
    ]);
    if(disposed)return;ruleTypes.value = data.iqc_rule_type || [];
    if (!ruleTypes.value.length) message.error("后端未发布规则类型字典");
    if (data.iqc_rule_category?.length) ruleCategories.value = data.iqc_rule_category;
    if (data.iqc_risk_level?.length) riskLevels.value = data.iqc_risk_level;
    if (data.iqc_target_role?.length) targetRoles.value = data.iqc_target_role;
  } catch {
    if(disposed)return;ruleTypes.value = [];
    message.error("规则类型字典加载失败");
  }
}
async function selectDlsFile(event: Event) {
  if(disposed||dlsImporting.value||!can("iqc:rule:import"))return;const ticket=++importGeneration;dlsImportResult.value=undefined;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  dlsFile.value = file; dlsImporting.value = true;
  try {
    const result=await importDlsRules(file,true);if(disposed||ticket!==importGeneration)return;dlsImportResult.value=protectImport(result);
    dlsImportOpen.value = true;
  } catch {
    if(!disposed&&ticket===importGeneration)message.error("DLS 文件预检失败");
  } finally { if(!disposed&&ticket===importGeneration)dlsImporting.value = false; }
}
async function confirmDlsImport() {
  if(disposed||dlsImporting.value||!dlsFile.value||!can("iqc:rule:import"))return;const ticket=++importGeneration;
  dlsImporting.value = true;
  try {
    const result=await importDlsRules(dlsFile.value,false);if(disposed||ticket!==importGeneration)return;dlsImportResult.value=protectImport(result);
    message.success(`已创建 ${dlsImportResult.value.createdCount} 条 DLS 草稿规则`);
    await refresh();
  } catch {
    if(!disposed&&ticket===importGeneration)message.error("DLS 导入结果未确认，请核对已有来源规则后重试。");
  } finally { if(!disposed&&ticket===importGeneration)dlsImporting.value = false; }
}
watch(versionOpen,value=>{if(!value){++versionGeneration;versions.value=[];versionRule.value=undefined;versionForm.value=emptyForm();versionRestricted.value=false;}});
watch(testOpen,value=>{if(!value){++testGeneration;testResult.value=undefined;testContent.value='';testRuleId.value='';testing.value=false;}});
watch(dlsImportOpen,value=>{if(!value){++importGeneration;dlsImportResult.value=undefined;dlsFile.value=undefined;}});
watch(open,value=>{if(!value)form.value=emptyForm();});
onBeforeUnmount(()=>{disposed=true;++listGeneration;++versionGeneration;++testGeneration;++importGeneration;rules.value=[];versions.value=[];versionRule.value=undefined;form.value=emptyForm();versionForm.value=emptyForm();testContent.value='';testResult.value=undefined;dlsFile.value=undefined;dlsImportResult.value=undefined;});
onMounted(async () => {
  await refresh();
  await openRuleFromQuery();
  void loadDictionaries();
});
</script>

<template>
  <a-alert v-if="readError" type="error" :message="readError"/>
  <section class="page-intro">
    <div>
      <span class="section-kicker">PROFESSIONAL RULE CENTER</span>
      <h2>{{ pageCopy[0] }}</h2>
      <p>{{ pageCopy[1] }}</p>
    </div>
    <a-space
      v-if="
        !['test', 'approval'].includes(view) &&
        (can('iqc:rule:manage') ||
          (view === 'library' && can('iqc:rule:import')))
      "
    >
      <template v-if="view === 'dls' && can('iqc:rule:import')">
        <input ref="dlsFileInput" type="file" accept=".xlsx" hidden @change="selectDlsFile" />
        <a-button :loading="dlsImporting" @click="dlsFileInput?.click()">导入 DLS</a-button>
      </template>
      <a-button v-if="can('iqc:rule:manage')" type="primary" @click="startCreate">{{ view === "dls" ? "创建 DLS" : "创建规则" }}</a-button>
    </a-space>
  </section>
  <a-alert
    v-if="view === 'dls'"
    type="info"
    show-icon
    message="DLS 是会话级规则"
    description="SLOT 和 RULE 只在当前 DLS 内复用；DLS 作为整体测试、审批、发布并加入规则集。"
    style="margin-bottom: 16px"
  />
  <a-card :bordered="false"
    ><a-table
      :data-source="visibleRules"
      :pagination="{ pageSize: 12 }"
      row-key="id"
      ><a-table-column title="名称" data-index="name" /><a-table-column
        title="编码"
        data-index="code"
      /><a-table-column title="分类"><template #default="{ record }">{{ categoryLabel(record.category) }}</template></a-table-column><a-table-column
        title="版本"
        data-index="versionNo"
        :width="70"
      /><a-table-column title="类型"><template #default="{ record }">{{ ruleTypeLabel(record.ruleType) }}</template></a-table-column><a-table-column
        title="表达式"
        :ellipsis="true"><template #default="{record}">{{record.expression??'正文未展示'}}</template></a-table-column><a-table-column title="状态" data-index="status" /><a-table-column
        title="操作"
        :width="270"
        ><template #default="{ record }"
          ><a-button
            v-if="can('iqc:rule:test')"
            type="link"
            @click="openTest(record.id)"
            >测试</a-button
          ><a-button type="link" @click="openVersions(record)">版本</a-button
          ><a-button
            v-if="record.status === 'DRAFT' && can('iqc:rule:manage')"
            type="link"
            @click="submit(record.id)"
            >提交审批</a-button
          ><a-button
            v-if="
              record.status === 'PENDING_APPROVAL' && can('iqc:rule:approve')
            "
            type="link"
            @click="approve(record.id)"
            >审批通过</a-button
          ><a-button
            v-if="
              record.status === 'PENDING_APPROVAL' && can('iqc:rule:approve')
            "
            type="link"
            danger
            @click="reject(record.id)"
            >驳回</a-button
          ></template
        ></a-table-column
      ></a-table
    ></a-card
  >
  <a-modal v-model:open="dlsImportOpen" title="DLS 导入预检" width="860" :confirm-loading="dlsImporting" :closable="!dlsImporting" :mask-closable="!dlsImporting" :keyboard="!dlsImporting"
    :ok-button-props="{ disabled: !dlsCanImport }"
    ok-text="创建草稿" @ok="confirmDlsImport">
    <a-alert type="info" show-icon style="margin-bottom: 16px"
      :message="`${dlsImportResult?.fileName || ''}：${dlsImportResult?.validCount || 0} 个工作表通过，${dlsImportResult?.failedCount || 0} 个失败`"
      description="测试词槽和测试规则默认排除；导入后仍需测试、提交审批和发布。" />
    <a-alert v-if="dlsImportResult&&rulePayloadRestricted(dlsImportResult)" type="info" message="导入状态和计数已保留，诊断正文未展示。"/>
    <a-table :data-source="dlsImportResult?.items || []" :row-key="(_row:unknown,index:number)=>String(index)" :pagination="false" size="small">
      <a-table-column title="工作表" data-index="sheetName" />
      <a-table-column title="最终规则" data-index="ruleName" />
      <a-table-column title="定义数" data-index="definitionCount" :width="80" />
      <a-table-column title="状态" data-index="status" :width="90" />
      <a-table-column title="诊断">
        <template #default="{ record }">
          <div>{{ record.message }}</div>
          <div v-for="warning in record.warnings || []" :key="warning" style="color: #8c8c8c">{{ warning }}</div>
        </template>
      </a-table-column>
    </a-table>
  </a-modal>
  <a-modal
    v-model:open="open"
    wrap-class-name="iqc-rule-modal"
    :title="view === 'dls' ? '创建 DLS 会话规则' : '创建规则'"
    width="900"
    :confirm-loading="saving"
    @ok="save"
    ><a-form layout="vertical"
      ><a-row :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="名称" required
            ><a-input v-model:value="form.name" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="稳定编码" required
            ><a-input v-model:value="form.code" /></a-form-item></a-col></a-row
      ><a-row :gutter="16"
        ><a-col :span="8"
          ><a-form-item label="分类" required
            ><a-select v-model:value="form.category"
              ><a-select-option
                v-for="item in ruleCategories"
                :key="item.value"
                :value="item.value"
                >{{ item.label }}</a-select-option
              ></a-select
            ></a-form-item></a-col
        ><a-col :span="8"
          ><a-form-item label="适用说话人"
            ><a-select v-model:value="form.targetRole"
              ><a-select-option
                v-for="item in targetRoles"
                :key="item.value"
                :value="item.value"
                >{{ item.label }}</a-select-option
              ></a-select
            ></a-form-item
          ></a-col
        ><a-col :span="8"
          ><a-form-item label="规则类型"
            ><a-select
              v-model:value="form.ruleType"
              :disabled="view === 'dls'"
              ><a-select-option
                v-for="item in selectableRuleTypes"
                :key="item.value"
                :value="item.value"
                >{{ item.label }}</a-select-option
              ></a-select
            ></a-form-item
          ></a-col
        ></a-row
      ><template v-if="form.ruleType === 'DLS' && !advancedDls">
        <DlsDocumentEditor v-model="form.expression" />
        <a-button type="link" style="padding-left:0;margin-bottom:12px" @click="advancedDls = true">高级 JSON</a-button>
      </template>
      <template v-if="form.ruleType === 'COMPOSITE' && !advancedComposite"
        ><a-form-item label="组合关系"
          ><a-radio-group v-model:value="compositeMode" @change="syncComposite"
            ><a-radio-button value="ALL">全部满足</a-radio-button
            ><a-radio-button value="ANY"
              >任一满足</a-radio-button
            ></a-radio-group
          ></a-form-item
        ><a-card
          v-for="(condition, index) in conditions"
          :key="index"
          size="small"
          style="margin-bottom: 10px"
          ><a-row :gutter="8" align="middle"
            ><a-col :span="5"
              ><a-select
                v-model:value="condition.field"
                style="width: 100%"
                @change="syncComposite"
                ><a-select-option
                  v-for="item in fields"
                  :key="item.value"
                  :value="item.value"
                  >{{ item.label }}</a-select-option
                ></a-select
              ></a-col
            ><a-col :span="6"
              ><a-select
                v-model:value="condition.operator"
                style="width: 100%"
                @change="syncComposite"
                ><a-select-option
                  v-for="item in operators"
                  :key="item.value"
                  :value="item.value"
                  >{{ item.label }}</a-select-option
                ></a-select
              ></a-col
            ><a-col :span="8"
              ><a-input
                v-model:value="condition.value"
                placeholder="条件值"
                @input="syncComposite" /></a-col
            ><a-col :span="3"
              ><a-checkbox
                v-model:checked="condition.negated"
                @change="syncComposite"
                >NOT</a-checkbox
              ></a-col
            ><a-col :span="2"
              ><a-button
                danger
                type="text"
                :disabled="conditions.length === 1"
                @click="removeCondition(index)"
                >删</a-button
              ></a-col
            ></a-row
          ></a-card
        ><a-space style="margin-bottom: 14px"
          ><a-button @click="addCondition">添加条件</a-button
          ><a-button type="link" @click="advancedComposite = true"
            >高级 JSON</a-button
          ></a-space
        ></template
      ><a-form-item
        v-if="(form.ruleType !== 'COMPOSITE' || advancedComposite) && (form.ruleType !== 'DLS' || advancedDls)"
        label="规则配置"
        required
        :help="expressionHelp"
        ><a-textarea
          v-model:value="form.expression"
          :rows="
            ['COMPOSITE', 'STRUCTURED', 'DLS', 'LLM'].includes(form.ruleType) ? 8 : 4
          "
          :placeholder="expressionHelp" /></a-form-item
      ><a-row :gutter="16"
        ><a-col :span="8"
          ><a-form-item label="命中扣分"
            ><a-input-number
              v-model:value="form.deduction"
              :min="0"
              :max="100" /></a-form-item></a-col
        ><a-col :span="8"
          ><a-form-item label="风险等级"
            ><a-select v-model:value="form.riskLevel"
              ><a-select-option
                v-for="item in riskLevels"
                :key="item.value"
                :value="item.value"
                >{{ item.label }}</a-select-option
              ></a-select
            ></a-form-item
          ></a-col
        ><a-col :span="8"
          ><a-form-item label="处置"
            ><a-checkbox v-model:checked="form.veto"
              >一票否决</a-checkbox
            ></a-form-item
          ></a-col
        ></a-row
      ><a-form-item label="业务说明"
        ><a-textarea v-model:value="form.description" /></a-form-item></a-form
  ></a-modal>
  <a-modal
    v-model:open="testOpen"
    title="规则测试"
    :confirm-loading="testing"
    ok-text="运行测试"
    @ok="runTest"
    ><a-form layout="vertical"
      ><a-form-item :label="testingDls ? '测试会话' : '测试文本'" required
        ><a-textarea
          v-model:value="testContent" :disabled="testing"
          :rows="6"
          :placeholder="testingDls ? '每行一条消息，例如：\n客户：我要投诉\n坐席：请拨打客服电话' : '输入一段真实消息文本'" /></a-form-item></a-form
    ><a-alert
      v-if="testResult"
      :type="
        testResult.resultStatus === 'HIT'
          ? 'success'
          : testResult.resultStatus === 'ERROR'
          ? 'error'
          : 'info'
      "
      :message="`${testResult.resultStatus} · ${testResult.reason}`"
      :description="
        testResult.matchedText
          ? `命中片段：${testResult.matchedText}`
          : undefined
      "
      show-icon
    />
    <a-table v-if="testResult?.evidence?.length" :data-source="testResult.evidence" :pagination="false" size="small" style="margin-top:12px">
      <a-table-column title="内部 RULE" data-index="definition" /><a-table-column title="消息序号" data-index="sequenceNo" :width="90" /><a-table-column title="命中文本" data-index="text" />
    </a-table>
  </a-modal>
  <a-modal
    v-model:open="versionOpen"
    :title="`规则版本：${versionRule?.name || ''}`"
    width="min(1200px, calc(100vw - 64px))"
    :confirm-loading="versionSaving" :closable="!versionSaving" :mask-closable="!versionSaving" :keyboard="!versionSaving" :ok-button-props="{disabled:versionRestricted}"
    :footer="can('iqc:rule:manage') ? undefined : null"
    ok-text="创建并提交新版本"
    @ok="saveVersion"
    ><a-alert v-if="versionRestricted" type="info" message="规则正文受限或未提供，未加载新版本编辑器。请核对完整会话、PII及LLM所需Prompt权限后重新读取。"/><a-table
      :data-source="versions"
      :pagination="false"
      row-key="id"
      size="small"
      ><a-table-column title="版本" data-index="versionNo" /><a-table-column
        title="状态"
        data-index="status" /><a-table-column
        title="表达式"
        :ellipsis="true"><template #default="{record}">{{record.expression??'正文未展示'}}</template></a-table-column><a-table-column
        title="扣分"
        data-index="deduction" /><a-table-column
        title="风险"
        data-index="riskLevel" /></a-table
    ><template v-if="can('iqc:rule:manage')&&!versionRestricted"><a-divider /><a-form layout="vertical"
      ><a-form-item label="新版本配置" required>
        <DlsDocumentEditor v-if="versionForm.ruleType === 'DLS'" v-model="versionForm.expression" />
        <a-textarea v-else v-model:value="versionForm.expression" :rows="6" />
      </a-form-item
      ><a-row :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="扣分"
            ><a-input-number
              v-model:value="versionForm.deduction"
              :min="0"
              :max="100" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="风险等级"
            ><a-select v-model:value="versionForm.riskLevel"
              ><a-select-option
                v-for="item in riskLevels"
                :key="item.value"
                :value="item.value"
                >{{ item.label }}</a-select-option
              ></a-select
            ></a-form-item
          ></a-col
        ></a-row
      ></a-form></template
    ></a-modal
  >
</template>
