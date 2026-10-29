<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { message, type UploadChangeParam, type UploadFile } from "ant-design-vue";
import { batchImportConversations, importConversationZip, type ConversationMetadata } from "@/api/conversations";
import { usePermission } from "@/composables/permission";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";

const { can } = usePermission();
const uploading = ref(false);
const canBatch=computed(()=>can("iqc:conversation:batch-upload")),canZip=computed(()=>can("iqc:conversation:zip-upload"));
const activeUploadTab=ref("files");
let disposed=false,generation=0,activePermission:string|undefined;
const latestBatch = ref<{ batchNo: string; totalCount: number; successCount: number }>();
const pendingFiles = ref<File[]>([]);
const zipFile = ref<File>();
const metadata = ref<ConversationMetadata>({ channel: "WEB" });
const complaintChoice=ref<'UNSPECIFIED'|'YES'|'NO'>('UNSPECIFIED'),businessFieldsText=ref('');
const channelOptions = ref<DictionaryItem[]>([
  { value: "WEB", label: "网页" }, { value: "PHONE", label: "电话" },
  { value: "WECHAT", label: "微信" }, { value: "APP", label: "App" }, { value: "OTHER", label: "其他" },
]);
const businessTypeOptions = ref<DictionaryItem[]>([]);

function importMetadata(): ConversationMetadata {
  const value:ConversationMetadata={...metadata.value};
  for(const key of ['startedTime','endedTime'] as const){const raw=value[key]?.trim();if(!raw){delete value[key];continue;}const date=new Date(`${raw}Z`);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?$/.test(raw)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,19)!==raw.slice(0,19))throw Error('会话时间请填写有效本地 ISO 时间，例如 2026-10-05T10:00:00');value[key]=raw;}
  const ordered=(time:string)=>`${time.slice(0,19)}.${(time.split('.')[1]||'').padEnd(9,'0')}`;
  if(value.startedTime&&value.endedTime&&ordered(value.endedTime)<ordered(value.startedTime))throw Error('结束时间不能早于开始时间');
  for(const key of ['employeeDepartmentId','asrStatus','customerLevel'] as const){const raw=value[key]?.trim();if(raw)value[key]=raw;else delete value[key];}
  if(complaintChoice.value!=='UNSPECIFIED')value.complaint=complaintChoice.value==='YES';else delete value.complaint;
  if(businessFieldsText.value.trim()){
    let fields:unknown;try{fields=JSON.parse(businessFieldsText.value);}catch{throw Error('自定义业务字段必须是合法 JSON 对象');}
    if(!fields||Array.isArray(fields)||typeof fields!=='object')throw Error('自定义业务字段必须是 JSON 对象');
    const entries=Object.entries(fields);if(entries.length>64)throw Error('自定义业务字段最多64项');
    for(const [key,item] of entries){if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key))throw Error('业务字段键须以字母开头，仅包含字母、数字、下划线，最长64字');if(item!==null&&!['string','number','boolean'].includes(typeof item))throw Error('业务字段值仅允许字符串、数值、布尔值或 null');if(typeof item==='string'&&item.length>4096)throw Error('业务字段字符串最长4096字');if(typeof item==='number'&&!Number.isFinite(item))throw Error('业务字段数值必须有限');}
    if(new TextEncoder().encode(JSON.stringify(fields)).length>65536)throw Error('自定义业务字段 JSON 最多65536字节');
    value.businessFields=fields as NonNullable<ConversationMetadata['businessFields']>;
  }else delete value.businessFields;
  return value;
}

