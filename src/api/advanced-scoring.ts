import type {ActionCondition,FindingLabelPolicy,ScoringPolicy} from './pipelines';
import {validateDecimalOperand,validateCondition,conditionCount} from './action-policy-editor';
import {labelBindingAddress} from './finding-label-policy';
const scale=10n**18n;
function decimal(value:unknown):bigint {validateDecimalOperand(value);const [whole,fraction='']=value.replace(/^[+-]/,'').split('.');const result=BigInt(whole)*scale+BigInt(fraction.padEnd(18,'0'));return value.startsWith('-')?-result:result;}
function range(value:unknown,min:bigint,max:bigint,exclusive=false){const d=decimal(value);if((exclusive?d<=min:d<min)||d>max)throw Error('评分数值超出允许范围');}
function bounds(lower:string,upper:string){range(lower,0n,100n*scale);range(upper,0n,100n*scale);if(decimal(lower)>decimal(upper)||(lower.split('.')[1]?.length??0)>2||(upper.split('.')[1]?.length??0)>2)throw Error('评分上下限须按顺序且最多2位小数');}
function id(value:string){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,127}$/.test(value))throw Error('评分编码须为有效稳定编码');}
function inputs(c:ActionCondition,findings:string[],items:string[],labels:string[]){
 if(['FINAL_SCORE_BELOW','RISK_AT_LEAST','RESULT_STATUS','REVIEW_REQUIRED'].includes(c.kind))throw Error('计分条件不能引用评分、风险或最终结果');
 if(['FINDING_EQUALS','FINDING_STATE'].includes(c.kind)&&!findings.includes(c.code||'')||c.kind==='ITEM_STATUS'&&!items.includes(c.code||'')||c.kind==='LABEL_EQUALS'&&!labels.includes(c.code||''))throw Error('计分条件引用未声明的事实、项目或标签');
 c.children.forEach(child=>inputs(child,findings,items,labels));
}
export function validateScoringPolicy(source:ScoringPolicy,items:ScoringPolicy['items'],findings:string[],labels?:FindingLabelPolicy|null):ScoringPolicy {
 const policy=JSON.parse(JSON.stringify({...source,items})) as ScoringPolicy;
 if(!['DEDUCTION','POINTS'].includes(policy.mode)||!Number.isInteger(policy.baseScore)||policy.baseScore<1||policy.baseScore>100||!Number.isInteger(policy.passingScore)||policy.passingScore<0||policy.passingScore>100)throw Error('评分方式、基础分或合格线无效');
 const ids=new Set<string>();for(const item of policy.items){if(typeof item.itemCode!=='string'||!item.itemCode.trim()||item.itemCode!==item.itemCode.trim()||ids.has(item.itemCode)||!Number.isInteger(item.points)||item.points<(policy.mode==='POINTS'?1:0)||item.points>100||typeof item.veto!=='boolean')throw Error('评分项目编码、分值或否决配置无效');ids.add(item.itemCode);}
 if(!policy.advanced){if(policy.version!=='iqc-score-v2'||policy.mode==='DEDUCTION'&&policy.passingScore>policy.baseScore)throw Error('基础评分版本或合格线无效');return policy;}
 if(policy.version!=='iqc-score-v3'||policy.advanced.schemaVersion!=='iqc-score-advanced-v1')throw Error('复杂评分须使用V3协议');
 const a=policy.advanced;bounds(a.lowerBound,a.upperBound);const passing=BigInt(policy.passingScore)*scale;if(passing<decimal(a.lowerBound)||passing>decimal(a.upperBound))throw Error('合格线须在整体上下限内');
 if(!Array.isArray(a.items)||!Array.isArray(a.dimensions)||!Array.isArray(a.grades)||items.length>200||a.items.length>200||a.dimensions.length>100||a.grades.length>100)throw Error('复杂评分最多200个项目、100个维度和等级');
 const dims=new Set<string>();for(const d of a.dimensions){id(d.code);if(dims.has(d.code))throw Error('维度编码重复');dims.add(d.code);bounds(d.lowerBound,d.upperBound);if(!Number.isInteger(d.baseScore)||d.baseScore<1||d.baseScore>100||!Number.isInteger(d.passingScore)||BigInt(d.passingScore)*scale<decimal(d.lowerBound)||BigInt(d.passingScore)*scale>decimal(d.upperBound))throw Error('维度基础分或合格线无效');}
 const codes=items.map(item=>item.itemCode),labelCodes=labels?.bindings.map(labelBindingAddress)||[],seen=new Set<string>();let count=0;
 for(const item of a.items){id(item.itemCode);if(!codes.includes(item.itemCode)||seen.has(item.itemCode)||item.dimensionCode!=null&&!dims.has(item.dimensionCode))throw Error('扩展项目重复或项目/维度未声明');seen.add(item.itemCode);range(item.weight,0n,100n*scale,true);range(item.passAdjustment,-100n*scale,100n*scale);range(item.failAdjustment,-100n*scale,100n*scale);if(item.appliesWhen){validateCondition(item.appliesWhen,1,{value:0});inputs(item.appliesWhen,findings,codes,labelCodes);count+=conditionCount(item.appliesWhen);}}
 if(count>1000)throw Error('计分条件最多1000个节点');
 seen.clear();let previous:bigint|undefined;for(const grade of a.grades){id(grade.code);range(grade.minimumScore,0n,100n*scale);const minimum=decimal(grade.minimumScore);if(seen.has(grade.code)||previous!==undefined&&minimum>=previous)throw Error('等级须编码唯一且下界严格降序');seen.add(grade.code);previous=minimum;}if(previous!==undefined&&previous!==0n)throw Error('等级映射须覆盖0分');
 return policy;
}
