<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { listTemplates, materializeTemplateRules, type QualityTemplate } from "@/api/templates";
import { usePermission } from "@/composables/permission";
import { listPublishedTemplates, listPublishedVersionHistory, type PublishedTemplate } from "@/api/schemes";
import SchemeTaskWizard from "./SchemeTaskWizard.vue";

const templates = ref<QualityTemplate[]>([]);
const published = ref<PublishedTemplate[]>([]);
const usingTemplate = ref<PublishedTemplate>();
const previewOnly = ref(false);
const versionHistoryOpen = ref(false), versionHistoryLoading = ref(false), versionHistoryError = ref("");
const versionHistoryTarget = ref<PublishedTemplate>();
const versionHistory = ref<PublishedTemplate[]>([]);
const nextBeforeVersion = ref<number | null>(null);
const keyword = ref(""), scene = ref<string>();
let generation = 0;
let historyGeneration = 0;
const loadError = ref("");
const activeTab = ref("published");
const loading = ref(false);
const detailOpen = ref(false);
const selected = ref<QualityTemplate>();
const creatingId = ref("");
const { can } = usePermission();
const canUse = computed(() => can("iqc:scheme:use") && can("iqc:conversation:view") && can("iqc:task:execute"));
const scenes = computed(() => [...new Set(published.value.map(t => t.snapshot.businessScene))].sort().map(value => ({ label: value, value })));
const filtered = computed(() => published.value.filter(t => (!scene.value || t.snapshot.businessScene === scene.value)
  && `${t.snapshot.name} ${t.snapshot.description || ''}`.toLocaleLowerCase().includes(keyword.value.trim().toLocaleLowerCase())));
const usingHistoricalVersion = computed(() => {
  const selected = usingTemplate.value;
  if (!selected) return false;
  const latest = published.value.find(item => item.schemeId === selected.schemeId);
  return !!latest && latest.versionNo !== selected.versionNo;
});
function openTemplate(template: PublishedTemplate, readOnly: boolean) {
  if (loading.value || loadError.value || !can("iqc:scheme:view") || (!readOnly && !canUse.value)) return;
  previewOnly.value = readOnly; usingTemplate.value = template;
}
function closeVersionHistory() {
  historyGeneration++; versionHistoryOpen.value = false; versionHistoryLoading.value = false;
  versionHistoryTarget.value = undefined; versionHistory.value = []; nextBeforeVersion.value = null;
  versionHistoryError.value = "";
}
async function loadVersionHistory(beforeVersion?: number) {
  const target = versionHistoryTarget.value;
  if (!target || !versionHistoryOpen.value || !can("iqc:scheme:view")) return;
  const request = ++historyGeneration;
  versionHistoryLoading.value = true; versionHistoryError.value = "";
  if (beforeVersion === undefined) { versionHistory.value = []; nextBeforeVersion.value = null; }
  try {
    const page = await listPublishedVersionHistory(target.schemeId, beforeVersion);
    if (request !== historyGeneration) return;
    versionHistory.value = beforeVersion === undefined ? page.versions : [...versionHistory.value, ...page.versions];
    nextBeforeVersion.value = page.nextBeforeVersion;
  } catch {
    if (request === historyGeneration) versionHistoryError.value = "历史版本加载失败；当前模板和任务未改变。";
  } finally {
    if (request === historyGeneration) versionHistoryLoading.value = false;
  }
}
function openVersionHistory(template: PublishedTemplate) {
  if (loading.value || loadError.value || !can("iqc:scheme:view")) return;
  historyGeneration++;
  versionHistoryTarget.value = template; versionHistoryOpen.value = true;
  versionHistory.value = []; nextBeforeVersion.value = null; versionHistoryError.value = "";
  void loadVersionHistory();
}
function chooseVersion(template: PublishedTemplate, readOnly: boolean) {
  closeVersionHistory();
  openTemplate(template, readOnly);
}
function clearFilters() { keyword.value = ""; scene.value = undefined; }
onBeforeUnmount(() => { generation++; historyGeneration++; });

async function refresh() {
  const request = ++generation;
  published.value = [];
  if (!can("iqc:scheme:view")) { loading.value = false; loadError.value = "暂无业务模板查看权限，请联系管理员。"; return; }
  loading.value = true;
  loadError.value = "";
  try {
    const value = await listPublishedTemplates();
    if (request === generation) published.value = value;
  } catch {
    if (request === generation) loadError.value = "业务模板加载失败，请重试。";
  } finally {
    if (request === generation) loading.value = false;
  }
}