async function handleBatchUpload(info: UploadChangeParam<UploadFile>) {
  if(disposed||uploading.value||!canBatch.value)return;
  const files = (info.fileList || []).flatMap((item) => item.originFileObj ? [item.originFileObj as unknown as File] : []);
  pendingFiles.value = files;
}
async function startBatchImport() {
  if(disposed||!canBatch.value)return;
  const files = [...pendingFiles.value];
  if (!files.length || uploading.value) { message.warning("请先选择会话文件"); return; }
  if (files.some((file) => !file.name.toLowerCase().endsWith(".txt"))) { message.error("仅支持 txt 文件"); return; }
  uploading.value = true;const request=++generation;activePermission="iqc:conversation:batch-upload";
  try {
    const result=await batchImportConversations(files, importMetadata());
    if(disposed||request!==generation||!canBatch.value)return;latestBatch.value=result;
    message.success(`批次 ${latestBatch.value.batchNo} 已导入 ${latestBatch.value.successCount} 个会话`);
    pendingFiles.value = [];
  } catch (error) { if(!disposed&&request===generation&&canBatch.value)message.error(error instanceof Error ? error.message : "批量导入失败"); }
  finally { if(!disposed){uploading.value=false;activePermission=undefined;} }
}
function handleZipUpload(info: UploadChangeParam<UploadFile>) { if(disposed||uploading.value||!canZip.value)return;zipFile.value = info.file.originFileObj as unknown as File; }
async function startZipImport() {
  if(disposed||!canZip.value)return;
  if (!zipFile.value || uploading.value) { message.warning("请先选择 ZIP 包"); return; }
  const file=zipFile.value;uploading.value = true;const request=++generation;activePermission="iqc:conversation:zip-upload";
  try {
    const result=await importConversationZip(file, importMetadata());
    if(disposed||request!==generation||!canZip.value)return;latestBatch.value=result;
    message.success(`ZIP 批次 ${latestBatch.value.batchNo} 已导入 ${latestBatch.value.successCount} 个会话`);
    zipFile.value = undefined;
  } catch (error) { if(!disposed&&request===generation&&canZip.value)message.error(error instanceof Error ? error.message : "ZIP 导入失败"); }
  finally { if(!disposed){uploading.value=false;activePermission=undefined;} }
}
async function loadDictionaries() {
  try {
    const data = await getCachedDictionaries(["iqc_conversation_channel", "iqc_business_type"]);
    if (data.iqc_conversation_channel?.length) channelOptions.value = data.iqc_conversation_channel;
    if (data.iqc_business_type?.length) businessTypeOptions.value = data.iqc_business_type;
  } catch { /* 字典服务暂不可用时使用渠道兜底，业务类型允许为空。 */ }
}
watch([canBatch,canZip],([batch,zip])=>{
 if(!batch)pendingFiles.value=[];if(!zip)zipFile.value=undefined;
 if(activePermission&&!can(activePermission)){generation++;latestBatch.value=undefined;}
 if(activeUploadTab.value==="files"&&!batch&&zip)activeUploadTab.value="zip";
 if(activeUploadTab.value==="zip"&&!zip&&batch)activeUploadTab.value="files";
 if(!batch&&!zip){generation++;latestBatch.value=undefined;metadata.value={channel:"WEB"};complaintChoice.value="UNSPECIFIED";businessFieldsText.value="";}
},{immediate:true});
onBeforeUnmount(()=>{disposed=true;generation++;pendingFiles.value=[];zipFile.value=undefined;latestBatch.value=undefined;metadata.value={channel:"WEB"};complaintChoice.value="UNSPECIFIED";businessFieldsText.value="";});
onMounted(() => { void loadDictionaries(); });
</script>

