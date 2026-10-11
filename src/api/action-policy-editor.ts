import type { ActionCondition, ActionPolicy } from './pipelines';
import { validateAutomaticRetry } from './automatic-retry';
export type PolicyAction = ActionPolicy['actions'][number];
export const supportedActionNames = { SAVE_RESULT:'保存分析结果', UPDATE_LABEL:'更新标签', CREATE_REVIEW:'发起业务复核', ADD_TO_EVALUATION_CANDIDATE:'加入评测候选' } as const;
export const conditionNames:Record<ActionCondition['kind'],string> = {ALWAYS:'每份生产结果',ALL:'全部条件满足',ANY:'任一条件满足',NOT:'条件取反',FINDING_EQUALS:'Finding 值相等',FINDING_STATE:'Finding 状态',ITEM_STATUS:'质检项状态',RISK_AT_LEAST:'风险等级不低于',FINAL_SCORE_BELOW:'最终评分低于',RESULT_STATUS:'结果状态'};
export const findingStates=['KNOWN','UNKNOWN','CONFLICT','ERROR','NOT_EVALUATED'];
export const itemStates=['PASS','FAIL','NOT_APPLICABLE','REVIEW_REQUIRED','ERROR','NOT_EVALUATED'];
export const riskLevels=['NONE','LOW','MEDIUM','HIGH','CRITICAL'];
export const resultStates=['QUALIFIED','UNQUALIFIED','PENDING','NOT_APPLICABLE','ERROR'];
export const stateNames:Record<string,string>={KNOWN:'确定',UNKNOWN:'未知',CONFLICT:'冲突',ERROR:'错误',NOT_EVALUATED:'未评估',PASS:'通过',FAIL:'不通过',NOT_APPLICABLE:'不适用',REVIEW_REQUIRED:'需复核',NONE:'无',LOW:'低',MEDIUM:'中',HIGH:'高',CRITICAL:'严重',QUALIFIED:'合格',UNQUALIFIED:'不合格',PENDING:'待判定'};
export const always = ():ActionCondition=>({kind:'ALWAYS',code:null,value:null,children:[]});
export const blankCondition = ():ActionCondition=>({kind:'FINDING_STATE',code:'',value:'KNOWN',children:[]});
export function conditionCount(condition:ActionCondition):number {
  const pending=[condition];let count=0;
  while(pending.length && count<=100){const next=pending.pop();count++;if(Array.isArray(next?.children))pending.push(...next.children);}
  return count;
}
export function editableAction(action:PolicyAction):boolean {return (action.adapterVersion??1)===1 && Object.hasOwn(supportedActionNames,action.type) && action.failureHandling==='RECORD_ONLY';}
function boundedInteger(value:unknown,min:number,max:number){return typeof value==='number' && Number.isSafeInteger(value) && value>=min && value<=max;}
export function isActionScalar(value:unknown){return typeof value==='string' || typeof value==='boolean' || typeof value==='number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));}
function validateCondition(condition:ActionCondition,depth:number,count:{value:number}) {
  if(!condition || depth>16 || ++count.value>100 || !Object.hasOwn(conditionNames,condition.kind) || !Array.isArray(condition.children))throw Error('动作条件最多16层、100个节点，且必须使用支持的条件种类');
  const group=['ALL','ANY','NOT'].includes(condition.kind);
  if(group){if(condition.code!=null || condition.value!=null || !condition.children.length || condition.kind==='NOT' && condition.children.length!==1)throw Error('条件组不能为空，取反条件只能有一个子条件');}
  else {
    if(condition.children.length)throw Error('单项条件不能包含子条件');
    if(condition.kind==='ALWAYS'){if(condition.code!=null || condition.value!=null)throw Error('每份结果条件不能携带操作数');}
    else {
      if(!isActionScalar(condition.value) || JSON.stringify(condition.value).length>4096)throw Error('条件值须为有效文本、布尔值或可精确表达的数值');
      if(['FINDING_EQUALS','FINDING_STATE','ITEM_STATUS'].includes(condition.kind)){if(typeof condition.code!=='string' || !/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,127}$/.test(condition.code))throw Error('请选择条件引用的事实或质检项');}
      else if(condition.code!=null)throw Error('此条件不能引用事实编码');
      const choices=condition.kind==='FINDING_STATE'?findingStates:condition.kind==='ITEM_STATUS'?itemStates:condition.kind==='RISK_AT_LEAST'?riskLevels:condition.kind==='RESULT_STATUS'?resultStates:undefined;
      if(choices && (typeof condition.value!=='string' || !choices.includes(condition.value)))throw Error('条件状态或风险等级无效');
      if(condition.kind==='FINAL_SCORE_BELOW' && typeof condition.value!=='number')throw Error('评分阈值须为数值');
    }
  }
  for(const child of condition.children)validateCondition(child,depth+1,count);
}
function configuration(action:PolicyAction){
  const c=action.configuration;
  const keys=action.type==='SAVE_RESULT'?[]:action.type==='UPDATE_LABEL'?['labelId','valueCode']:action.type==='CREATE_REVIEW'?['reason','expectedRevision']:['sampleType','name','tags','reviewRevision'];
  if(Object.keys(c).some(key=>!keys.includes(key)))throw Error(`动作 ${action.actionId} 包含不支持的配置字段`);
  if(action.type==='CREATE_REVIEW'){
    if(typeof c.reason!=='string' || !c.reason.trim() || c.reason.trim().length>1000)throw Error('复核原因必填，最多1000字');
    if(c.expectedRevision!==undefined && !boundedInteger(c.expectedRevision,0,2147483646))throw Error('复核预期轮次无效');
  }
  if(action.type==='ADD_TO_EVALUATION_CANDIDATE'){
    if(typeof c.sampleType!=='string' || !['POSITIVE','NEGATIVE','FALSE_POSITIVE','FALSE_NEGATIVE'].includes(c.sampleType))throw Error('请选择评测样本类型');
    if(c.reviewRevision!==undefined && !boundedInteger(c.reviewRevision,1,2147483647))throw Error('候选来源复核轮次无效');
    if(c.name!==undefined && (typeof c.name!=='string' || !c.name.trim() || c.name.trim().length>128))throw Error('候选名称须为1到128字');
    if(c.tags!==undefined && (!Array.isArray(c.tags) || c.tags.length>50 || c.tags.some(tag=>typeof tag!=='string' || !tag.trim() || tag.length>64)))throw Error('候选标签最多50项，每项最多64字');
  }
}
export function validateActionPolicy(policy?:ActionPolicy|null):ActionPolicy|undefined {
  if(!policy)return undefined;
  const copy=JSON.parse(JSON.stringify(policy)) as ActionPolicy;
  if(copy.schemaVersion!=='iqc-action-policy-v1' || !Array.isArray(copy.actions) || copy.actions.length>100)throw Error('动作政策必须使用受支持协议，最多100项');
  const ids=new Set<string>();
  for(const action of copy.actions){
    if(!action || typeof action.actionId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,127}$/.test(action.actionId) || ids.has(action.actionId))throw Error('动作编码无效或重复');
    ids.add(action.actionId);
    if(!['SAVE_RESULT','UPDATE_LABEL','CREATE_RISK_EVENT','SEND_ALERT','CREATE_REVIEW','CREATE_WORK_ORDER','CREATE_COACHING_TASK','WEBHOOK','ADD_TO_EVALUATION_CANDIDATE'].includes(action.type))throw Error('动作类型无效');
    if(action.adapterVersion!=null && !boundedInteger(action.adapterVersion,1,2147483647) || action.idempotency!=='PRODUCTION_SOURCE_V1' || !['RECORD_ONLY','ESCALATE_REVIEW'].includes(action.failureHandling))throw Error('动作版本、幂等或失败政策无效');
    if(action.configuration==null || typeof action.configuration!=='object' || Array.isArray(action.configuration) || JSON.stringify(action.configuration).length>65536)throw Error('动作配置须为有界对象');
    validateCondition(action.condition,1,{value:0});
    if(editableAction(action)){action.retry=validateAutomaticRetry(action.retry);configuration(action);}
  }
  return copy;
}
