<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "ant-design-vue";
import { getApiConversationStats, type ApiConversationStats } from "@/api/conversations";

function localDateTime(date: Date) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 19); }
const end = new Date(); const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
const period = ref<[string, string]>([localDateTime(start), localDateTime(end)]);
const loading = ref(false); const stats = ref<ApiConversationStats>();
const endpoint = computed(() => `${window.location.origin}/api/iqc/conversations/ingest`);
const batchEndpoint = computed(() => endpoint.value.replace('/ingest', '/ingest-batch'));
const payload = `{
  "externalId": "CRM-20260827-0001",
  "batchNo": "CRM-20260827",
  "title": "客户账单咨询",
  "employeeId": "user-1001",
  "employeeName": "张三",
  "employeeGroupId": "sales-east",
  "customerExternalId": "customer-9001",
  "customerName": "李先生",
  "customerContactMasked": "138****1234",
  "channel": "WECHAT",
  "startedTime": "2026-08-27T10:00:00",
  "businessType": "ORDER",
  "businessNo": "ORDER-10001",
  "tags": ["高意向", "账单咨询"],
  "messages": [
    { "role": "agent", "time": "00:00:01", "content": "您好，请问有什么可以帮您？" },
    { "role": "user", "time": "00:00:05", "content": "我想查询本月账单。" }
  ]
}`;
const curlCode = computed(() => `curl -X POST '${endpoint.value}' \\\n  -H 'Authorization: Bearer <access-token>' \\\n  -H 'Content-Type: application/json' \\\n  -d '${payload.replace(/\n/g, "")}'`);
const jsCode = computed(() => `await fetch('${endpoint.value}', {
  method: 'POST',
  headers: { Authorization: 'Bearer <access-token>', 'Content-Type': 'application/json' },
  body: JSON.stringify(${payload})
});`);
async function loadStats() { loading.value = true; try { stats.value = await getApiConversationStats(period.value[0], period.value[1]); } catch { message.error("接口入库统计加载失败"); } finally { loading.value = false; } }
async function copy(value: string) { await navigator.clipboard.writeText(value); message.success("已复制"); }
onMounted(loadStats);
</script>

