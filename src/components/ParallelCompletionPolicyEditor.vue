<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {ParallelCompletionPolicy,PipelineNode} from '@/api/pipelines';
import {completionOperators,completionValue,validateParallelCompletionPolicy} from './parallel-completion-policy';
const props=defineProps<{modelValue:ParallelCompletionPolicy;nodes:PipelineNode[];disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:ParallelCompletionPolicy]}>();
const valueText=ref('null'),valueError=ref('');
watch(()=>props.modelValue.condition?.value,value=>{valueText.value=JSON.stringify(value??null);valueError.value='';},{immediate:true});
const options=computed(()=>props.nodes.filter(node=>node.enabled).map(node=>({value:node.nodeId,label:`${node.name} (${node.nodeId})`})));
const policyError=computed(()=>{try{validateParallelCompletionPolicy(props.modelValue,props.nodes);return '';}catch(error){return error instanceof Error?error.message:'提前满足策略无效';}});
function update(value:ParallelCompletionPolicy){if(!props.disabled)emit('update:modelValue',value);}
function requiredNodes(value:string[]){update({...props.modelValue,requiredNodes:[...value]});}
function toggleCondition(enabled:boolean){if(props.disabled)return;valueError.value='';update({...props.modelValue,condition:enabled?{pointer:'/input/messages',operator:'EXISTS',value:null}:null});}
function condition(patch:Partial<NonNullable<ParallelCompletionPolicy['condition']>>){if(props.disabled)return;if(patch.operator==='EXISTS')valueError.value='';if(props.modelValue.condition)update({...props.modelValue,condition:{...props.modelValue.condition,...patch}});}
function compareValue(raw:string){
  if(props.disabled)return;
  valueText.value=raw;
  try{const value=completionValue(raw);valueError.value='';condition({value});}
  catch(error){valueError.value=error instanceof Error?error.message:'比较值须为合法JSON';}
}
function validated(){if(props.modelValue.condition && props.modelValue.condition.operator!=='EXISTS' && valueError.value)throw Error(valueError.value);return validateParallelCompletionPolicy(props.modelValue,props.nodes);}
defineExpose({validated});
</script>
<template>
  <a-card title="并行提前满足策略" size="small">
    <p>所有必需节点成功，且可选条件明确满足后进入融合。其余节点可能被取消或不执行，缺失事实保持未评估；评分仍可能待确认。</p>
    <a-alert v-if="valueError || policyError" type="error" show-icon :message="valueError || policyError"/>
    <a-form layout="vertical">
      <a-form-item label="必需成功节点"><a-select mode="multiple" :value="modelValue.requiredNodes" :options="options" :disabled="disabled" @update:value="requiredNodes"/></a-form-item>
      <a-form-item label="附加结果条件"><a-switch :checked="!!modelValue.condition" :disabled="disabled" @change="toggleCondition(Boolean($event))"/></a-form-item>
      <template v-if="modelValue.condition">
        <a-form-item label="条件路径"><a-input :value="modelValue.condition.pointer" :disabled="disabled" placeholder="/variables/risk_value" @update:value="condition({pointer:$event})"/><p>可读取 /input，或必需节点已声明的 /variables/变量名、/upstream/节点编码/字段。</p></a-form-item>
        <a-form-item label="比较"><a-select :value="modelValue.condition.operator" :disabled="disabled" :options="completionOperators.map(value=>({value,label:value}))" @update:value="condition({operator:$event})"/></a-form-item>
        <a-form-item v-if="modelValue.condition.operator!=='EXISTS'" label="比较值（JSON）"><a-input :value="valueText" :disabled="disabled" placeholder="true" @update:value="compareValue"/></a-form-item>
      </template>
    </a-form>
  </a-card>
</template>
