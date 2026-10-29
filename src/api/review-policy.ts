import type {ReviewPolicy,ActionPolicy,ActionCondition,FindingLabelPolicy} from './pipelines';
import {validateCondition,conditionCount,validateDecimalOperand} from './action-policy-editor';
import {labelBindingAddress} from './finding-label-policy';
const scale=10n**18n;
function probability(value:string){validateDecimalOperand(value);const [whole,fraction='']=value.replace(/^[+-]/,'').split('.');const number=(BigInt(whole)*scale+BigInt(fraction.padEnd(18,'0')))*(value.startsWith('-')?-1n:1n);if(number<0n||number>scale)throw Error('概率/置信度须在0到1之间');return number;}
function references(c:ActionCondition,findings:string[],items:string[],labels:string[]){if(c.kind==='REVIEW_REQUIRED')throw Error('复核政策不能引用自己');if(['FINDING_EQUALS','FINDING_STATE'].includes(c.kind)&&!findings.includes(c.code||'')||c.kind==='ITEM_STATUS'&&!items.includes(c.code||'')||c.kind==='LABEL_EQUALS'&&!labels.includes(c.code||''))throw Error('复核条件引用未声明的输入');c.children.forEach(child=>references(child,findings,items,labels));}
function readsReview(c:ActionCondition):boolean{return c.kind==='REVIEW_REQUIRED'||c.children.some(readsReview);}
export function validateReviewPolicy(source:ReviewPolicy|null|undefined,findings:string[],items:string[],labels:FindingLabelPolicy|undefined,actions:ActionPolicy|undefined):ReviewPolicy|undefined {
 if(!source){if(actions?.actions.some(action=>readsReview(action.condition)))throw Error('复核要求动作需要启用复核政策');return undefined;}
 const policy=JSON.parse(JSON.stringify(source)) as ReviewPolicy;
 if(!['iqc-review-policy-v1','iqc-review-policy-v2'].includes(policy.schemaVersion)||!policy.seed?.trim()||policy.seed.length>128||/[\u0000-\u001f\u007f-\u009f]/.test(policy.seed)||!['REQUIRE_REVIEW','KEEP_UNKNOWN'].includes(policy.unknownHandling)||!Array.isArray(policy.rules)||!policy.rules.length||policy.rules.length>100)throw Error('复核政策须配置稳定种子、未知策略和1至100条规则');
 if(policy.rules.filter(rule=>rule.fallback===true).length>1)throw Error('普通兜底抽样只能配置一条规则');
 const ids=new Set<string>(),labelCodes=labels?.bindings.map(labelBindingAddress)||[];let count=0;
 for(const rule of policy.rules){if(typeof rule.ruleId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,127}$/.test(rule.ruleId)||ids.has(rule.ruleId))throw Error('复核规则编码无效或重复');ids.add(rule.ruleId);if(rule.fallback!=null&&typeof rule.fallback!=='boolean')throw Error('兜底标记须为布尔值');probability(rule.probability);if((rule.probability.split('.')[1]?.length??0)>4)throw Error('抽样概率最多4位小数');validateCondition(rule.condition,1,{value:0});references(rule.condition,findings,items,labelCodes);count+=conditionCount(rule.condition);
  const gate=rule.confidence;if(gate){if(!findings.includes(gate.findingCode)||gate.minimumInclusive==null&&gate.maximumExclusive==null)throw Error('置信度区间须引用声明的Finding并填写边界');if(gate.minimumInclusive!=null)probability(gate.minimumInclusive);if(gate.maximumExclusive!=null)probability(gate.maximumExclusive);if(gate.minimumInclusive!=null&&gate.maximumExclusive!=null&&probability(gate.minimumInclusive)>=probability(gate.maximumExclusive))throw Error('置信度区间下界必须低于上界');}
 }
 if(count>1000)throw Error('复核条件最多1000个节点');
 if(actions?.actions.filter(action=>action.type==='CREATE_REVIEW'&&action.condition.kind==='REVIEW_REQUIRED'&&action.condition.value===true).length!==1)throw Error('复核政策需要唯一基于复核要求的CREATE_REVIEW动作');
 return policy;
}
