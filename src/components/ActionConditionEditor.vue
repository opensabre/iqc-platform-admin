<template>
  <fieldset class="condition">
    <a-select :value="modelValue.kind" :options="kinds" :disabled="disabled" style="min-width:200px" @change="changeKind" />
    <template v-if="group">
      <div v-for="(child,index) in modelValue.children" :key="index">
        <ActionConditionEditor :model-value="child" :finding-codes="findingCodes" :item-codes="itemCodes" :disabled="disabled" :depth="(depth||1)+1" :node-count="nodeCount" :excluded-kinds="excludedKinds" :allow-context-conditions="allowContextConditions" :label-codes="labelCodes" @update:model-value="value=>changeChild(index,value)" />
        <a-button size="small" danger :disabled="disabled || modelValue.children.length<=1" @click="remove(index)">删除子条件</a-button>
      </div>
      <a-button :disabled="disabled || (depth||1)>=16 || nodeCount>=100 || modelValue.kind==='NOT' && modelValue.children.length>=1" @click="add">添加子条件</a-button>
    </template>
    <template v-else-if="modelValue.kind!=='ALWAYS'">
      <a-input v-if="modelValue.kind==='BUSINESS_EQUALS'" :value="modelValue.code || ''" :disabled="disabled" :maxlength="512" placeholder="业务字段路径，例如 /customerLevel" @update:value="(value:string)=>update({code:value})" />
      <a-select v-if="needsCode" :value="modelValue.code || undefined" :options="codes" :disabled="disabled" show-search option-filter-prop="label" placeholder="选择事实或质检项" style="min-width:220px" @change="(value:string)=>update({code:value})" />
      <a-select v-if="values" :value="typeof modelValue.value==='string'?modelValue.value:undefined" :options="values" :disabled="disabled" style="min-width:160px" @change="(value:string)=>update({value})" />
      <a-input-number v-else-if="modelValue.kind==='FINAL_SCORE_BELOW'" :value="typeof modelValue.value==='number'?modelValue.value:undefined" :disabled="disabled" placeholder="评分阈值" @change="(value:unknown)=>update({value})" />
      <template v-else><a-input :value="raw" :disabled="disabled" placeholder='JSON 值，如 true、0、"文本"' style="min-width:240px" @update:value="changeScalar" /><p v-if="scalarError" role="alert">{{ scalarError }}</p></template>
    </template>
  </fieldset>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ActionCondition } from '@/api/pipelines';
import {selectorJsonNeedsExactEditor} from '@/api/selectors';
import {isActionScalar,blankCondition,conditionNames,findingStates,itemStates,riskLevels,resultStates,stateNames} from '@/api/action-policy-editor';
const props=defineProps<{modelValue:ActionCondition;findingCodes:string[];itemCodes:string[];disabled?:boolean;depth?:number;nodeCount:number;excludedKinds?:ActionCondition["kind"][];allowContextConditions?:boolean;labelCodes?:string[]}>();
const emit=defineEmits<{'update:modelValue':[value:ActionCondition]}>();
const group=computed(()=>['ALL','ANY','NOT'].includes(props.modelValue.kind));
const kinds=computed(()=>Object.entries(conditionNames).filter(([value])=>!props.excludedKinds?.includes(value as ActionCondition["kind"]) && (props.allowContextConditions || !["LABEL_EQUALS","BUSINESS_EQUALS"].includes(value))).map(([value,label])=>({value,label,disabled:['ALL','ANY','NOT'].includes(value) && (!group.value && (props.nodeCount>=100 || (props.depth||1)>=16))})));
const needsCode=computed(()=>['FINDING_EQUALS','FINDING_STATE','ITEM_STATUS','LABEL_EQUALS'].includes(props.modelValue.kind));
const codes=computed(()=>{const items=[...new Set(props.modelValue.kind==='ITEM_STATUS'?props.itemCodes:props.modelValue.kind==='LABEL_EQUALS'?(props.labelCodes||[]):props.findingCodes)].map(value=>({value,label:value}));if(props.modelValue.code && !items.some(item=>item.value===props.modelValue.code))items.unshift({value:props.modelValue.code,label:`${props.modelValue.code}（未加载）`});return items;});
const values=computed(()=>{const list=props.modelValue.kind==='FINDING_STATE'?findingStates:props.modelValue.kind==='ITEM_STATUS'?itemStates:props.modelValue.kind==='RISK_AT_LEAST'?riskLevels:props.modelValue.kind==='RESULT_STATUS'?resultStates:undefined;return list?.map(value=>({value,label:stateNames[value]||value}));});
function update(patch:Partial<ActionCondition>){if(!props.disabled)emit('update:modelValue',{...props.modelValue,...patch});}
function changeKind(kind:ActionCondition['kind']){
  if(props.disabled || props.excludedKinds?.includes(kind) || !props.allowContextConditions && ['LABEL_EQUALS','BUSINESS_EQUALS'].includes(kind))return;
  if(['ALL','ANY','NOT'].includes(kind)){update({kind,code:null,value:null,children:group.value?props.modelValue.children:[blankCondition()]});return;}
  const value=kind==='FINDING_STATE'?'KNOWN':kind==='ITEM_STATUS'?'FAIL':kind==='RISK_AT_LEAST'?'HIGH':kind==='RESULT_STATUS'?'UNQUALIFIED':['FINDING_EQUALS','LABEL_EQUALS','BUSINESS_EQUALS'].includes(kind)?false:null;
  update({kind,code:['FINDING_EQUALS','FINDING_STATE','ITEM_STATUS','LABEL_EQUALS','BUSINESS_EQUALS'].includes(kind)?'':null,value,children:[]});
}
function changeChild(index:number,value:ActionCondition){update({children:props.modelValue.children.map((child,i)=>i===index?value:child)});}
function remove(index:number){if(props.modelValue.children.length>1)update({children:props.modelValue.children.filter((_,i)=>i!==index)});}
function add(){if((props.depth||1)<16 && props.nodeCount<100 && !(props.modelValue.kind==='NOT' && props.modelValue.children.length>=1))update({children:[...props.modelValue.children,blankCondition()]});}
const raw=ref(''),scalarError=ref('');
watch(()=>props.modelValue.value,value=>{if(value && typeof value==='object')return;raw.value=JSON.stringify(value)??'';scalarError.value='';},{immediate:true});
function changeScalar(value:string){raw.value=value;try{if(selectorJsonNeedsExactEditor(value))throw Error();const parsed:unknown=JSON.parse(value);if(!isActionScalar(parsed))throw Error();scalarError.value='';update({value:parsed});}catch{scalarError.value='请输入有效 JSON 标量；文本须使用双引号，数值不能超出前端精确范围或在保存时被舍入。';update({value:{invalidInput:value}});}}
</script>
<style scoped>.condition{border:1px solid #ddd;padding:10px;margin:8px 0}.condition>div{padding-left:12px}</style>
