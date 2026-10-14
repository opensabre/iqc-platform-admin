<script setup lang="ts">
import {computed} from 'vue';
import type {ScoringPolicy,AdvancedScoringPolicy,FindingLabelPolicy} from '@/api/pipelines';
import {blankCondition,conditionCount} from '@/api/action-policy-editor';
import {labelBindingAddress} from '@/api/finding-label-policy';
import ActionConditionEditor from './ActionConditionEditor.vue';
const props=defineProps<{modelValue:ScoringPolicy;itemCodes:string[];findingCodes:string[];labels?:FindingLabelPolicy|null;disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[value:ScoringPolicy]}>();
const advanced=computed(()=>props.modelValue.advanced);
const options=(values:string[])=>values.map(value=>({value,label:value}));
function toggle(enabled:boolean){if(props.disabled)return;const policy={...props.modelValue,version:enabled?'iqc-score-v3':'iqc-score-v2'} as ScoringPolicy;if(enabled)policy.advanced={schemaVersion:'iqc-score-advanced-v1',lowerBound:'0',upperBound:'100',items:[],dimensions:[],grades:[]};else delete policy.advanced;emit('update:modelValue',policy);}
function update(patch:Partial<AdvancedScoringPolicy>){if(!props.disabled&&advanced.value)emit('update:modelValue',{...props.modelValue,advanced:{...advanced.value,...patch}});}
function item(index:number,patch:Partial<AdvancedScoringPolicy['items'][number]>){update({items:advanced.value!.items.map((value,i)=>i===index?{...value,...patch}:value)});}
function dimension(index:number,patch:Partial<AdvancedScoringPolicy['dimensions'][number]>){update({dimensions:advanced.value!.dimensions.map((value,i)=>i===index?{...value,...patch}:value)});}
function grade(index:number,patch:Partial<AdvancedScoringPolicy['grades'][number]>){update({grades:advanced.value!.grades.map((value,i)=>i===index?{...value,...patch}:value)});}
function addItem(){if(!advanced.value||advanced.value.items.length>=200)return;const code=props.itemCodes.find(code=>!advanced.value!.items.some(item=>item.itemCode===code));if(code)update({items:[...advanced.value.items,{itemCode:code,weight:'1',passAdjustment:'0',failAdjustment:'0',dimensionCode:null,appliesWhen:null}]});}
function addDimension(){if(!advanced.value||advanced.value.dimensions.length>=100)return;let i=1;while(advanced.value.dimensions.some(value=>value.code===`dimension_${i}`))i++;update({dimensions:[...advanced.value.dimensions,{code:`dimension_${i}`,baseScore:100,passingScore:60,lowerBound:'0',upperBound:'100'}]});}
function addGrade(){if(!advanced.value||advanced.value.grades.length>=100)return;let i=1;while(advanced.value.grades.some(value=>value.code===`grade_${i}`))i++;update({grades:[...advanced.value.grades,{code:`grade_${i}`,minimumScore:''}]});}
</script>
<template><section>
<h3>复杂评分</h3><a-switch :checked="!!advanced" :disabled="disabled" @change="(value:unknown)=>toggle(Boolean(value))"/>
<p v-if="modelValue.mode==='POINTS'">点数模式按有效项目的加权分值归一化为100分；基础分不参与计算，基准贡献为归一化前的权值。</p><p>权重参与原计分，并叠加通过/失败调整×权重。条件不满足只使该项不参与评分；未知保留待定。否决不受最低分覆盖。</p>
<template v-if="advanced">
<a-form-item label="整体最低分 / 最高分"><a-space><a-input :value="advanced.lowerBound" :disabled="disabled" :maxlength="64" @update:value="(value:string)=>update({lowerBound:value})"/><a-input :value="advanced.upperBound" :disabled="disabled" :maxlength="64" @update:value="(value:string)=>update({upperBound:value})"/></a-space></a-form-item>
<a-button :disabled="disabled || advanced.items.length>=200 || !itemCodes.some(code=>!advanced!.items.some(item=>item.itemCode===code))" @click="addItem">配置项目权重与条件</a-button>
<a-card v-for="(value,index) in advanced.items" :key="index" size="small" style="margin:12px 0">
<a-form-item label="项目"><a-select :value="value.itemCode" :options="options(itemCodes)" :disabled="disabled" @change="(code:string)=>item(index,{itemCode:code})"/></a-form-item>
<a-form-item label="权重 / 通过调整 / 失败调整"><a-space><a-input :value="value.weight" :disabled="disabled" :maxlength="64" @update:value="(text:string)=>item(index,{weight:text})"/><a-input :value="value.passAdjustment" :disabled="disabled" :maxlength="64" @update:value="(text:string)=>item(index,{passAdjustment:text})"/><a-input :value="value.failAdjustment" :disabled="disabled" :maxlength="64" @update:value="(text:string)=>item(index,{failAdjustment:text})"/></a-space><p>权重为(0,100]，调整为[-100,100]；以十进制文本保存。</p></a-form-item>
<a-form-item label="所属维度（可空）"><a-select :value="value.dimensionCode || undefined" :options="options(advanced.dimensions.map(d=>d.code))" :disabled="disabled" allow-clear @change="(code:string|undefined)=>item(index,{dimensionCode:code||null})"/></a-form-item>
<a-form-item label="条件计分"><a-switch :checked="!!value.appliesWhen" :disabled="disabled" @change="(enabled:unknown)=>item(index,{appliesWhen:enabled?blankCondition():null})"/></a-form-item>
<ActionConditionEditor v-if="value.appliesWhen" :model-value="value.appliesWhen" :finding-codes="findingCodes" :item-codes="itemCodes" :label-codes="labels?.bindings.map(labelBindingAddress)||[]" :allow-context-conditions="true" :excluded-kinds="['FINAL_SCORE_BELOW','RISK_AT_LEAST','RESULT_STATUS']" :node-count="conditionCount(value.appliesWhen)" :disabled="disabled" @update:model-value="condition=>item(index,{appliesWhen:condition})"/>
<a-button danger :disabled="disabled" @click="update({items:advanced.items.filter((_,i)=>i!==index)})">删除项目扩展</a-button>
</a-card>
<a-button :disabled="disabled || advanced.dimensions.length>=100" @click="addDimension">添加维度</a-button>
<a-card v-for="(value,index) in advanced.dimensions" :key="index" size="small" style="margin:12px 0"><a-form-item label="维度编码"><a-input :value="value.code" :disabled="disabled" @update:value="(code:string)=>dimension(index,{code})"/></a-form-item><a-form-item label="基础分 / 合格线"><a-space><a-input-number :value="value.baseScore" :disabled="disabled || modelValue.mode==='POINTS'" :min="1" :max="100" :precision="0" @change="(score:unknown)=>dimension(index,{baseScore:score as number})"/><a-input-number :value="value.passingScore" :disabled="disabled" :min="0" :max="100" :precision="0" @change="(score:unknown)=>dimension(index,{passingScore:score as number})"/></a-space></a-form-item><a-form-item label="最低分 / 最高分"><a-space><a-input :value="value.lowerBound" :disabled="disabled" :maxlength="64" @update:value="(text:string)=>dimension(index,{lowerBound:text})"/><a-input :value="value.upperBound" :disabled="disabled" :maxlength="64" @update:value="(text:string)=>dimension(index,{upperBound:text})"/></a-space></a-form-item><a-button danger :disabled="disabled" @click="update({dimensions:advanced.dimensions.filter((_,i)=>i!==index)})">删除维度</a-button></a-card>
<a-button :disabled="disabled || advanced.grades.length>=100" @click="addGrade">添加等级映射</a-button><p>等级按最低分严格降序填写，最后一个须覆盖0分；待定/不适用不产生等级。</p>
<a-card v-for="(value,index) in advanced.grades" :key="index" size="small" style="margin:12px 0"><a-space><a-input :value="value.code" :disabled="disabled" placeholder="等级编码" @update:value="(code:string)=>grade(index,{code})"/><a-input :value="value.minimumScore" :disabled="disabled" :maxlength="64" placeholder="最低分" @update:value="(text:string)=>grade(index,{minimumScore:text})"/><a-button danger :disabled="disabled" @click="update({grades:advanced.grades.filter((_,i)=>i!==index)})">删除等级</a-button></a-space></a-card>
</template></section></template>
