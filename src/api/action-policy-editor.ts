import type { ActionCondition, ActionPolicy } from './pipelines';
import { validateAutomaticRetry } from './automatic-retry';
import { selectorJsonNeedsExactEditor } from './selectors';
export type PolicyAction = ActionPolicy['actions'][number];
export const supportedActionNames = { SAVE_RESULT:'保存分析结果', UPDATE_LABEL:'更新标签', CREATE_RISK_EVENT:'创建风险事件', SEND_ALERT:'发送告警', CREATE_REVIEW:'发起业务复核', ADD_TO_EVALUATION_CANDIDATE:'加入评测候选', WEBHOOK:'发送 Webhook', CREATE_WORK_ORDER:'创建工单', CREATE_COACHING_TASK:'创建辅导任务' } as const;
export function isExternalAction(type:PolicyAction['type']):boolean {return ['WEBHOOK','CREATE_WORK_ORDER','CREATE_COACHING_TASK'].includes(type);}
function validateExternalPayload(payload:unknown,depth=0):void {
  if(depth>16)throw Error('业务载荷最多嵌套16层');
  if(payload && typeof payload==='object')for(const child of Object.values(payload))validateExternalPayload(child,depth+1);
}
export function parseExternalActionPayload(raw:string):Record<string,unknown> {
  if(new TextEncoder().encode(raw).length>65536)throw Error('业务载荷输入过长');
  const payload:unknown=JSON.parse(raw);
  if(selectorJsonNeedsExactEditor(raw))throw Error('载荷数值无法精确保存，请将精确值表示为文本');
  if(!payload || typeof payload!=='object' || Array.isArray(payload))throw Error('业务载荷须为 JSON 对象');
  validateExternalPayload(payload);
  if(new TextEncoder().encode(JSON.stringify(payload)).length>16384)throw Error('业务载荷最多16KiB');
  return payload as Record<string,unknown>;
}
export const conditionNames:Record<ActionCondition['kind'],string> = {ALWAYS:'每份生产结果',ALL:'全部条件满足',ANY:'任一条件满足',NOT:'条件取反',FINDING_EQUALS:'Finding 值相等',FINDING_STATE:'Finding 状态',ITEM_STATUS:'质检项状态',RISK_AT_LEAST:'风险等级不低于',FINAL_SCORE_BELOW:'最终评分低于',RESULT_STATUS:'结果状态',LABEL_EQUALS:'冻结标签值相等',BUSINESS_EQUALS:'冻结业务字段相等',REVIEW_REQUIRED:'复核政策要求'};
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
export function editableAction(action:PolicyAction):boolean {return (action.adapterVersion??1)===1 && Object.hasOwn(supportedActionNames,action.type) && ['RECORD_ONLY','ESCALATE_REVIEW'].includes(action.failureHandling);}
function boundedInteger(value:unknown,min:number,max:number){return typeof value==='number' && Number.isSafeInteger(value) && value>=min && value<=max;}
export function isActionScalar(value:unknown){return typeof value==='string' || typeof value==='boolean' || typeof value==='number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value));}
export const decimalConditionKinds:ActionCondition['kind'][]=['FINDING_EQUALS','LABEL_EQUALS','BUSINESS_EQUALS','FINAL_SCORE_BELOW'];
export function validateDecimalOperand(value:unknown):asserts value is string {
  if(typeof value!=='string' || value.length>64 || !/^[-+]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value))throw Error('请输入精确十进制字符串，不使用科学记数或空值');
  const decimal=value.replace(/^[+-]/,'');const precision=(decimal.replace('.','').replace(/^0+/,'')||'0').length;
  if(precision>38 || (decimal.split('.')[1]?.length??0)>18)throw Error('数值最多38位有效数字及18位小数');
}
export function validateCondition(condition:ActionCondition,depth:number,count:{value:number}) {
  if(!condition || depth>16 || ++count.value>100 || !Object.hasOwn(conditionNames,condition.kind) || !Array.isArray(condition.children))throw Error('动作条件最多16层、100个节点，且必须使用支持的条件种类');
  if(condition.decimalOperand!=null){
    if(!decimalConditionKinds.includes(condition.kind) || condition.value!=null)throw Error('精确数值只用于数值比较，普通条件值须为空');
    validateDecimalOperand(condition.decimalOperand);
  }
  const group=['ALL','ANY','NOT'].includes(condition.kind);
  if(group){if(condition.code!=null || condition.value!=null || !condition.children.length || condition.kind==='NOT' && condition.children.length!==1)throw Error('条件组不能为空，取反条件只能有一个子条件');}
  else {
    if(condition.children.length)throw Error('单项条件不能包含子条件');
    if(condition.kind==='ALWAYS'){if(condition.code!=null || condition.value!=null)throw Error('每份结果条件不能携带操作数');}
    else {
      if(condition.decimalOperand==null && (!isActionScalar(condition.value) || JSON.stringify(condition.value).length>4096))throw Error('条件值须为有效文本、布尔值或可精确表达的数值');
      if(['FINDING_EQUALS','FINDING_STATE','ITEM_STATUS'].includes(condition.kind)){if(typeof condition.code!=='string' || !/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,127}$/.test(condition.code))throw Error('请选择条件引用的事实或质检项');}
      else if(['LABEL_EQUALS','BUSINESS_EQUALS'].includes(condition.kind)){
        if(typeof condition.code!=='string' || condition.code.length>512 || !condition.code.startsWith('/') || /~(?![01])|[\u0000-\u001f\u007f-\u009f]/.test(condition.code))throw Error('请输入有效的冻结上下文路径');
        const parts=condition.code.slice(1).split('/');if(parts.some(part=>!part)||parts.length>16 || condition.kind==='LABEL_EQUALS'&&parts.length!==2)throw Error('标签路径须引用标签和值，业务路径最多16层且不能包含空段');
      }
      else if(condition.code!=null)throw Error('此条件不能引用事实编码');
      const choices=condition.kind==='FINDING_STATE'?findingStates:condition.kind==='ITEM_STATUS'?itemStates:condition.kind==='RISK_AT_LEAST'?riskLevels:condition.kind==='RESULT_STATUS'?resultStates:undefined;
      if(choices && (typeof condition.value!=='string' || !choices.includes(condition.value)))throw Error('条件状态或风险等级无效');
      if(condition.kind==='REVIEW_REQUIRED'&&typeof condition.value!=='boolean')throw Error('复核要求条件须为布尔值');
      if(condition.kind==='FINAL_SCORE_BELOW' && condition.decimalOperand==null && typeof condition.value!=='number')throw Error('评分阈值须为数值');
    }
  }
  for(const child of condition.children)validateCondition(child,depth+1,count);
}
function configuration(action:PolicyAction){
  const c=action.configuration;
  const keys=isExternalAction(action.type)?['destinationId','destinationVersion','payload']:action.type==='SAVE_RESULT'?[]:action.type==='UPDATE_LABEL'?['labelId','valueCode']:action.type==='CREATE_RISK_EVENT'?['category','title','description']:action.type==='CREATE_REVIEW'?['reason','expectedRevision']:action.type==='SEND_ALERT'?['sceneCode','channel','target','args']:['sampleType','name','tags','reviewRevision'];
  if(Object.keys(c).some(key=>!keys.includes(key)))throw Error(`动作 ${action.actionId} 包含不支持的配置字段`);
  if(isExternalAction(action.type)){
    if(typeof c.destinationId!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(c.destinationId))throw Error('目的地编码须为1到64位字母、数字、下划线或短横线');
    if(!boundedInteger(c.destinationVersion,1,2147483647))throw Error('请选择目的地精确版本');
    if(!c.payload || typeof c.payload!=='object' || Array.isArray(c.payload))throw Error('业务载荷须为有效 JSON 对象');
    parseExternalActionPayload(JSON.stringify(c.payload));
  }
  if(action.type==='CREATE_RISK_EVENT'){
    if(typeof c.category!=='string' || !/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,63}$/.test(c.category))throw Error('风险类别须为有效稳定编码，最多64字');
    for(const [key,max] of [['title',128],['description',1000]] as const){const value=c[key];if(typeof value!=='string' || !value.trim() || value.length>max || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(value))throw Error(`风险${key==='title'?'标题':'描述'}必填，最多${max}字且不能含控制字符`);}
  }
  if(action.type==='SEND_ALERT'){
    if(typeof c.sceneCode!=='string' || !/^[A-Za-z0-9:_-]{1,64}$/.test(c.sceneCode))throw Error('告警场景编码必填，最多64字，仅支持字母、数字、冒号、下划线和短横线');
    if(!['SMS','EMAIL'].includes(String(c.channel)))throw Error('请选择短信或邮件渠道');
    if(typeof c.target!=='string' || !c.target || c.target.length>255 || /[\s\u0000-\u001f\u007f-\u009f]/.test(c.target))throw Error('告警接收地址必填，最多255字，不能含空白或控制字符');
    if(c.channel==='SMS' && !/^\+?[0-9]{6,20}$/.test(c.target))throw Error('短信号码须为6至20位数字，可带加号前缀');
    if(c.channel==='EMAIL' && (c.target.indexOf('@')<1 || c.target.indexOf('@')!==c.target.lastIndexOf('@') || c.target.endsWith('@')))throw Error('邮件地址须包含一个有效的 @ 分隔符');
    if(c.args!==undefined && (!c.args || typeof c.args!=='object' || Array.isArray(c.args) || Object.entries(c.args).length>50 || Object.entries(c.args).some(([key,value])=>!/^[A-Za-z0-9_]{1,64}$/.test(key) || typeof value!=='string' || value.length>1000)))throw Error('告警模板参数最多50项；名称最多64字，仅含字母、数字、下划线，值须为最多1000字的文本');
  }
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
    const pending=[action.condition];while(pending.length){const condition=pending.pop()!;if(['LABEL_EQUALS','BUSINESS_EQUALS'].includes(condition.kind))throw Error('标签和业务字段条件目前仅用于独立风险政策');pending.push(...condition.children);}
    if(editableAction(action)){action.retry=validateAutomaticRetry(action.retry);configuration(action);}
  }
  return copy;
}
