<script setup lang="ts">
import { onMounted, ref } from "vue";
import ModelGatewayCalls from "@/components/ModelGatewayCalls.vue";
import { Modal, message } from "ant-design-vue";
import { createModelProfile, disableModelProfile, enableModelProfile, listModelProfiles, testModelProfile, updateModelProfile, type IqcModelProfile, type IqcModelProfileRequest } from "@/api/config";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import { usePermission } from "@/composables/permission";

const modelCalls=ref<InstanceType<typeof ModelGatewayCalls>>();
const profiles=ref<IqcModelProfile[]>([]); const loading=ref(false); const saving=ref(false); const modalOpen=ref(false); const selected=ref<IqcModelProfile>();
const testingId=ref<string>();
const pricingEnabled=ref(false),pricingCurrency=ref('CNY'),inputPrice=ref(''),outputPrice=ref('');
function loadPricing(source?:string|null){pricingEnabled.value=!!source;pricingCurrency.value='CNY';inputPrice.value='';outputPrice.value='';
  if(source)try{const value=JSON.parse(source);pricingCurrency.value=value.currency;inputPrice.value=value.inputPerMillion;outputPrice.value=value.outputPerMillion;}
  catch{message.warning('价格配置无法解析，请重新填写价格');}}

const providers=ref<DictionaryItem[]>([{value:"SPRING_AI",label:"Spring AI / OpenAI 兼容"},{value:"OPENAI",label:"OpenAI"},{value:"DASHSCOPE",label:"阿里云百炼"},{value:"OLLAMA",label:"Ollama 本地模型"}]);
const emptyForm=():IqcModelProfileRequest=>({name:"",code:"",description:"",provider:"SPRING_AI",modelName:"",endpoint:"",secretRef:"",temperature:0.1,timeoutSeconds:60,maxRetries:0,maxOutputTokens:0,contextWindowTokens:0,deploymentRef:"",outputTokenParameter:"MAX_TOKENS",pricingJson:""}); const form=ref(emptyForm()); const {can}=usePermission();
async function refresh(){loading.value=true;try{profiles.value=await listModelProfiles();}catch{message.error("模型配置加载失败");}finally{loading.value=false;}}
async function loadDictionaries(){try{const data=await getCachedDictionaries(["iqc_model_provider"]);if(data.iqc_model_provider?.length)providers.value=data.iqc_model_provider;}catch{/* 使用本地兜底。 */}}
function createNew(){loadPricing();selected.value=undefined;form.value=emptyForm();modalOpen.value=true;}
function edit(item:IqcModelProfile){loadPricing(item.pricingJson);selected.value=item;form.value={name:item.name,code:item.code,description:item.description||"",provider:item.provider,modelName:item.modelName,endpoint:item.endpoint||"",secretRef:"",temperature:item.temperature,timeoutSeconds:item.timeoutSeconds,maxRetries:item.maxRetries,maxOutputTokens:item.maxOutputTokens??0,contextWindowTokens:item.contextWindowTokens??0,deploymentRef:item.deploymentRef??"",outputTokenParameter:item.outputTokenParameter??"MAX_TOKENS",pricingJson:item.pricingJson??""};modalOpen.value=true;}
async function save(){
  if(!form.value.name||!form.value.code||!form.value.modelName){message.warning("请填写名称、编码和模型名称");return;}
  if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(form.value.code)){message.warning("编码必须以大写字母开头，仅支持大写字母、数字和下划线");return;}
  if(!selected.value&&form.value.provider!=="OLLAMA"&&!form.value.secretRef){message.warning("非本地模型必须填写 API Key");return;}
  const outputLimit=form.value.maxOutputTokens;
  if(typeof outputLimit!=='number'||!Number.isInteger(outputLimit)||outputLimit<0||outputLimit>1000000){message.warning('输出Token上限需为0到1000000的整数');return;}
  const window=form.value.contextWindowTokens;
  if(typeof window!=='number'||!Number.isInteger(window)||window<0||window>100000000){message.warning('上下文窗口需为0到100000000的整数');return;}
  if(window>0&&outputLimit>window){message.warning('输出上限不能超过上下文窗口');return;}
  if(form.value.deploymentRef&&!/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,127}$/.test(form.value.deploymentRef)){message.warning('部署参考标识格式无效');return;}
  if(pricingEnabled.value){
    if(!/^[A-Z]{3}$/.test(pricingCurrency.value)||![inputPrice.value,outputPrice.value].every(value=>/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,12})?$/.test(value))){message.warning('请填写有效币种及精确非负单价，最多12位小数');return;}
    form.value.pricingJson=JSON.stringify({schemaVersion:'iqc-model-flat-pricing-v1',currency:pricingCurrency.value,inputPerMillion:inputPrice.value,outputPerMillion:outputPrice.value});
  }else form.value.pricingJson='';
  saving.value=true;
  try{
    if(selected.value)await updateModelProfile(selected.value.id,form.value);else await createModelProfile(form.value);
    modalOpen.value=false;await refresh();message.success(selected.value?"模型配置已更新":"模型配置已创建");
  }catch(error:unknown){
    const responseMessage=(error as {response?:{data?:{msg?:string;mesg?:string}}}).response?.data;
    message.error(responseMessage?.msg||responseMessage?.mesg||(error instanceof Error?error.message:"保存失败，请检查模型参数和密钥引用"));
  }finally{saving.value=false;}
}
function changeStatus(item:IqcModelProfile){const enabling=item.status==="DISABLED";Modal.confirm({title:`${enabling?"启用":"停用"}模型配置`,content:enabling?"启用后可被 Agent 选择。":"停用后不能被新 Agent 版本选择，历史版本不受影响。",async onOk(){if(enabling)await enableModelProfile(item.id);else await disableModelProfile(item.id);await refresh();}});}
async function testConnection(item:IqcModelProfile){testingId.value=item.id;try{const result=await testModelProfile(item.id);if(result.success)message.success(`连接成功，耗时 ${result.latencyMillis} ms`);else message.error(result.message);}catch{message.error("模型连接测试失败");}finally{testingId.value=undefined;}}
onMounted(()=>{void Promise.all([refresh(),loadDictionaries()]);});
</script>

