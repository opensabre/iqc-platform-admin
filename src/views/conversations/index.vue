<script setup lang="ts">
import { onMounted, ref } from "vue";
import { message, type UploadChangeParam, type UploadFile } from "ant-design-vue";
import { batchImportConversations, getConversation, importConversationZip, listConversations, type ConversationDetail, type ConversationMetadata, type ConversationSummary } from "@/api/conversations";
import { usePermission } from "@/composables/permission";

const { can } = usePermission();
const uploading = ref(false);
const conversations = ref<ConversationSummary[]>([]);
const total = ref(0); const page = ref(1); const pageSize = ref(20);
const latestBatch = ref<{ batchNo: string; totalCount: number; successCount: number }>();
const pendingFiles = ref<File[]>([]);
const zipFile = ref<File>();
const detailOpen = ref(false); const detailLoading = ref(false); const detail = ref<ConversationDetail>();
const metadata = ref<ConversationMetadata>({ channel: "WEB" });
const tagText = ref("");
const filters = ref({ employeeId: "", customerExternalId: "", channel: "", businessNo: "", fileName: "" });

function importMetadata(): ConversationMetadata { return { ...metadata.value, tags: tagText.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }; }

async function handleBatchUpload(info: UploadChangeParam<UploadFile>) {
  const files = (info.fileList || []).flatMap((item) => item.originFileObj ? [item.originFileObj as unknown as File] : []);
  pendingFiles.value = files;
}
async function startBatchImport() {
  const files = pendingFiles.value;
  if (!files.length || uploading.value) { message.warning("请先选择会话文件"); return; }
  if (files.some((file) => !file.name.toLowerCase().endsWith(".txt"))) { message.error("仅支持 txt 文件"); return; }
  uploading.value = true;
  try {
    latestBatch.value = await batchImportConversations(files, importMetadata());
    message.success(`批次 ${latestBatch.value.batchNo} 已导入 ${latestBatch.value.successCount} 个会话`);
    pendingFiles.value = [];
    await refreshConversations();
  } catch (error) { message.error(error instanceof Error ? error.message : "批量导入失败"); }
  finally { uploading.value = false; }
}
function handleZipUpload(info: UploadChangeParam<UploadFile>) { zipFile.value = info.file.originFileObj as unknown as File; }
async function startZipImport() {
  if (!zipFile.value || uploading.value) { message.warning("请先选择 ZIP 包"); return; }
  uploading.value = true;
  try {
    latestBatch.value = await importConversationZip(zipFile.value, importMetadata());
    message.success(`ZIP 批次 ${latestBatch.value.batchNo} 已导入 ${latestBatch.value.successCount} 个会话`);
    zipFile.value = undefined; await refreshConversations();
  } catch (error) { message.error(error instanceof Error ? error.message : "ZIP 导入失败"); }
  finally { uploading.value = false; }
}
async function refreshConversations() { const result = await listConversations({ current: page.value, size: pageSize.value, ...filters.value }); conversations.value = result.records; total.value = result.total; }
async function resetFilters() { filters.value = { employeeId: "", customerExternalId: "", channel: "", businessNo: "", fileName: "" }; page.value = 1; await refreshConversations(); }
async function changePage(current: number, size: number) { page.value = current; pageSize.value = size; await refreshConversations(); }
async function showDetail(id: string) {
  detailOpen.value = true; detailLoading.value = true;
  try { detail.value = await getConversation(id); }
  catch { message.error("会话详情加载失败"); detailOpen.value = false; }
  finally { detailLoading.value = false; }
}
function isAgent(role: string) { return ["agent", "assistant", "客服"].includes(role.toLowerCase()); }
function roleLabel(role: string) { return isAgent(role) ? "客服" : "客户"; }
onMounted(refreshConversations);
</script>