<template>
  <div class="conversation-page">
    <section class="page-intro">
      <div><span class="section-kicker">CONVERSATION HUB</span><h2>会话中心</h2><p>上传文本会话并按批次集中接入，统一追踪来源，再用聊天视图核对原始上下文。</p></div>
      <a-tag color="blue">API：POST /api/iqc/conversations/ingest</a-tag>
    </section>
    <a-row :gutter="16">
      <a-col :xs="24" :lg="16">
        <a-card v-if="canBatch||canZip" title="文本批量入库" :bordered="false">
          <a-alert type="info" show-icon message="以下归属信息会应用到本次选择的全部会话文件" description="员工 ID 引用 OpenSabre 用户；客户 ID 使用 CRM 等上游系统编号。" class="metadata-tip" />
          <a-form layout="vertical" class="metadata-form">
            <a-row :gutter="12"><a-col :xs="24" :md="8"><a-form-item label="沟通员工 ID"><a-input v-model:value="metadata.employeeId" placeholder="OpenSabre 用户 ID" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="员工姓名快照"><a-input v-model:value="metadata.employeeName" placeholder="例如：张三" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="员工组织 / 团队 ID"><a-input v-model:value="metadata.employeeGroupId" placeholder="组织或团队 ID（employeeGroupId）" /></a-form-item></a-col></a-row>
            <a-row :gutter="12"><a-col :xs="24" :md="8"><a-form-item label="客户外部 ID"><a-input v-model:value="metadata.customerExternalId" placeholder="CRM 客户编号" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="客户名称"><a-input v-model:value="metadata.customerName" placeholder="客户显示名" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="脱敏联系方式"><a-input v-model:value="metadata.customerContactMasked" placeholder="138****1234" /></a-form-item></a-col></a-row>
            <a-row :gutter="12"><a-col :xs="24" :md="8"><a-form-item label="渠道"><a-select v-model:value="metadata.channel" allow-clear placeholder="选择渠道"><a-select-option v-for="item in channelOptions" :key="item.value" :value="item.value">{{ item.label }}</a-select-option></a-select></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="业务类型"><a-select v-model:value="metadata.businessType" allow-clear show-search placeholder="选择业务类型"><a-select-option v-for="item in businessTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</a-select-option></a-select></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="业务编号"><a-input v-model:value="metadata.businessNo" placeholder="订单或工单编号" /></a-form-item></a-col></a-row>
            <a-row :gutter="12"><a-col :xs="24" :md="8"><a-form-item label="员工部门 ID"><a-input v-model:value="metadata.employeeDepartmentId" :maxlength="64" placeholder="独立部门 ID（employeeDepartmentId）" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="真实转写状态（可选）"><a-input v-model:value="metadata.asrStatus" :maxlength="32" placeholder="仅填写上游真实状态；未知留空" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="客户等级（可选）"><a-input v-model:value="metadata.customerLevel" :maxlength="64" placeholder="上游客户等级；未知留空" /></a-form-item></a-col></a-row>
            <a-row :gutter="12"><a-col :xs="24" :md="8"><a-form-item label="是否投诉"><a-select v-model:value="complaintChoice" :options="[{value:'UNSPECIFIED',label:'未提供'},{value:'YES',label:'是'},{value:'NO',label:'否'}]" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="会话开始时间（Asia/Shanghai 本地 ISO）"><a-input v-model:value="metadata.startedTime" placeholder="2026-10-05T10:00:00" /></a-form-item></a-col><a-col :xs="24" :md="8"><a-form-item label="会话结束时间（Asia/Shanghai 本地 ISO）"><a-input v-model:value="metadata.endedTime" placeholder="2026-10-05T10:15:00" /></a-form-item></a-col></a-row>
            <a-form-item label="自定义业务字段（可选 JSON 对象）"><a-textarea v-model:value="businessFieldsText" :rows="3" placeholder='{"orderAmount":199.5,"priorityCustomer":true,"region":"华东"}' /><small>最多64个标量字段；未知值可用 null。不会自动推断转写状态、客户等级或投诉事实。</small></a-form-item>
          </a-form>
          <a-tabs v-model:active-key="activeUploadTab">
            <a-tab-pane v-if="canBatch" key="files" tab="多个 TXT">
              <a-upload-dragger accept=".txt,text/plain" multiple :show-upload-list="true" :disabled="uploading" :before-upload="() => false" @change="handleBatchUpload">
                <p class="upload-icon">⇧</p><p class="ant-upload-text">选择或拖入多个 TXT 会话文件</p><p class="ant-upload-hint">每批最多 100 个文件，单文件最大 20MB</p>
              </a-upload-dragger>
              <a-button type="primary" :loading="uploading" class="import-button" @click="startBatchImport">开始批量导入（{{ pendingFiles.length }}）</a-button>
            </a-tab-pane>
            <a-tab-pane v-if="canZip" key="zip" tab="ZIP 压缩包">
              <a-upload-dragger accept=".zip,application/zip" :max-count="1" :disabled="uploading" :before-upload="() => false" @change="handleZipUpload">
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
  </div>
</template>

<style scoped>
.conversation-page{display:flex;flex-direction:column;gap:18px}.page-intro{display:flex;justify-content:space-between;align-items:flex-start}.page-intro h2{margin:4px 0}.page-intro p{margin:0;color:#64748b}.section-kicker{font-size:12px;letter-spacing:.15em;color:#1677ff}.metadata-tip{margin-bottom:16px}.metadata-form :deep(.ant-form-item){margin-bottom:12px}.upload-icon{font-size:36px;margin:0;color:#1677ff}.batch-card{height:100%}
</style>