<template>
  <div class="api-page">
    <section class="page-intro"><div><span>API INTEGRATION</span><h2>接口对接</h2><p>上游系统支持单条或批量实时推送，平台负责幂等入库、批次归档和后续质检。</p></div><a-button @click="copy(endpoint)">复制接口地址</a-button></section>
    <a-card :bordered="false" class="stats-card">
      <div class="stats-toolbar"><div><strong>接口入库概览</strong><p>统计来源为 API 的会话，不包含文本上传。</p></div><a-range-picker v-model:value="period" show-time value-format="YYYY-MM-DDTHH:mm:ss" @change="loadStats" /></div>
      <a-spin :spinning="loading"><a-row :gutter="16">
        <a-col :xs="12" :lg="6"><a-statistic title="入库会话" :value="stats?.conversationCount || 0" suffix="个" /></a-col>
        <a-col :xs="12" :lg="6"><a-statistic title="消息总量" :value="stats?.messageCount || 0" suffix="条" /></a-col>
        <a-col :xs="12" :lg="6"><a-statistic title="业务批次" :value="stats?.batchCount || 0" suffix="个" /></a-col>
        <a-col :xs="12" :lg="6"><a-statistic title="携带外部编号" :value="stats?.externalIdCount || 0" suffix="个" /></a-col>
      </a-row></a-spin>
    </a-card>
    <a-row :gutter="16">
      <a-col :xs="24" :xl="15"><a-card title="接口契约" :bordered="false">
        <a-descriptions bordered :column="1" size="small"><a-descriptions-item label="单条地址"><a-typography-text copyable>{{ endpoint }}</a-typography-text></a-descriptions-item><a-descriptions-item label="批量地址"><a-typography-text copyable>{{ batchEndpoint }}</a-typography-text></a-descriptions-item><a-descriptions-item label="方法">POST</a-descriptions-item><a-descriptions-item label="内容类型">application/json</a-descriptions-item><a-descriptions-item label="批量请求体">{ batchNo?: string, conversations: Conversation[] }</a-descriptions-item><a-descriptions-item label="认证">OAuth2 Bearer Token 或平台登录会话；调用方需具备 iqc:conversation:upload</a-descriptions-item><a-descriptions-item label="幂等">externalId 对 API 来源全局幂等；无 externalId 时使用消息 SHA-256 指纹</a-descriptions-item><a-descriptions-item label="限制">单会话最多 5000 条消息；批量最多 100 个会话；单条默认每分钟 120 次</a-descriptions-item></a-descriptions>
        <a-table class="field-table" :pagination="false" size="small" :data-source="[
          {name:'externalId',type:'string',required:'建议',note:'上游会话唯一编号'}, {name:'employeeId',type:'string',required:'建议',note:'OpenSabre 用户 ID'}, {name:'employeeName',type:'string',required:'建议',note:'员工姓名历史快照'}, {name:'employeeGroupId',type:'string',required:'否',note:'员工所属部门 ID'}, {name:'customerExternalId',type:'string',required:'建议',note:'CRM 等上游客户编号'}, {name:'customerName',type:'string',required:'否',note:'客户显示名'}, {name:'customerContactMasked',type:'string',required:'否',note:'仅允许脱敏联系方式'}, {name:'channel',type:'string',required:'否',note:'WEB/PHONE/WECHAT/APP 等'}, {name:'startedTime',type:'datetime',required:'否',note:'会话开始时间'}, {name:'businessType/businessNo',type:'string',required:'否',note:'关联订单、工单等业务对象'}, {name:'tags',type:'array',required:'否',note:'业务标签'}, {name:'batchNo',type:'string',required:'否',note:'上游业务批次号'}, {name:'title',type:'string',required:'否',note:'会话标题'}, {name:'messages',type:'array',required:'是',note:'消息数组'}, {name:'messages[].role',type:'string',required:'是',note:'agent/user 等角色'}, {name:'messages[].time',type:'HH:mm:ss',required:'否',note:'相对会话时间'}, {name:'messages[].content',type:'string',required:'是',note:'消息正文'}]" row-key="name">
          <a-table-column title="字段" data-index="name" /><a-table-column title="类型" data-index="type" /><a-table-column title="必填" data-index="required" :width="70" /><a-table-column title="说明" data-index="note" />
        </a-table>
      </a-card></a-col>
      <a-col :xs="24" :xl="9"><a-card title="对接步骤" :bordered="false"><a-steps direction="vertical" :current="3" :items="[{title:'申请权限',description:'为调用账号授予会话上传权限'},{title:'联调验证',description:'使用测试 externalId 推送一条完整会话'},{title:'确认幂等',description:'重复推送并确认返回同一会话'},{title:'生产接入',description:'监控本页时段入库量与调用错误'}]" /></a-card></a-col>
    </a-row>
    <a-card title="调用示例" :bordered="false"><a-tabs><a-tab-pane key="json" tab="JSON"><pre><code>{{ payload }}</code></pre></a-tab-pane><a-tab-pane key="curl" tab="cURL"><pre><code>{{ curlCode }}</code></pre></a-tab-pane><a-tab-pane key="js" tab="JavaScript"><pre><code>{{ jsCode }}</code></pre></a-tab-pane></a-tabs></a-card>
  </div>
</template>

<style scoped>
.api-page{display:flex;flex-direction:column;gap:18px}.page-intro,.stats-toolbar{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.page-intro span{font-size:12px;letter-spacing:.14em;color:#1677ff}.page-intro h2{margin:4px 0}.page-intro p,.stats-toolbar p{margin:0;color:#64748b}.stats-card{background:linear-gradient(135deg,#fff,#f3f8ff)}.field-table{margin-top:18px}pre{margin:0;padding:16px;border-radius:10px;background:#0f172a;color:#dbeafe;overflow:auto;line-height:1.6}@media(max-width:768px){.page-intro,.stats-toolbar{flex-direction:column}.stats-toolbar :deep(.ant-picker){width:100%}}
</style>