<template>
  <div class="conversation-page">
    <section class="page-intro">
      <div><span class="section-kicker">CONVERSATION HUB</span><h2>会话中心</h2><p>上传文本会话并按批次集中接入，统一追踪来源，再用聊天视图核对原始上下文。</p></div>
      <a-tag color="blue">API：POST /api/iqc/conversations/ingest</a-tag>
    </section>
    <a-row :gutter="16">
      <a-col :xs="24" :lg="16">
        <a-card v-if="can('iqc:conversation:upload')" title="文本批量入库" :bordered="false">
          <a-alert type="info" show-icon message="以下归属信息会应用到本次选择的全部会话文件" description="员工 ID 引用 OpenSabre 用户；客户 ID 使用 CRM 等上游系统编号。" class="metadata-tip" />
          <a-form layout="vertical" class="metadata-form">
            <a-row :gutter="12"><a-col :xs="24" :md="8"><a-form-item label="沟通员工 ID"><a-input v-model:value="metadata.employeeId" placeholder="OpenSabre 用户 ID" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="员工姓名快照"><a-input v-model:value="metadata.employeeName" placeholder="例如：张三" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="员工部门 ID"><a-input v-model:value="metadata.employeeGroupId" placeholder="组织部门 ID" /></a-form-item></a-col></a-row>
            <a-row :gutter="12"><a-col :xs="24" :md="8"><a-form-item label="客户外部 ID"><a-input v-model:value="metadata.customerExternalId" placeholder="CRM 客户编号" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="客户名称"><a-input v-model:value="metadata.customerName" placeholder="客户显示名" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="脱敏联系方式"><a-input v-model:value="metadata.customerContactMasked" placeholder="138****1234" /></a-form-item></a-col></a-row>
            <a-row :gutter="12"><a-col :xs="24" :md="6"><a-form-item label="渠道"><a-select v-model:value="metadata.channel" allow-clear><a-select-option value="WEB">网页</a-select-option><a-select-option value="PHONE">电话</a-select-option><a-select-option value="WECHAT">微信</a-select-option><a-select-option value="APP">App</a-select-option><a-select-option value="OTHER">其他</a-select-option></a-select></a-form-item></a-col><a-col :xs="24" :md="6"><a-form-item label="业务类型"><a-input v-model:value="metadata.businessType" placeholder="ORDER / TICKET" /></a-form-item></a-col><a-col :xs="24" :md="6"><a-form-item label="业务编号"><a-input v-model:value="metadata.businessNo" placeholder="订单或工单编号" /></a-form-item></a-col><a-col :xs="24" :md="6"><a-form-item label="业务标签"><a-input v-model:value="tagText" placeholder="投诉, 高意向" /></a-form-item></a-col></a-row>
          </a-form>
          <a-tabs>
            <a-tab-pane key="files" tab="多个 TXT">
              <a-upload-dragger accept=".txt,text/plain" multiple :show-upload-list="true" :before-upload="() => false" @change="handleBatchUpload">
                <p class="upload-icon">⇧</p><p class="ant-upload-text">选择或拖入多个 TXT 会话文件</p><p class="ant-upload-hint">每批最多 100 个文件，单文件最大 20MB</p>
              </a-upload-dragger>
              <a-button type="primary" :loading="uploading" class="import-button" @click="startBatchImport">开始批量导入（{{ pendingFiles.length }}）</a-button>
            </a-tab-pane>
            <a-tab-pane key="zip" tab="ZIP 压缩包">
              <a-upload-dragger accept=".zip,application/zip" :max-count="1" :before-upload="() => false" @change="handleZipUpload">
                <p class="upload-icon">ZIP</p><p class="ant-upload-text">上传包含多个 TXT 会话的 ZIP 包</p><p class="ant-upload-hint">最多 100 个 TXT；单文件 20MB，解压总量 100MB；目录结构会自动忽略</p>
              </a-upload-dragger>
              <a-button type="primary" :loading="uploading" class="import-button" @click="startZipImport">开始 ZIP 导入</a-button>
            </a-tab-pane>
          </a-tabs>
          <a-spin v-if="uploading" tip="正在建立批次并解析会话…" />
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="8">
        <a-card title="最近导入批次" :bordered="false" class="batch-card">
          <template v-if="latestBatch"><strong>{{ latestBatch.batchNo }}</strong><a-statistic title="成功会话" :value="latestBatch.successCount" :suffix="`/ ${latestBatch.totalCount}`" /></template>
          <a-empty v-else description="本次操作暂无批次" />
        </a-card>
      </a-col>
    </a-row>
    <a-card title="会话档案" :bordered="false" class="list-card">
      <a-form layout="inline" class="archive-filter"><a-form-item label="员工"><a-input v-model:value="filters.employeeId" allow-clear placeholder="员工 ID" /></a-form-item><a-form-item label="客户"><a-input v-model:value="filters.customerExternalId" allow-clear placeholder="客户 ID" /></a-form-item><a-form-item label="渠道"><a-input v-model:value="filters.channel" allow-clear placeholder="渠道" /></a-form-item><a-form-item label="业务编号"><a-input v-model:value="filters.businessNo" allow-clear /></a-form-item><a-form-item label="文件"><a-input v-model:value="filters.fileName" allow-clear /></a-form-item><a-form-item><a-button type="primary" @click="refreshConversations">查询</a-button><a-button @click="resetFilters">重置</a-button></a-form-item></a-form>
      <a-table :data-source="conversations" :pagination="false" row-key="id" size="middle">
        <a-table-column title="会话名称" data-index="sourceFileName" />
        <a-table-column title="员工" :width="140"><template #default="{ record }">{{ record.employeeName || record.employeeId || "-" }}</template></a-table-column>
        <a-table-column title="客户" :width="140"><template #default="{ record }">{{ record.customerName || record.customerExternalId || "-" }}</template></a-table-column>
        <a-table-column title="渠道" data-index="channel" :width="90" />
        <a-table-column title="业务编号" data-index="businessNo" :width="140" />
        <a-table-column title="批次号" data-index="batchNo" :width="210"><template #default="{ text }"><a-typography-text copyable>{{ text || "单条接入" }}</a-typography-text></template></a-table-column>
        <a-table-column title="来源" data-index="sourceType" :width="90"><template #default="{ text }"><a-tag :color="text === 'API' ? 'purple' : 'blue'">{{ text || "FILE" }}</a-tag></template></a-table-column>
        <a-table-column title="消息" data-index="messageCount" :width="80" />
        <a-table-column title="状态" data-index="status" :width="150" />
        <a-table-column title="创建时间" data-index="createdTime" :width="180" />
        <a-table-column title="操作" :width="90"><template #default="{ record }"><a-button type="link" @click="showDetail(record.id)">查看对话</a-button></template></a-table-column>
      </a-table>
      <a-pagination v-if="total" v-model:current="page" v-model:page-size="pageSize" :total="total" show-size-changer class="pager" @change="changePage" />
      <a-empty v-if="!conversations.length" description="暂无会话" />
    </a-card>
    <a-drawer v-model:open="detailOpen" title="会话明细" width="min(760px, 100vw)" destroy-on-close>
      <a-spin :spinning="detailLoading">
        <template v-if="detail">
          <a-descriptions size="small" :column="2" bordered class="detail-meta">
            <a-descriptions-item label="会话">{{ detail.conversation.sourceFileName }}</a-descriptions-item><a-descriptions-item label="批次">{{ detail.conversation.batchNo || "单条接入" }}</a-descriptions-item>
            <a-descriptions-item label="来源">{{ detail.conversation.sourceType || "FILE" }}</a-descriptions-item><a-descriptions-item label="消息数">{{ detail.conversation.messageCount }}</a-descriptions-item>
            <a-descriptions-item label="沟通员工">{{ detail.conversation.employeeName || "-" }}（{{ detail.conversation.employeeId || "无 ID" }}）</a-descriptions-item><a-descriptions-item label="员工部门">{{ detail.conversation.employeeGroupId || "-" }}</a-descriptions-item>
            <a-descriptions-item label="客户">{{ detail.conversation.customerName || "-" }}（{{ detail.conversation.customerExternalId || "无 ID" }}）</a-descriptions-item><a-descriptions-item label="脱敏联系方式">{{ detail.conversation.customerContactMasked || "-" }}</a-descriptions-item>
            <a-descriptions-item label="渠道/时间">{{ detail.conversation.channel || "-" }} · {{ detail.conversation.startedTime || "-" }}</a-descriptions-item><a-descriptions-item label="业务对象">{{ detail.conversation.businessType || "-" }} / {{ detail.conversation.businessNo || "-" }}</a-descriptions-item>
          </a-descriptions>
          <div class="chat-panel">
            <div v-for="item in detail.messages" :key="item.id" class="chat-row" :class="{ agent: isAgent(item.speakerRole) }">
              <a-avatar :class="isAgent(item.speakerRole) ? 'agent-avatar' : 'user-avatar'">{{ roleLabel(item.speakerRole).slice(0, 1) }}</a-avatar>
              <div class="chat-body"><div class="chat-info"><span>{{ roleLabel(item.speakerRole) }}</span><time>{{ item.relativeTime }}</time></div><div class="bubble">{{ item.content }}</div></div>
            </div>
          </div>
        </template>
      </a-spin>
    </a-drawer>
  </div>
