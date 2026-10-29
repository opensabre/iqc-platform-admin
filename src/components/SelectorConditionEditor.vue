<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {SelectorCondition} from '@/api/selectors';
const props=defineProps<{modelValue:SelectorCondition;disabled?:boolean;depth?:number}>();
const emit=defineEmits<{(e:'update:modelValue',v:SelectorCondition):void}>();
const fields=Object.entries({id:'会话 ID',employeeId:'员工 ID',employeeGroupId:'团队 ID',employeeDepartmentId:'部门 ID',channel:'渠道',businessType:'业务类型',businessNo:'业务编号',sourceType:'来源类型',externalId:'外部编号',fileName:'文件名',status:'会话状态',asrStatus:'转写状态',customerLevel:'客户等级',complaint:'是否投诉',durationSeconds:'会话时长（秒）',messageCount:'消息数',errorCount:'错误数',startedTime:'开始时间',endedTime:'结束时间',createdTime:'创建时间',tags:'标签',riskLevel:'风险等级'}).map(([value,label])=>({value,label}));
const operators=Object.entries({EQ:'等于',NE:'不等于',GT:'大于',GE:'大于等于',LT:'小于',LE:'小于等于',IN:'属于集合',NOT_IN:'不属于集合',EXISTS:'存在 / 缺失',CONTAINS:'包含标签'}).map(([value,label])=>({value,label}));
const typed=computed(()=>!('junction' in props.modelValue)&&(['IN','NOT_IN'].includes(props.modelValue.operator)||['durationSeconds','messageCount','errorCount','complaint'].includes(props.modelValue.field)||/^(business:|label:)/.test(props.modelValue.field)));
function operator(operator:string){if('junction' in props.modelValue)return;update({operator,...(operator==='EXISTS'?{value:true}:{})});}
function update(patch:object){emit('update:modelValue',{...props.modelValue,...patch} as SelectorCondition);}
function children(next:SelectorCondition[]){if('junction' in props.modelValue)update({children:next});}
function child(index:number,v:SelectorCondition){if('junction' in props.modelValue)children(props.modelValue.children.map((c,i)=>i===index?v:c));}
function add(group=false){if('junction' in props.modelValue)children([...props.modelValue.children,group?{junction:'AND',children:[]}:{field:'channel',operator:'EQ',value:''}]);}
function remove(index:number){if('junction' in props.modelValue)children(props.modelValue.children.filter((_,i)=>i!==index));}
const rawValue=ref('');
function renderValue(){if('junction' in props.modelValue)return '';return typed.value?JSON.stringify(props.modelValue.value)??'':String(props.modelValue.value??'');}
function parsed(raw:string):unknown{if(!typed.value)return raw;try{return JSON.parse(raw);}catch{return raw;}}
watch(()=>props.modelValue,v=>{if('junction' in v)return;if(JSON.stringify(parsed(rawValue.value))!==JSON.stringify(v.value))rawValue.value=renderValue();},{deep:true,immediate:true});
watch(typed,()=>rawValue.value=renderValue());
function value(raw:string){rawValue.value=raw;if(!typed.value){update({value:raw});return;}try{update({value:JSON.parse(raw)});}catch{update({value:raw});}}
</script>
<template><fieldset :disabled="disabled" class="condition"><template v-if="'junction' in modelValue"><a-space><a-select :value="modelValue.junction" :disabled="disabled" :options="[{value:'AND',label:'全部满足 AND'},{value:'OR',label:'任一满足 OR'}]" style="width:160px" @change="(v: string)=>update({junction:v})"/><a-button :disabled="disabled" @click="add(false)">添加条件</a-button><a-button :disabled="disabled||(depth||0)>=7" @click="add(true)">添加条件组</a-button></a-space><div v-for="(item,index) in modelValue.children" :key="index"><SelectorConditionEditor :model-value="item" :disabled="disabled" :depth="(depth||0)+1" @update:model-value="v=>child(index,v)"/><a-button size="small" danger :disabled="disabled" @click="remove(index)">删除</a-button></div><p v-if="!modelValue.children.length">空条件组不参与筛选。</p></template><template v-else><a-space wrap><a-select :value="modelValue.field" show-search :disabled="disabled" style="width:180px" :options="fields" @change="(v: string)=>update({field:v})"/><a-input :value="modelValue.field" :disabled="disabled" placeholder="或 business:KEY / label:ID:CODE" style="width:240px" @update:value="(v: string)=>update({field:v})"/><a-select :value="modelValue.operator" :disabled="disabled" :options="operators" style="width:110px" @change="operator"/><a-select v-if="modelValue.operator==='EXISTS'" :value="modelValue.value===false?'false':'true'" :options="[{value:'true',label:'存在'},{value:'false',label:'缺失'}]" :disabled="disabled" style="width:110px" @change="(v:string)=>update({value:v==='true'})"/><a-input v-else :value="rawValue" :disabled="disabled" :placeholder="typed?'JSON 数组、数值、布尔值；文本加双引号':'文本或本地 ISO 时间'" style="width:240px" @update:value="value"/></a-space></template></fieldset></template>
<style scoped>.condition{border:1px solid #ddd;padding:10px;margin:8px 0}.condition>div{padding-left:12px}</style>