async function changeTab(key: string | number) {
  if (key !== "legacy" || templates.value.length) return;
  try { templates.value = await listTemplates(); }
  catch { message.error("规则素材加载失败"); }
}

function showDetail(template: QualityTemplate) {
  selected.value = template;
  detailOpen.value = true;
}

async function createRules(template: QualityTemplate) {
  creatingId.value = template.id;
  try {
    const result = await materializeTemplateRules(template.id);
    message.success(result.created
      ? `已创建 ${result.created} 条规则草稿，${result.existing} 条已存在`
      : `模板中的 ${result.existing} 条规则均已存在`);
  } catch {
    message.error("模板规则创建失败");
  } finally {
    creatingId.value = "";
  }
}

onMounted(refresh);
</script>
<template>
  <section class="page-intro"><div><span class="section-kicker">TEMPLATES</span><h2>业务模板</h2><p>选择业务模板和会话即可开始质检，检查标准和评分由专家统一维护。</p></div><a-space><router-link v-if="can('iqc:scheme:manage')" to="/schemes"><a-button>维护业务方案</a-button></router-link><a-button :loading="loading" @click="refresh">刷新</a-button></a-space></section>
  <a-tabs v-model:active-key="activeTab" @change="changeTab">
  <a-tab-pane key="published" tab="可用业务模板">
    <a-space wrap style="margin-bottom:16px">
      <a-input v-model:value="keyword" allow-clear aria-label="搜索业务模板" placeholder="搜索模板名称或说明" />
      <a-select v-model:value="scene" allow-clear :options="scenes" placeholder="全部业务场景" aria-label="筛选业务场景" style="min-width:180px" />
      <a-button @click="clearFilters">清除筛选</a-button><span>显示 {{ filtered.length }} / {{ published.length }} 个模板</span>
    </a-space>
    <a-alert v-if="!canUse && can('iqc:scheme:view')" type="info" show-icon message="可以查看已发布检查标准；开始质检需要模板使用、会话查看和任务执行权限。" style="margin-bottom:16px" />
    <a-alert v-if="loadError" type="error" :message="loadError" show-icon style="margin-bottom: 16px" />
    <a-spin :spinning="loading">
      <a-row :gutter="[20, 20]">
        <a-col v-for="template in filtered" :key="`${template.schemeId}:${template.versionNo}`" :span="24" :lg="12" :xl="8">
          <a-card :bordered="false" class="template-card">
            <div class="template-card__header"><a-tag color="blue">{{ template.snapshot.businessScene }}</a-tag><span>V{{ template.versionNo }} · 已发布</span></div>
            <h3>{{ template.snapshot.name }}</h3>
            <p class="template-card__description">{{ template.snapshot.description || '标准化检查、独立评分、证据追溯' }}</p>
            <p>{{ template.snapshot.definition.items.length }} 个质检项 · {{ !template.snapshot.definition.scoring.items.length ? '不计分' : template.snapshot.definition.scoring.mode === 'POINTS' ? '得分制' : '扣分制' }}</p>
            <div class="template-card__actions"><a-button @click="openTemplate(template, true)">查看标准</a-button><a-button @click="openVersionHistory(template)">历史版本</a-button><a-button v-if="canUse" type="primary" @click="openTemplate(template, false)">使用模板</a-button></div>
          </a-card>
        </a-col>
      </a-row>
      <a-empty v-if="!loading && !loadError && !published.length" description="暂无已发布业务模板，请联系质量主管准备并发布方案。" />
      <a-empty v-else-if="!loading && !loadError && !filtered.length" description="没有匹配的业务模板，请调整场景或清除筛选。" />
    </a-spin>
  </a-tab-pane>
  <a-tab-pane v-if="can('iqc:rule:manage')" key="legacy" tab="内置规则素材（专家）">
  <a-alert message="以下是用于准备规则草稿的素材，不是可直接执行的业务模板。创建规则并发布后，再编入业务方案。" type="info" show-icon style="margin-bottom: 16px" />
  <a-spin :spinning="loading">
    <a-row :gutter="[20, 20]">
      <a-col v-for="template in templates" :key="template.id" :span="24" :lg="12" :xl="8">
        <a-card :bordered="false" hoverable class="template-card">
          <div class="template-card__header">
            <a-tag color="blue">{{ template.type }}</a-tag>
            <span class="template-card__count">{{ template.rules.length }} 条内置规则</span>
          </div>
          <h3>{{ template.name }}</h3>
          <p class="template-card__description">{{ template.description }}</p>
          <div class="template-card__actions">
            <a-button type="link" @click="showDetail(template)">查看模板</a-button>
            <a-button
              v-if="can('iqc:rule:manage')"
              type="primary"
              size="small"
              :loading="creatingId === template.id"
              @click="createRules(template)"
            >
              创建规则
            </a-button>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </a-spin>
  <a-empty v-if="!loading && !templates.length" description="暂无可用模板" />
  </a-tab-pane>
  </a-tabs>
  <SchemeTaskWizard v-if="usingTemplate" :key="`${usingTemplate.schemeId}:${usingTemplate.versionNo}:${previewOnly}`" :template="usingTemplate" :read-only="previewOnly" :historical-version="usingHistoricalVersion" @close="usingTemplate = undefined" />
  <a-modal :open="versionHistoryOpen" :title="`历史版本：${versionHistoryTarget?.snapshot.name || ''}`" :width="820" :footer="null" :mask-closable="!versionHistoryLoading" @cancel="closeVersionHistory">
    <a-alert message="历史版本只读且不可变。选择版本后，任务将精确使用该版本的冻结标准，不会自动升级到当前版本。停用模板不能从此处创建任务。" type="info" show-icon style="margin-bottom: 16px" />
    <a-alert v-if="versionHistoryError" :message="versionHistoryError" type="error" show-icon style="margin-bottom: 12px" />
    <a-spin :spinning="versionHistoryLoading">
      <a-list v-if="versionHistory.length" :data-source="versionHistory" bordered>
        <template #renderItem="{ item }"><a-list-item>
          <a-list-item-meta :title="`V${item.versionNo} · ${item.snapshot.name}`" :description="`${item.snapshot.businessScene} · ${item.snapshot.definition.items.length} 个质检项`" />
          <template #extra><a-space><a-tag v-if="published.find(latest => latest.schemeId === item.schemeId)?.versionNo === item.versionNo" color="green">当前版本</a-tag><a-button @click="chooseVersion(item, true)">查看标准</a-button><a-button v-if="canUse" type="primary" @click="chooseVersion(item, false)">使用此版本</a-button></a-space></template>
        </a-list-item></template>
      </a-list>
      <a-empty v-if="!versionHistoryLoading && !versionHistoryError && !versionHistory.length" description="此模板尚无发布历史。" />
    </a-spin>
    <a-space style="margin-top: 16px"><a-button v-if="versionHistoryError" :disabled="versionHistoryLoading" @click="loadVersionHistory(versionHistory.length ? nextBeforeVersion ?? undefined : undefined)">重试</a-button><a-button v-else-if="nextBeforeVersion" :loading="versionHistoryLoading" @click="loadVersionHistory(nextBeforeVersion)">加载更早版本</a-button><a-button @click="closeVersionHistory">关闭</a-button></a-space>
  </a-modal>
  <a-drawer v-model:open="detailOpen" :title="selected?.name" width="680"><template v-if="selected"><a-alert :message="selected.description" type="info" show-icon style="margin-bottom: 16px" /><a-list :data-source="selected.rules" bordered><template #renderItem="{ item }"><a-list-item><a-list-item-meta :title="item.name" :description="item.description" /><template #extra><a-tag :color="item.riskLevel === 'HIGH' ? 'error' : item.riskLevel === 'MEDIUM' ? 'warning' : 'default'">{{ item.riskLevel }}</a-tag></template></a-list-item></template></a-list></template></a-drawer>
</template>

<style scoped>
.template-card {
  height: 100%;
}

.template-card :deep(.ant-card-body) {
  display: flex;
  min-height: 210px;
  flex-direction: column;
  padding: 24px;
}

.template-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.template-card h3 {
  margin: 0 0 10px;
  font-size: 18px;
  line-height: 1.5;
}

.template-card__count {
  color: #64748b;
  font-size: 13px;
  white-space: nowrap;
}

.template-card__description {
  min-height: 48px;
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.template-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
  padding-top: 24px;
  border-top: 1px solid #f1f5f9;
}
</style>
