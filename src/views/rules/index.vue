<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { message } from "ant-design-vue";
import {
  approveRule,
  createRule,
  createRuleVersion,
  listRuleVersions,
  listRules,
  rejectRule,
  submitRule,
  testRule,
  type QualityRule,
  type QualityRuleVersion,
  type RuleTestResult,
} from "@/api/config";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import { usePermission } from "@/composables/permission";

const route = useRoute();
const { can } = usePermission();
const rules = ref<QualityRule[]>([]);
const open = ref(false);
const saving = ref(false);
const testOpen = ref(false);
const testing = ref(false);
const testRuleId = ref("");
const testContent = ref("");
const testResult = ref<RuleTestResult>();
const versionOpen = ref(false);
const versionSaving = ref(false);
const versionRule = ref<QualityRule>();
const versions = ref<QualityRuleVersion[]>([]);
const ruleTypes = ref<DictionaryItem[]>([
  { value: "CONTAINS", label: "包含任一内容" },
  { value: "FORBIDDEN_CONTAINS", label: "禁止包含" },
  { value: "REQUIRED_CONTAINS", label: "必须包含" },
  { value: "REGEX", label: "正则匹配" },
  { value: "FORBIDDEN_REGEX", label: "禁止匹配正则" },
  { value: "REQUIRED_REGEX", label: "必须匹配正则" },
  { value: "EQUALS", label: "完全等于" },
  { value: "NOT_EQUALS", label: "不等于" },
  { value: "STARTS_WITH", label: "开头匹配" },
  { value: "ENDS_WITH", label: "结尾匹配" },
  { value: "STRUCTURED", label: "结构化条件" },
  { value: "COMPOSITE", label: "组合规则" },
  { value: "LLM", label: "LLM 语义判断" },
]);
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
const view = computed(() => String(route.meta.ruleView || "library"));
const visibleRules = computed(() =>
  rules.value.filter((rule) =>
    view.value === "composite"
      ? rule.ruleType === "COMPOSITE"
      : view.value === "approval"
      ? rule.status === "PENDING_APPROVAL"
      : view.value === "library"
      ? rule.ruleType !== "COMPOSITE"
      : true
  )
);
const pageCopy = computed(
  () =>
    ({
      library: ["规则库", "集中管理确定性规则、结构化条件和 LLM 语义规则。"],
      composite: [
        "组合规则",
        "使用 ALL、ANY、NOT 将多个条件递归组合为可复用规则。",
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
  return form.value.ruleType === "LLM"
    ? "描述判断标准、正反例、证据要求和输出约束"
    : "输入需要比较的文本";
});

async function refresh() {
  try {
    rules.value = await listRules();
  } catch {
    message.error("规则加载失败");
  }
}
async function submit(id: string) {
  try {
    await submitRule(id);
    message.success("规则已提交审批");
    await refresh();
  } catch {
    message.error("规则提交审批失败");
  }
}
async function approve(id: string) {
  try {
    await approveRule(id);
    message.success("规则已审批发布");
    await refresh();
  } catch {
    message.error("规则审批失败");
  }
}
async function reject(id: string) {
  try {
    await rejectRule(id);
    message.success("规则已驳回");
    await refresh();
  } catch {
    message.error("规则驳回失败");
  }
}
function startCreate() {
  form.value = emptyForm();
  if (view.value === "composite") {
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
async function save() {
  if (!form.value.name || !form.value.code || !form.value.expression)
    return void message.warning("请填写名称、编码和规则配置");
  saving.value = true;
  try {
    await createRule(form.value);
    message.success("规则已创建");
    open.value = false;
    await refresh();
  } catch {
    message.error("规则创建失败，请检查配置格式和编码");
  } finally {
    saving.value = false;
  }
}
function openTest(id: string) {
  testRuleId.value = id;
  testContent.value = "";
  testResult.value = undefined;
  testOpen.value = true;
}
async function runTest() {
  if (!testContent.value.trim()) return void message.warning("请输入测试文本");
  testing.value = true;
  try {
    testResult.value = await testRule(testRuleId.value, testContent.value);
  } catch {
    message.error("规则测试失败");
  } finally {
    testing.value = false;
  }
}
async function openVersions(rule: QualityRule) {
  versionRule.value = rule;
  versionForm.value = {
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
    versions.value = await listRuleVersions(rule.id);
  } catch {
    message.error("版本加载失败");
  }
}
async function saveVersion() {
  if (!versionRule.value || !versionForm.value.expression)
    return void message.warning("请填写版本配置");
  versionSaving.value = true;
  try {
    await createRuleVersion(versionRule.value.id, versionForm.value);
    await submitRule(versionRule.value.id);
    message.success("新版本已创建并提交审批");
    versions.value = await listRuleVersions(versionRule.value.id);
    await refresh();
  } catch {
    message.error("规则版本创建或提交失败");
  } finally {
    versionSaving.value = false;
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
    if (data.iqc_rule_type?.length) ruleTypes.value = data.iqc_rule_type;
    if (data.iqc_rule_category?.length) ruleCategories.value = data.iqc_rule_category;
    if (data.iqc_risk_level?.length) riskLevels.value = data.iqc_risk_level;
    if (data.iqc_target_role?.length) targetRoles.value = data.iqc_target_role;
  } catch {
    /* 保留本地完整类型。 */
  }
}
onMounted(() => {
  void refresh();
  void loadDictionaries();
});
</script>

<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">PROFESSIONAL RULE CENTER</span>
      <h2>{{ pageCopy[0] }}</h2>
      <p>{{ pageCopy[1] }}</p>
    </div>
    <a-button
      v-if="can('iqc:rule:manage') && !['test', 'approval'].includes(view)"
      type="primary"
      @click="startCreate"
      >{{ view === "composite" ? "创建组合规则" : "创建规则" }}</a-button
    >
  </section>
  <a-alert
    v-if="view === 'composite'"
    type="info"
    show-icon
    message="组合表达式支持 all / any / not 递归结构"
    description="叶子支持 contains、not_contains、contains_any、contains_all、regex、not_regex、equals、数值与长度比较。"
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
      /><a-table-column title="分类" data-index="category" /><a-table-column
        title="版本"
        data-index="versionNo"
        :width="70"
      /><a-table-column title="类型" data-index="ruleType" /><a-table-column
        title="表达式"
        data-index="expression"
        :ellipsis="true"
      /><a-table-column title="状态" data-index="status" /><a-table-column
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
  <a-modal
    v-model:open="open"
    wrap-class-name="iqc-rule-modal"
    :title="view === 'composite' ? '创建组合规则' : '创建规则'"
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
              :disabled="view === 'composite'"
              ><a-select-option
                v-for="item in ruleTypes"
                :key="item.value"
                :value="item.value"
                >{{ item.label }}</a-select-option
              ></a-select
            ></a-form-item
          ></a-col
        ></a-row
      ><template v-if="form.ruleType === 'COMPOSITE' && !advancedComposite"
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
        v-if="form.ruleType !== 'COMPOSITE' || advancedComposite"
        label="规则配置"
        required
        :help="expressionHelp"
        ><a-textarea
          v-model:value="form.expression"
          :rows="
            ['COMPOSITE', 'STRUCTURED', 'LLM'].includes(form.ruleType) ? 8 : 4
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
      ><a-form-item label="测试文本" required
        ><a-textarea
          v-model:value="testContent"
          :rows="6"
          placeholder="输入一段真实会话文本" /></a-form-item></a-form
    ><a-alert
      v-if="testResult"
      :type="
        testResult.resultStatus === 'HIT'
          ? 'success'
          : testResult.resultStatus === 'ERROR'
          ? 'error'
          : 'info'
      "
      :message="testResult.reason"
      :description="
        testResult.matchedText
          ? `命中片段：${testResult.matchedText}`
          : undefined
      "
      show-icon
  /></a-modal>
  <a-modal
    v-model:open="versionOpen"
    :title="`规则版本：${versionRule?.name || ''}`"
    width="800"
    :confirm-loading="versionSaving"
    ok-text="创建并提交新版本"
    @ok="saveVersion"
    ><a-table
      :data-source="versions"
      :pagination="false"
      row-key="id"
      size="small"
      ><a-table-column title="版本" data-index="versionNo" /><a-table-column
        title="状态"
        data-index="status" /><a-table-column
        title="表达式"
        data-index="expression"
        :ellipsis="true" /><a-table-column
        title="扣分"
        data-index="deduction" /><a-table-column
        title="风险"
        data-index="riskLevel" /></a-table
    ><a-divider /><a-form layout="vertical"
      ><a-form-item label="新版本配置" required
        ><a-textarea
          v-model:value="versionForm.expression"
          :rows="6" /></a-form-item
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
      ></a-form
    ></a-modal
  >
</template>