</template>

<style scoped>
.conversation-page{display:flex;flex-direction:column;gap:18px}.page-intro{display:flex;justify-content:space-between;align-items:flex-start}.page-intro h2{margin:4px 0}.page-intro p{margin:0;color:#64748b}.section-kicker{font-size:12px;letter-spacing:.15em;color:#1677ff}.metadata-tip{margin-bottom:16px}.metadata-form :deep(.ant-form-item){margin-bottom:12px}.archive-filter{margin-bottom:16px;gap:8px}.upload-icon{font-size:36px;margin:0;color:#1677ff}.batch-card{height:100%}.list-card{margin-top:2px}.pager{margin-top:16px;text-align:right}.detail-meta{margin-bottom:20px}.chat-panel{padding:20px 8px;background:#f6f8fb;border-radius:12px;min-height:300px}.chat-row{display:flex;gap:10px;margin-bottom:18px;align-items:flex-start}.chat-row.agent{flex-direction:row-reverse}.agent-avatar{background:#1677ff}.user-avatar{background:#64748b}.chat-body{max-width:75%}.chat-info{display:flex;gap:10px;margin-bottom:5px;color:#64748b;font-size:12px}.agent .chat-info{justify-content:flex-end}.bubble{padding:11px 14px;background:#fff;border-radius:4px 14px 14px 14px;box-shadow:0 2px 8px rgba(15,23,42,.06);white-space:pre-wrap;word-break:break-word}.agent .bubble{background:#1677ff;color:#fff;border-radius:14px 4px 14px 14px}@media(max-width:768px){.page-intro{gap:12px;flex-direction:column}.chat-body{max-width:82%}}
</style>
