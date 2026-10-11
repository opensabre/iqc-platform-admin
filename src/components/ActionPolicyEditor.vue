<template>
  <section>
    <h3>动作策略</h3>
    <p>动作使用冻结的生产结果；条件缺少事实时保留未知状态，取反不会把未知当成确定。每份结果的重复执行沿原来源幂等键核对。</p>
    <a-space><a-select v-model:value="newType" :options="actionOptions" :disabled="disabled" style="min-width:220px"/><a-button :disabled="disabled || (modelValue?.actions.length || 0)>=100" @click="add">添加动作</a-button></a-space>
    <a-card v-for="(action,index) in modelValue?.actions || []" :key="index" size="small" style="margin:12px 0">
      <strong>{{ actionName(action) }}</strong> · 版本 {{ action.adapterVersion ?? 1 }}
      <template v-if="editableAction(action)">
        <a-form layout="vertical">
          <a-form-item label="动作编码"><a-input :value="action.actionId" :disabled="disabled" @update:value="(value:string)=>patch(index,{actionId:value})"/></a-form-item>
          <a-form-item label="触发条件"><ActionConditionEditor :model-value="action.condition" :finding-codes="findingCodes" :item-codes="itemCodes" :node-count="conditionCount(action.condition)" :disabled="disabled" @update:model-value="condition=>patch(index,{condition})"/></a-form-item>
          <a-form-item v-if="action.type==='UPDATE_LABEL'" label="冻结标签值目标"><a-select :value="target(action)" :options="targets(action)" :disabled="disabled" style="min-width:260px" @change="(value:string)=>setTarget(index,value)"/></a-form-item>
          <template v-if="action.type==='CREATE_RISK_EVENT'">
            <p>风险等级和证据取实际生产结果；未知或无风险不创建确定风险事件。创建事件不表示风险已处置。</p>
            <a-form-item label="风险类别编码"><a-input :value="text(action,'category')" :disabled="disabled" :maxlength="64" @update:value="(value:string)=>config(index,{category:value})"/></a-form-item>
            <a-form-item label="风险标题"><a-input :value="text(action,'title')" :disabled="disabled" :maxlength="128" @update:value="(value:string)=>config(index,{title:value})"/></a-form-item>
            <a-form-item label="风险描述"><a-textarea :value="text(action,'description')" :disabled="disabled" :maxlength="1000" @update:value="(value:string)=>config(index,{description:value})"/></a-form-item>
          </template>
          <template v-if="action.type==='CREATE_REVIEW'">
            <a-form-item label="复核原因"><a-textarea :value="text(action,'reason')" :disabled="disabled" :maxlength="1000" @update:value="(value:string)=>config(index,{reason:value})"/></a-form-item>
            <a-form-item label="预期已有复核轮次"><a-input-number :value="number(action,'expectedRevision',0)" :disabled="disabled" :min="0" :max="2147483646" :precision="0" @change="(value:unknown)=>config(index,{expectedRevision:value})"/></a-form-item>
          </template>
          <template v-if="action.type==='ADD_TO_EVALUATION_CANDIDATE'">
            <p>指定业务复核轮次完成后创建候选；候选仍需原标注和独立审核才能进入金标集。</p>
            <a-form-item label="样本类型"><a-select :value="text(action,'sampleType')" :options="sampleOptions" :disabled="disabled" @change="(value:string)=>config(index,{sampleType:value})"/></a-form-item>
            <a-form-item label="来源业务复核轮次"><a-input-number :value="number(action,'reviewRevision',1)" :disabled="disabled" :min="1" :max="2147483647" :precision="0" @change="(value:unknown)=>config(index,{reviewRevision:value})"/></a-form-item>
            <a-form-item label="候选名称（可选）"><a-input :value="text(action,'name')" :disabled="disabled" :maxlength="128" @update:value="(value:string)=>optional(index,'name',value)"/></a-form-item>
            <a-form-item label="样本标签（可选）"><a-select :value="tags(action)" mode="tags" :disabled="disabled" @change="(value:string[])=>config(index,{tags:value})"/></a-form-item>
          </template>
          <AutomaticRetryPolicyEditor :model-value="action.retry" :disabled="disabled" @update:model-value="retry=>patch(index,{retry})"/>
          <p>失败政策：仅记录。提交结果未确认时保留未知状态，需要人工核对，不自动重发。</p>
        </a-form>
      </template>
      <p v-else>此类型、版本或失败政策的原配置保持只读：{{ action.actionId }}。最多尝试 {{ action.retry?.maximumAttempts ?? 1 }} 次。</p>
      <a-button danger :disabled="disabled" @click="remove(index)">移除动作</a-button>
    </a-card>
    <p v-if="!modelValue?.actions.length">未配置动作。</p>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import type {ActionPolicy,FindingLabelPolicy} from '@/api/pipelines';