<template>
  <section class="page-intro"><div><span class="section-kicker">AGENT ASSETS</span><h2>模型配置</h2><p>统一管理模型供应商、模型参数和 API Key，为 Agent 提供主备模型选择。</p></div><a-button v-if="can('iqc:model:manage')" type="primary" @click="createNew">创建模型配置</a-button></section>
  <a-card :bordered="false"><a-table :data-source="profiles" :loading="loading" row-key="id" :scroll="{x:1050}"><a-table-column title="名称" data-index="name" :width="160"/><a-table-column title="编码" data-index="code" :width="150"/><a-table-column title="供应商" data-index="provider" :width="140"/><a-table-column title="模型" data-index="modelName"/><a-table-column title="温度" data-index="temperature" :width="75"/><a-table-column title="版本" data-index="versionNo" :width="70"/><a-table-column title="状态" :width="80"><template #default="{record}"><a-tag :color="record.status==='ENABLED'?'green':'default'">{{record.status==='ENABLED'?'启用':'停用'}}</a-tag></template></a-table-column><a-table-column title="操作" :width="230" fixed="right"><template #default="{record}"><a-button v-if="can('iqc:model:budget:view')&&record.status==='ENABLED'" type="link" @click="modelCalls?.inspectModelBudget(record.id)">预算</a-button><a-button type="link" @click="edit(record)">查看/编辑</a-button><a-button v-if="can('iqc:model:test')" type="link" :loading="testingId===record.id" @click="testConnection(record)">测试连接</a-button><a-button v-if="can('iqc:model:manage')" type="link" :danger="record.status==='ENABLED'" @click="changeStatus(record)">{{record.status==='ENABLED'?'停用':'启用'}}</a-button></template></a-table-column></a-table></a-card>
  <a-modal v-model:open="modalOpen" :title="selected?`编辑模型：${selected.name}`:'创建模型配置'" width="min(720px, calc(100vw - 32px))" :styles="{body:{maxHeight:'calc(100vh - 190px)',overflowY:'auto'}}" :confirm-loading="saving" :ok-button-props="{disabled:!can('iqc:model:manage')}" @ok="save"><a-alert message="请填写模型平台 API Key；服务端会加密保存，列表不会显示原文。" type="info" show-icon style="margin-bottom:16px"/><a-form layout="vertical">
    <a-row :gutter="16"><a-col :span="12"><a-form-item label="名称" required><a-input v-model:value="form.name"/></a-form-item></a-col><a-col :span="12"><a-form-item label="编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected)" placeholder="例如 PRIMARY_QWEN"/></a-form-item></a-col></a-row><a-form-item label="说明"><a-input v-model:value="form.description"/></a-form-item>
    <a-row :gutter="16"><a-col :span="12"><a-form-item label="供应商" required><a-select v-model:value="form.provider"><a-select-option v-for="item in providers" :key="item.value" :value="item.value">{{item.label}}</a-select-option></a-select></a-form-item></a-col><a-col :span="12"><a-form-item label="模型名称" required><a-input v-model:value="form.modelName" placeholder="例如 qwen-plus"/></a-form-item></a-col></a-row>
    <a-form-item label="Endpoint"><a-input v-model:value="form.endpoint" placeholder="例如 https://api.deepseek.com"/><template #extra>填写模型服务的基础地址，系统会自动拼接 /chat/completions；不要填写完整接口路径。DeepSeek：<code>https://api.deepseek.com</code>；OpenAI：<code>https://api.openai.com/v1</code>。</template></a-form-item><a-form-item label="API Key"><a-input v-model:value="form.secretRef" type="password" placeholder="请输入模型服务商 API Key"/><template #extra>API Key 会加密保存，列表不会显示明文；编辑时留空表示保持原值。</template></a-form-item>
    <a-row :gutter="16"><a-col :span="8"><a-form-item label="温度"><a-input-number v-model:value="form.temperature" :min="0" :max="2" :step="0.1" style="width:100%"/></a-form-item></a-col><a-col :span="8"><a-form-item label="超时秒数"><a-input-number v-model:value="form.timeoutSeconds" :min="1" :max="600" style="width:100%"/></a-form-item></a-col><a-col :span="8"><a-form-item label="重试次数"><a-input-number v-model:value="form.maxRetries" :min="0" :max="5" style="width:100%"/></a-form-item></a-col></a-row>
  <a-row :gutter="16"><a-col :span="12"><a-form-item label="单次请求输出 Token 上限（0为不设置）"><a-input-number v-model:value="form.maxOutputTokens" :min="0" :max="1000000" :precision="0" style="width:100%"/></a-form-item></a-col><a-col :span="12"><a-form-item label="供应商输出参数"><a-select v-model:value="form.outputTokenParameter" :options="[{value:'MAX_TOKENS',label:'max_tokens（常规兼容模型）'},{value:'MAX_COMPLETION_TOKENS',label:'max_completion_tokens（含推理用量）'}]"/></a-form-item></a-col></a-row>
  <p>请按模型供应商支持的参数选择；上限随发布版本保存。这里只限制请求输出，累计 Token 或成本预算请在已保存模型的“预算”入口配置。</p>
  <a-row :gutter="16"><a-col :span="12"><a-form-item label="声明上下文窗口 Token（0为未知）"><a-input-number v-model:value="form.contextWindowTokens" :min="0" :max="100000000" :precision="0" style="width:100%"/></a-form-item></a-col><a-col :span="12"><a-form-item label="部署参考标识"><a-input v-model:value="form.deploymentRef" :maxlength="128" placeholder="模型部署版本或发布记录编号"/></a-form-item></a-col></a-row>
  <p>请按供应商确认的总上下文窗口和部署记录填写；声明随发布保存，不代表系统已核验远端版本。</p>
  <a-form-item label="配置价格"><a-switch v-model:checked="pricingEnabled"/><template #extra>关闭将清除当前价格；已发布版本保留原价格。</template></a-form-item>
  <a-row v-if="pricingEnabled" :gutter="16"><a-col :span="8"><a-form-item label="币种"><a-input v-model:value="pricingCurrency" :maxlength="3" placeholder="CNY / USD"/></a-form-item></a-col><a-col :span="8"><a-form-item label="输入单价 / 百万 Token"><a-input v-model:value="inputPrice" placeholder="精确十进制单价"/></a-form-item></a-col><a-col :span="8"><a-form-item label="输出单价 / 百万 Token"><a-input v-model:value="outputPrice" placeholder="精确十进制单价"/></a-form-item></a-col></a-row>
  <p v-if="pricingEnabled">请填写供应商确认的统一输入和输出单价。若包含缓存折扣等差异计费，暂不使用此统一价格计算实际费用。价格会随发布版本保存；成本预算需单独核定配置。</p>
  </a-form></a-modal>
  <ModelGatewayCalls ref="modelCalls"/>
</template>
