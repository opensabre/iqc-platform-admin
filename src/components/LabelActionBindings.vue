<script setup lang="ts">
import { ref, watch } from "vue";
import { message } from "ant-design-vue";
import { listLabelActions, getLabelActions, replaceLabelActions, createLabelAction, updateLabelAction, disableLabelAction, deleteLabelAction, type LabelActionDefinition, type LabelActionSnapshot } from "@/api/labels";
const props = defineProps<{labelId:string;editable:boolean}>();
const emit = defineEmits<{changed:[]}>();
const actions=ref<LabelActionDefinition[]>([]), snapshots=ref<LabelActionSnapshot[]>([]), selected=ref<string[]>([]);
const loading=ref(false), saving=ref(false), error=ref(""), catalogOpen=ref(false), page=ref(1);
const draft=ref({id:"",type:"RECORD_TAG",name:"",description:""});
let request=0;
async function load() {
  const version=++request; loading.value=true;error.value="";
  try {
    const [catalog,bound]=await Promise.all([listLabelActions(page.value,100),getLabelActions(props.labelId)]);
    if(version!==request)return;
    actions.value=catalog;snapshots.value=bound;selected.value=bound.map(action=>action.actionId);
  } catch { if(version===request)error.value="动作配置加载失败，请重试"; }
  finally { if(version===request)loading.value=false; }
}
async function saveBindings() {
  if(saving.value)return;saving.value=true;
  try { await replaceLabelActions(props.labelId,selected.value);message.success("动作绑定已保存，标签需重新发布");emit("changed");await load(); }
  catch { message.error("保存失败，请检查权限及动作是否有效"); }
  finally {saving.value=false;}
}
async function saveAction() {
  if(saving.value)return;
  if(!draft.value.name.trim()){message.error("请输入动作名称");return;}
  saving.value=true;
  try {
    const {id,...data}=draft.value;
    if(id)await updateLabelAction(id,data);else await createLabelAction(data);
    draft.value={id:"",type:"RECORD_TAG",name:"",description:""};await load();message.success("动作定义已保存");
  } catch {message.error("动作定义保存失败");} finally {saving.value=false;}
}
async function remove(action:LabelActionDefinition, disable:boolean) {
  if(saving.value)return;saving.value=true;
  try {if(disable)await disableLabelAction(action.id);else await deleteLabelAction(action.id);await load();}
  catch {message.error("操作失败：被引用的动作需先解除绑定");} finally {saving.value=false;}
}
function edit(action:LabelActionDefinition){draft.value={id:action.id,type:action.type,name:action.name,description:action.description||""};}
watch(()=>props.labelId,()=>{page.value=1;void load();},{immediate:true});
const typeName=(type:string)=>type==="RECORD_TAG"?"记录标签":"质检扣分";
</script>
<template>
  <section style="margin-top:16px">
    <h4>关联动作</h4>
    <a-alert type="info" show-icon message="当前仅保存动作定义与绑定；动作执行、正式标签判定和扣分策略待对接。" />
    <a-alert v-if="error" type="error" :message="error"><template #action><a-button @click="load">重试</a-button></template></a-alert>
    <a-spin :spinning="loading">
      <p v-if="!snapshots.length">未绑定动作</p>
      <a-tag v-for="action in snapshots" :key="action.bindingId">{{ action.name }} · {{ typeName(action.type) }} · V{{ action.versionNo }}</a-tag>
      <template v-if="editable && !error">
        <a-select v-model:value="selected" mode="multiple" style="width:100%;margin:12px 0" placeholder="选择动作，可清空解除绑定" :disabled="loading || saving" :options="[...actions.filter(a=>a.status==='ENABLED').map(a=>({value:a.id,label:`${a.name} · ${typeName(a.type)}`})),...snapshots.filter(s=>!actions.some(a=>a.id===s.actionId)).map(s=>({value:s.actionId,label:s.name}))]" />
        <a-space><a-button :loading="saving" :disabled="loading" @click="saveBindings">保存动作绑定</a-button><a-button @click="catalogOpen=true">管理动作定义</a-button></a-space>
      </template>
    </a-spin>
    <a-modal v-model:open="catalogOpen" title="动作定义" :footer="null" width="720px">
      <p>定义可被多个标签引用。被引用的动作不能停用或删除；修订后只影响后续快照。</p>
      <a-form layout="vertical">
        <a-form-item label="类型"><a-select v-model:value="draft.type" :disabled="!!draft.id" :options="[{value:'RECORD_TAG',label:'记录标签（定义）'},{value:'DEDUCT_SCORE',label:'质检扣分（定义）'}]" /></a-form-item>
        <a-form-item label="名称" required><a-input v-model:value="draft.name" :maxlength="100" /></a-form-item>
        <a-form-item label="描述"><a-textarea v-model:value="draft.description" :maxlength="500" /></a-form-item>
        <a-button type="primary" :loading="saving" @click="saveAction">{{ draft.id?'保存修订':'创建定义' }}</a-button>
        <a-button v-if="draft.id" @click="draft={id:'',type:'RECORD_TAG',name:'',description:''}">取消修订</a-button>
      </a-form>
      <a-list :data-source="actions" :loading="loading">
        <template #renderItem="{item}"><a-list-item><a-list-item-meta :title="`${item.name} · V${item.versionNo}`" :description="`${typeName(item.type)} · ${item.status}`" /><a-space><a-button size="small" @click="edit(item)">修订</a-button><a-popconfirm title="确认停用未引用动作？" @confirm="remove(item,true)"><a-button size="small" :disabled="saving || item.status==='DISABLED'">停用</a-button></a-popconfirm><a-popconfirm title="确认删除未引用动作？" @confirm="remove(item,false)"><a-button size="small" danger :disabled="saving">删除</a-button></a-popconfirm></a-space></a-list-item></template>
      </a-list>
      <a-space><a-button :disabled="page===1 || loading" @click="page--;load()">上一页</a-button><span>第 {{ page }} 页</span><a-button :disabled="actions.length<100 || loading" @click="page++;load()">下一页</a-button></a-space>
    </a-modal>
  </section>
</template>
