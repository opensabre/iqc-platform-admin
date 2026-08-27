<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Modal, message } from "ant-design-vue";
import { createModelProfile, disableModelProfile, enableModelProfile, listModelProfiles, testModelProfile, updateModelProfile, type IqcModelProfile, type IqcModelProfileRequest } from "@/api/config";
import { getCachedDictionaries, type DictionaryItem } from "@/api/dictionaries";
import { usePermission } from "@/composables/permission";

const profiles=ref<IqcModelProfile[]>([]); const loading=ref(false); const saving=ref(false); const modalOpen=ref(false); const selected=ref<IqcModelProfile>();
const testingId=ref<string>();
const providers=ref<DictionaryItem[]>([{value:"SPRING_AI",label:"Spring AI / OpenAI 兼容"},{value:"OPENAI",label:"OpenAI"},{value:"DASHSCOPE",label:"阿里云百炼"},{value:"OLLAMA",label:"Ollama 本地模型"}]);
const emptyForm=():IqcModelProfileRequest=>({name:"",code:"",description:"",provider:"SPRING_AI",modelName:"",endpoint:"",secretRef:"",temperature:0.1,timeoutSeconds:60,maxRetries:0}); const form=ref(emptyForm()); const {can}=usePermission();
async function refresh(){loading.value=true;try{profiles.value=await listModelProfiles();}catch{message.error("模型配置加载失败");}finally{loading.value=false;}}
async function loadDictionaries(){try{const data=await getCachedDictionaries(["iqc_model_provider"]);if(data.iqc_model_provider?.length)providers.value=data.iqc_model_provider;}catch{/* 使用本地兜底。 */}}
function createNew(){selected.value=undefined;form.value=emptyForm();modalOpen.value=true;}
function edit(item:IqcModelProfile){selected.value=item;form.value={name:item.name,code:item.code,description:item.description||"",provider:item.provider,modelName:item.modelName,endpoint:item.endpoint||"",secretRef:"",temperature:item.temperature,timeoutSeconds:item.timeoutSeconds,maxRetries:item.maxRetries};modalOpen.value=true;}
async function save(){
  if(!form.value.name||!form.value.code||!form.value.modelName){message.warning("请填写名称、编码和模型名称");return;}
  if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(form.value.code)){message.warning("编码必须以大写字母开头，仅支持大写字母、数字和下划线");return;}
  if(!selected.value&&form.value.provider!=="OLLAMA"&&!form.value.secretRef){message.warning("非本地模型必须填写 API Key");return;}
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
  <a-card :bordered="false"><a-table :data-source="profiles" :loading="loading" row-key="id" :scroll="{x:1050}"><a-table-column title="名称" data-index="name" :width="160"/><a-table-column title="编码" data-index="code" :width="150"/><a-table-column title="供应商" data-index="provider" :width="140"/><a-table-column title="模型" data-index="modelName"/><a-table-column title="温度" data-index="temperature" :width="75"/><a-table-column title="版本" data-index="versionNo" :width="70"/><a-table-column title="状态" :width="80"><template #default="{record}"><a-tag :color="record.status==='ENABLED'?'green':'default'">{{record.status==='ENABLED'?'启用':'停用'}}</a-tag></template></a-table-column><a-table-column title="操作" :width="230" fixed="right"><template #default="{record}"><a-button type="link" @click="edit(record)">查看/编辑</a-button><a-button v-if="can('iqc:model:test')" type="link" :loading="testingId===record.id" @click="testConnection(record)">测试连接</a-button><a-button v-if="can('iqc:model:manage')" type="link" :danger="record.status==='ENABLED'" @click="changeStatus(record)">{{record.status==='ENABLED'?'停用':'启用'}}</a-button></template></a-table-column></a-table></a-card>
  <a-modal v-model:open="modalOpen" :title="selected?`编辑模型：${selected.name}`:'创建模型配置'" width="min(720px, calc(100vw - 32px))" :styles="{body:{maxHeight:'calc(100vh - 190px)',overflowY:'auto'}}" :confirm-loading="saving" :ok-button-props="{disabled:!can('iqc:model:manage')}" @ok="save"><a-alert message="请填写模型平台 API Key；服务端会加密保存，列表不会显示原文。" type="info" show-icon style="margin-bottom:16px"/><a-form layout="vertical">
    <a-row :gutter="16"><a-col :span="12"><a-form-item label="名称" required><a-input v-model:value="form.name"/></a-form-item></a-col><a-col :span="12"><a-form-item label="编码" required><a-input v-model:value="form.code" :disabled="Boolean(selected)" placeholder="例如 PRIMARY_QWEN"/></a-form-item></a-col></a-row><a-form-item label="说明"><a-input v-model:value="form.description"/></a-form-item>
    <a-row :gutter="16"><a-col :span="12"><a-form-item label="供应商" required><a-select v-model:value="form.provider"><a-select-option v-for="item in providers" :key="item.value" :value="item.value">{{item.label}}</a-select-option></a-select></a-form-item></a-col><a-col :span="12"><a-form-item label="模型名称" required><a-input v-model:value="form.modelName" placeholder="例如 qwen-plus"/></a-form-item></a-col></a-row>
    <a-form-item label="Endpoint"><a-input v-model:value="form.endpoint" placeholder="例如 https://api.deepseek.com"/><template #extra>填写模型服务的基础地址，系统会自动拼接 /chat/completions；不要填写完整接口路径。DeepSeek：<code>https://api.deepseek.com</code>；OpenAI：<code>https://api.openai.com/v1</code>。</template></a-form-item><a-form-item label="API Key"><a-input v-model:value="form.secretRef" type="password" placeholder="请输入模型服务商 API Key"/><template #extra>API Key 会加密保存，列表不会显示明文；编辑时留空表示保持原值。</template></a-form-item>
    <a-row :gutter="16"><a-col :span="8"><a-form-item label="温度"><a-input-number v-model:value="form.temperature" :min="0" :max="2" :step="0.1" style="width:100%"/></a-form-item></a-col><a-col :span="8"><a-form-item label="超时秒数"><a-input-number v-model:value="form.timeoutSeconds" :min="1" :max="600" style="width:100%"/></a-form-item></a-col><a-col :span="8"><a-form-item label="重试次数"><a-input-number v-model:value="form.maxRetries" :min="0" :max="5" style="width:100%"/></a-form-item></a-col></a-row>
  </a-form></a-modal>
</template>