import {always,conditionCount,editableAction,supportedActionNames,type PolicyAction} from '@/api/action-policy-editor';
import ActionConditionEditor from './ActionConditionEditor.vue';
import AutomaticRetryPolicyEditor from './AutomaticRetryPolicyEditor.vue';
const props=defineProps<{modelValue?:ActionPolicy|null;labels?:FindingLabelPolicy|null;findingCodes:string[];itemCodes:string[];disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:ActionPolicy]}>();
const newType=ref<keyof typeof supportedActionNames>('SAVE_RESULT');
const actionOptions=Object.entries(supportedActionNames).map(([value,label])=>({value,label}));
const sampleOptions=[{value:'POSITIVE',label:'正样本'},{value:'NEGATIVE',label:'负样本'},{value:'FALSE_POSITIVE',label:'误报'},{value:'FALSE_NEGATIVE',label:'漏报'}];
function actionName(action:PolicyAction){return Object.hasOwn(supportedActionNames,action.type)?supportedActionNames[action.type as keyof typeof supportedActionNames]:action.type;}
function update(actions:PolicyAction[]){if(!props.disabled)emit('update:modelValue',{schemaVersion:'iqc-action-policy-v1',actions});}
function patch(index:number,value:Partial<PolicyAction>){if(props.disabled)return;update((props.modelValue?.actions||[]).map((action,i)=>i===index?{...action,...value}:action));}
function config(index:number,value:Record<string,unknown>){const action=props.modelValue?.actions[index];if(action)patch(index,{configuration:{...action.configuration,...value}});}
function optional(index:number,key:string,value:string){const action=props.modelValue?.actions[index];if(!action)return;const configuration={...action.configuration};if(value.trim())configuration[key]=value;else delete configuration[key];patch(index,{configuration});}
function text(action:PolicyAction,key:string){return typeof action.configuration[key]==='string'?String(action.configuration[key]):'';}
function number(action:PolicyAction,key:string,fallback:number){return action.configuration[key]===undefined?fallback:typeof action.configuration[key]==='number'?action.configuration[key] as number:undefined;}
function tags(action:PolicyAction){return Array.isArray(action.configuration.tags)?action.configuration.tags.filter((value):value is string=>typeof value==='string'):[];}
function target(action:PolicyAction){return typeof action.configuration.labelId==='string' && typeof action.configuration.valueCode==='string'?JSON.stringify([action.configuration.labelId,action.configuration.valueCode]):undefined;}
function targets(action:PolicyAction){const values=(props.labels?.bindings || []).map(binding=>({value:JSON.stringify([binding.labelId,binding.valueCode]),label:`${binding.labelId} / ${binding.valueCode} · v${binding.labelVersion}`}));const selected=target(action);if(selected && !values.some(value=>value.value===selected))values.unshift({value:selected,label:'原目标（当前绑定中不存在）'});return values;}
function setTarget(index:number,value:string){const binding=(props.labels?.bindings||[]).find(item=>JSON.stringify([item.labelId,item.valueCode])===value);if(binding)patch(index,{configuration:{labelId:binding.labelId,valueCode:binding.valueCode}});}
function add(){
  if(props.disabled)return;const actions=props.modelValue?.actions || [];if(actions.length>=100)return;
  let id=1;while(actions.some(action=>action.actionId===`action_${id}`))id++;
  const configuration:Record<string,unknown>=newType.value==='CREATE_RISK_EVENT'?{category:'',title:'',description:''}:newType.value==='CREATE_REVIEW'?{reason:'',expectedRevision:0}:newType.value==='ADD_TO_EVALUATION_CANDIDATE'?{sampleType:'POSITIVE',reviewRevision:1}:{};
  update([...actions,{actionId:`action_${id}`,type:newType.value,adapterVersion:1,condition:newType.value==='CREATE_RISK_EVENT'?{kind:'RISK_AT_LEAST',code:null,value:'LOW',children:[]}:always(),idempotency:'PRODUCTION_SOURCE_V1',retry:null,failureHandling:'RECORD_ONLY',configuration}]);
}
function remove(index:number){update((props.modelValue?.actions||[]).filter((_,i)=>i!==index));}
</script>
