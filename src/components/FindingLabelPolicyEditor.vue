<template>
  <section>
    <h3>标签与 Finding 绑定</h3>
    <p>选择当前已发布标签及值定义，并指定来源 Finding。保存时再次核对版本，标签目录随流水线版本冻结。</p>
    <a-button v-if="canChoose" :disabled="disabled || (modelValue?.bindings.length || 0) >= 100" @click="openPicker">添加已发布标签</a-button>
    <a-card v-for="(binding,index) in modelValue?.bindings || []" :key="`${binding.labelId}:${binding.valueCode}`" size="small" style="margin:8px 0">
      <strong>{{ labelName(binding.labelId) }}</strong> · 标签版本 {{ binding.labelVersion }} · 值 {{ binding.valueCode }}
      <a-form-item label="来源 Finding" style="margin-top:8px">
        <a-select :value="binding.findingCode || undefined" :options="findingOptions(binding.findingCode)" :disabled="disabled" show-search option-filter-prop="label" style="min-width:240px" @change="(value:string)=>changeFinding(index,value)" />
      </a-form-item>
      <a-space>
        <a-button :disabled="disabled || !binding.findingCode" @click="emit('action',binding)">添加该值的打标动作</a-button>
        <a-button danger :disabled="disabled" @click="remove(index)">移除绑定</a-button>
      </a-space>
    </a-card>
    <p v-if="!modelValue?.bindings.length">尚未配置标签绑定。</p>
    <a-modal :open="picker" title="添加已发布标签" :confirm-loading="busy" :ok-button-props="{disabled:disabled || !canChoose || loading || !selected.length}" @ok="addSelected" @cancel="closePicker">
      <p>请只选择具体标签。将添加其值定义，每个值需明确选择来源 Finding；只声明绑定不会自动执行打标动作。</p>
      <a-spin :spinning="loading"><LabelTreeSelector v-if="taxonomy" v-model="selected" :taxonomy="taxonomy" :disabled="disabled || busy" /></a-spin>
      <a-button :disabled="busy || disabled" @click="loadTree">刷新目录</a-button>
      <a-alert v-if="pickerError" type="error" :message="pickerError" show-icon style="margin:8px 0" />
    </a-modal>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { getLabelTree, getLabelDetail, type LabelTree } from '@/api/labels';
import type { FindingLabelPolicy } from '@/api/pipelines';
import { usePermission } from '@/composables/permission';
import LabelTreeSelector from './LabelTreeSelector.vue';
const props = defineProps<{ modelValue?:FindingLabelPolicy|null; findingCodes:string[]; disabled?:boolean }>();
type Binding = FindingLabelPolicy['bindings'][number];
const emit = defineEmits<{ 'update:modelValue':[value:FindingLabelPolicy|undefined]; action:[binding:Binding] }>();
const { can } = usePermission();
const canChoose=computed(()=>can('iqc:label:view')&&can('iqc:label:detail:view'));
const picker=ref(false),loading=ref(false),busy=ref(false),pickerError=ref('');
const selected=ref<string[]>([]),taxonomy=ref<LabelTree>(),names=ref<Record<string,string>>({});
let generation=0,disposed=false;
function labelName(id:string) {
  const directory=props.modelValue?.directory;
  const labels=directory && Array.isArray(directory.labels) ? directory.labels : [];
  const frozen=labels.find(value=>value && typeof value==='object' && value.id===id);
  return names.value[id] || (frozen && typeof frozen.name==='string' ? frozen.name : id);
}
function findingOptions(current:string) {
  const values=[...new Set(props.findingCodes)];
  const options=values.map(value=>({value,label:value}));
  if(current && !values.includes(current))options.unshift({value:current,label:`${current}（未加载）`});
  return options;
}
function update(bindings:Binding[]) {
  if(disposed||props.disabled)return;
  emit('update:modelValue',bindings.length?{schemaVersion:'iqc-finding-label-policy-v1',bindings}:undefined);
}
function changeFinding(index:number,value:string) {if(props.modelValue?.bindings[index]?.findingCode===value)return;update((props.modelValue?.bindings || []).map((binding,i)=>i===index?{...binding,findingCode:value}:{...binding}));}
function remove(index:number) {update((props.modelValue?.bindings || []).filter((_,i)=>i!==index).map(binding=>({...binding})));}
function closePicker(){++generation;picker.value=false;loading.value=false;busy.value=false;selected.value=[];taxonomy.value=undefined;pickerError.value="";}
async function loadTree() {
  if(disposed||props.disabled || busy.value || !can('iqc:label:view'))return;
  const ticket=++generation;loading.value=true;pickerError.value='';taxonomy.value=undefined;
  try {const tree=await getLabelTree();if(!disposed&&ticket===generation&&!props.disabled&&can('iqc:label:view'))taxonomy.value=tree;}
  catch {if(!disposed&&ticket===generation&&!props.disabled&&can('iqc:label:view'))pickerError.value='标签目录加载失败，请检查查询权限后刷新。';}
  finally {if(!disposed&&ticket===generation&&!props.disabled&&can('iqc:label:view'))loading.value=false;}
}
function openPicker(){if(disposed||props.disabled||!canChoose.value)return;selected.value=[];pickerError.value='';picker.value=true;void loadTree();}
async function addSelected() {
  if(disposed||props.disabled||!canChoose.value||!picker.value || busy.value || loading.value || !taxonomy.value || !selected.value.length)return;
  const ids=selected.value.filter(key=>key.startsWith('LABEL:')).map(key=>key.slice(6));
  if(ids.length!==selected.value.length || new Set(ids).size!==ids.length || ids.length>100){pickerError.value='请选择 1 到 100 个具体标签，不能选择分类或群组。';return;}
  const tree=taxonomy.value,ticket=++generation;busy.value=true;pickerError.value='';
  try {
    const details=await Promise.all(ids.map(id=>getLabelDetail(id)));
    if(disposed||ticket!==generation || props.disabled||!canChoose.value||!picker.value)return;
    const bindings=(props.modelValue?.bindings || []).map(binding=>({...binding}));
    const additions:Binding[]=[],nextNames={...names.value};
    const keys=new Set(bindings.map(binding=>JSON.stringify([binding.labelId,binding.valueCode])));
    for(const [index,detail] of details.entries()) {
      if(detail.label.id!==ids[index])throw Error('标签详情与所选标签不一致，请刷新目录。');
      const published=tree.labels.find(label=>label.id===detail.label.id);
      if(!published || published.status!=='PUBLISHED' || detail.label.status!=='PUBLISHED' || detail.label.versionNo!==published.versionNo
        || !Array.isArray(detail.values) || !detail.values.length)throw Error('标签版本或发布状态已变化，请刷新后重新选择。');
      if(bindings.some(binding=>binding.labelId===detail.label.id && binding.labelVersion!==detail.label.versionNo))throw Error('已有其他版本的标签绑定，请先明确移除旧绑定。');
      nextNames[detail.label.id]=detail.label.name;
      for(const value of detail.values) {
        if(!value.valueCode)throw Error('标签值编码为空，请检查标签目录。');
        if(bindings.some(binding=>binding.labelId===detail.label.id && binding.valueCode===value.valueCode))continue;
        const key=JSON.stringify([detail.label.id,value.valueCode]);
        if(keys.has(key))throw Error('标签值定义重复，请检查标签目录。');
        keys.add(key);
        additions.push({labelId:detail.label.id,labelVersion:detail.label.versionNo,valueCode:value.valueCode,findingCode:''});
      }
    }
    if(bindings.length+additions.length>100)throw Error('绑定超过 100 项，请减少所选标签。');
    names.value=nextNames;
    if(additions.length)update([...bindings,...additions]);
    closePicker();
  } catch(failure){if(!disposed&&ticket===generation&&!props.disabled&&can('iqc:label:view'))pickerError.value=failure instanceof Error && failure.name!=='AxiosError'?failure.message:'标签详情加载失败，请检查查询权限后重试。';}
  finally {if(!disposed&&ticket===generation&&!props.disabled&&can('iqc:label:view'))busy.value=false;}
}
watch(()=>props.modelValue?.directory,directory=>{
  if(!directory || !Array.isArray(directory.labels))return;
  const frozenNames={...names.value};
  for(const label of directory.labels)if(label && typeof label==='object' && typeof label.id==='string' && typeof label.name==='string')frozenNames[label.id]=label.name;
  names.value=frozenNames;
},{immediate:true});
watch(()=>JSON.stringify([props.disabled,can('iqc:label:view'),can('iqc:label:detail:view')]),()=>{closePicker();names.value={};},{flush:'sync'});
onBeforeUnmount(()=>{disposed=true;closePicker();names.value={};});
</script>
