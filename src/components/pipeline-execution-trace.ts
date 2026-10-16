import type {AdvancedScoringResult,TraceFinding} from '@/api/results';
import {finding} from './route-execution-trace';
export interface PipelineNodeTrace {
 nodeId:string;attempt:number;startedAt:string;durationMs:number;
 result:{status:string;findings:TraceFinding[];variables:Record<string,unknown>;metrics:Record<string,unknown>;error:string|null};
}
export interface FusedFinding {
 code:string;valueType:TraceFinding['valueType'];state:TraceFinding['state'];value:unknown;
 severity:TraceFinding['severity'];rawFindings:TraceFinding[];selectedIds:string[];rejectedIds:string[];
 evidence:TraceFinding['evidence'];explanation:string;policyId:string;policyVersion:number;
}
export interface ReviewDecision {schemaVersion:'iqc-review-decision-v1'|'iqc-review-decision-v2';inputHash:string;samplingInputHash?:string|null;status:'REQUIRED'|'NOT_REQUIRED'|'UNKNOWN';rules:Array<{ruleId:string;conditionMatch:'MATCH'|'NO_MATCH'|'UNKNOWN';confidenceMatch:'MATCH'|'NO_MATCH'|'UNKNOWN';calibratedConfidence:number|null;bucket:number|null;selected:boolean|null;suppressed:boolean;effectiveMatch:'MATCH'|'NO_MATCH'|'UNKNOWN'}>}
export interface PipelineTrace {
 reviewDecision?:ReviewDecision|null;schemaVersion:'iqc-pipeline-execution-v1';inputHash:string;mode:'PRODUCTION'|'EVALUATION';riskLevel:string;
 run:{completionReason?:'POLICY_SATISFIED'|null;status:string;trace:PipelineNodeTrace[];findings:TraceFinding[];variables:Record<string,unknown>;reviewRequired:boolean};
 fusion:FusedFinding[];items:Array<{itemCode:string;name:string;ruleId:string;ruleVersionNo:number;status:string;matchedMessageIds:string[]}>;
 scoring:{advanced?:AdvancedScoringResult|null;policyVersion:string;mode:string;scoreStatus:string;finalScore:number|null;conclusion:string;vetoTriggered:boolean;
 lines:Array<{itemCode:string;status:string;configuredPoints:number;contribution:number|null;vetoTriggered:boolean}>;
 coverage:{expected:number;completed:number;notApplicable:number;pending:number}};
}
export type PipelineParseResult={status:'AVAILABLE';trace:PipelineTrace}|{status:'INVALID';message:string}|{status:'OTHER'};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(text)&&new Set(v).size===v.length;
const itemStatuses=['PASS','FAIL','NOT_APPLICABLE','REVIEW_REQUIRED','ERROR','NOT_EVALUATED'];
function node(v:unknown):boolean {
 if(!object(v)||!text(v.nodeId)||!count(v.attempt)||!text(v.startedAt)||!Number.isFinite(Date.parse(v.startedAt))||!number(v.durationMs)||v.durationMs<0||!object(v.result))return false;
 const r=v.result;
 if(v.attempt===0 && (r.status!=='SKIPPED'||v.durationMs!==0))return false;
 return ['SUCCESS','SKIPPED','ERROR','TIMEOUT','CANCELLED'].includes(String(r.status))&&Array.isArray(r.findings)&&r.findings.every(finding)&&object(r.variables)&&object(r.metrics)&&!Object.keys(r.variables).some(k=>k.startsWith('__'))&&(r.error==null||typeof r.error==='string')&&(r.status==='SUCCESS'||r.findings.length===0&&Object.keys(r.variables).length===0);
}
function fused(v:unknown):boolean {
 if(!object(v)||!text(v.code)||!text(v.policyId)||!count(v.policyVersion)||v.policyVersion===0||typeof v.explanation!=='string'||!Array.isArray(v.rawFindings)||!v.rawFindings.length||!v.rawFindings.every(finding)||!strings(v.selectedIds)||!strings(v.rejectedIds)||!Array.isArray(v.evidence))return false;
 const raw=v.rawFindings as TraceFinding[];
 const ids=new Set(raw.map(f=>f.id));
 if(v.selectedIds.length+v.rejectedIds.length!==raw.length||ids.size!==raw.length||raw.some(f=>f.code!==v.code||f.valueType!==v.valueType)||[...v.selectedIds,...v.rejectedIds].some(id=>!ids.has(id))||v.selectedIds.some(id=>(v.rejectedIds as string[]).includes(id)))return false;
 // Reuse the typed fact validator for the fused envelope, without manufacturing a persisted fact.
 return finding({...raw[0],valueType:v.valueType,state:v.state,value:v.value,severity:v.severity,evidence:v.evidence,confidence:null,reason:v.explanation});
}
// Mirror InspectionScoring.Result invariants without inventing missing policy thresholds.
function consistentScoring(s:PipelineTrace['scoring']):boolean {
 let total=0, denominator=0;
 for(const line of s.lines) {
  const completed=line.status==='PASS'||line.status==='FAIL';
  const expected=completed
   ? (line.status===(s.mode==='DEDUCTION'?'FAIL':'PASS')?line.configuredPoints:0)
   : line.status==='NOT_APPLICABLE'?0:null;
  if(line.contribution!==expected||line.vetoTriggered&&line.status!=='FAIL'||s.mode==='POINTS'&&line.configuredPoints===0)return false;
  total+=line.contribution??0;
  if(completed)denominator+=line.configuredPoints;
 }
 if(s.vetoTriggered!==s.lines.some(line=>line.vetoTriggered))return false;
 if(s.vetoTriggered) {
  return s.conclusion==='UNQUALIFIED'&&(s.scoreStatus!=='FINAL'||s.finalScore===0);
 }
 if(s.scoreStatus!=='FINAL')return s.conclusion===s.scoreStatus;
 if(!['QUALIFIED','UNQUALIFIED'].includes(s.conclusion)||s.finalScore==null)return false;
 if(s.mode==='POINTS')return s.finalScore===Math.round(total*10000/denominator)/100;
 // baseScore (1..100) and passingScore are not in the trace: validate only provable bounds.
 return Number.isInteger(s.finalScore)&&s.finalScore>=Math.max(0,1-total)&&s.finalScore<=Math.max(0,100-total);
}
// V3 validates source/status structure; formulas require the server's frozen policy and exact decimals.
function consistentAdvanced(trace:PipelineTrace):boolean {
 const s=trace.scoring,a=s.advanced;
 if(!a||a.schemaVersion!=='iqc-score-result-v3'||!Array.isArray(a.lines)||a.lines.length!==s.lines.length||a.lines.length>200||!Array.isArray(a.dimensions)||a.dimensions.length>100||!(a.grade==null||text(a.grade))||!(s.scoreStatus==='FINAL'?number(a.rawScore)&&number(a.rawNumerator)&&number(a.rawDenominator)&&a.rawDenominator>0:a.rawScore==null&&a.rawNumerator==null&&a.rawDenominator==null&&a.grade==null))return false;
 const items=new Map(trace.items.map(i=>[i.itemCode,i])),legacy=new Map(s.lines.map(i=>[i.itemCode,i]));
 if(new Set(a.lines.map(line=>line.itemCode)).size!==a.lines.length)return false;
 for(const line of a.lines){if(!object(line)||!text(line.itemCode)||!itemStatuses.includes(line.originalStatus)||!itemStatuses.includes(line.status)||!['MATCH','NO_MATCH','UNKNOWN'].includes(line.applicability)||!count(line.configuredPoints)||!number(line.weight)||line.weight<=0||line.weight>100||!(line.baseContribution==null||number(line.baseContribution))||!(line.adjustment==null||number(line.adjustment))||typeof line.vetoTriggered!=='boolean'||!(line.dimensionCode==null||text(line.dimensionCode)))return false;
  const status=line.originalStatus==='NOT_APPLICABLE'?line.originalStatus:line.applicability==='NO_MATCH'?'NOT_APPLICABLE':line.applicability==='UNKNOWN'?'REVIEW_REQUIRED':line.originalStatus;
  const base=legacy.get(line.itemCode);if(items.get(line.itemCode)?.status!==line.originalStatus||line.status!==status||!base||base.status!==status||base.configuredPoints!==line.configuredPoints||base.vetoTriggered!==line.vetoTriggered)return false;
  const expected=['PASS','FAIL'].includes(status)?(status===(s.mode==='DEDUCTION'?'FAIL':'PASS')?line.configuredPoints:0):status==='NOT_APPLICABLE'?0:null;if(base.contribution!==expected||line.vetoTriggered&&status!=='FAIL')return false;
  if(['PASS','FAIL'].includes(status)?line.baseContribution==null||line.adjustment==null:status==='NOT_APPLICABLE'?line.baseContribution!==0||line.adjustment!==0:line.baseContribution!=null||line.adjustment!=null)return false;
 }
 const dims=new Set<string>();for(const d of a.dimensions){if(!object(d)||!text(d.code)||dims.has(d.code)||!object(d.coverage)||!['FINAL','PENDING','NOT_APPLICABLE'].includes(d.scoreStatus)||!['QUALIFIED','UNQUALIFIED','PENDING','NOT_APPLICABLE'].includes(d.conclusion)||typeof d.vetoTriggered!=='boolean'||!(d.finalScore==null||number(d.finalScore)&&d.finalScore>=0&&d.finalScore<=100))return false;dims.add(d.code);
  const lines=a.lines.filter(l=>l.dimensionCode===d.code),c=d.coverage;if(c.expected!==lines.length||c.completed!==lines.filter(l=>['PASS','FAIL'].includes(l.status)).length||c.notApplicable!==lines.filter(l=>l.status==='NOT_APPLICABLE').length||c.pending!==lines.filter(l=>['REVIEW_REQUIRED','ERROR','NOT_EVALUATED'].includes(l.status)).length||d.scoreStatus!==(c.pending>0?'PENDING':c.completed===0?'NOT_APPLICABLE':'FINAL')||!(d.scoreStatus==='FINAL'?number(d.rawScore)&&number(d.rawNumerator)&&number(d.rawDenominator)&&d.rawDenominator>0&&d.finalScore!=null:d.rawScore==null&&d.rawNumerator==null&&d.rawDenominator==null&&d.finalScore==null)||d.vetoTriggered!==lines.some(l=>l.vetoTriggered)||d.vetoTriggered&&(d.conclusion!=='UNQUALIFIED'||d.scoreStatus==='FINAL'&&d.finalScore!==0))return false;
 }
 if(a.lines.some(l=>l.dimensionCode!=null&&!dims.has(l.dimensionCode)))return false;
 return s.vetoTriggered===a.lines.some(l=>l.vetoTriggered)&&(s.vetoTriggered?s.conclusion==='UNQUALIFIED'&&(s.scoreStatus!=='FINAL'||s.finalScore===0):s.scoreStatus==='FINAL'?['QUALIFIED','UNQUALIFIED'].includes(s.conclusion):s.conclusion===s.scoreStatus);
}
function consistentReview(value:unknown,inputHash:string):boolean {
 if(value==null)return true;if(!object(value)||!['iqc-review-decision-v1','iqc-review-decision-v2'].includes(String(value.schemaVersion))||value.inputHash!==inputHash||!['REQUIRED','NOT_REQUIRED','UNKNOWN'].includes(String(value.status))||!Array.isArray(value.rules)||!value.rules.length||value.rules.length>100)return false;
 const exact=value.schemaVersion==='iqc-review-decision-v2';
 if(value.samplingInputHash!=null&&(!exact||typeof value.samplingInputHash!=='string'||!/^[a-f0-9]{64}$/.test(value.samplingInputHash)))return false;
 const knownIdentity=!exact||value.samplingInputHash!=null;
 const ids=new Set<string>();let required=false,unknown=false;
 for(const rule of value.rules){if(!object(rule)||!text(rule.ruleId)||ids.has(rule.ruleId)||!['MATCH','NO_MATCH','UNKNOWN'].includes(String(rule.conditionMatch))||!['MATCH','NO_MATCH','UNKNOWN'].includes(String(rule.confidenceMatch))||(knownIdentity? !count(rule.bucket)||rule.bucket>=10000||typeof rule.selected!=='boolean':rule.bucket!=null||!(rule.selected==null||typeof rule.selected==='boolean'))||typeof rule.suppressed!=='boolean'||!(rule.calibratedConfidence==null||number(rule.calibratedConfidence)&&rule.calibratedConfidence>=0&&rule.calibratedConfidence<=1))return false;ids.add(rule.ruleId);
  const match=rule.suppressed||rule.selected===false||rule.conditionMatch==='NO_MATCH'||rule.confidenceMatch==='NO_MATCH'?'NO_MATCH':rule.selected==null||rule.conditionMatch==='UNKNOWN'||rule.confidenceMatch==='UNKNOWN'?'UNKNOWN':'MATCH';if(rule.effectiveMatch!==match)return false;required||=match==='MATCH';unknown||=match==='UNKNOWN';
 }
 return required?value.status==='REQUIRED':unknown?['REQUIRED','UNKNOWN'].includes(String(value.status)):value.status==='NOT_REQUIRED';
}
export function parsePipelineExecutionTrace(raw:string|null|undefined):PipelineParseResult {
 if(!raw)return{status:'OTHER'};
 try {
  if(raw.length>5_000_000)return{status:'INVALID',message:'执行轨迹过大，无法可靠展示'};
  const v:unknown=JSON.parse(raw);
  if(!object(v)||v.schemaVersion!=='iqc-pipeline-execution-v1')return{status:'OTHER'};
  if(!text(v.inputHash)||!['PRODUCTION','EVALUATION'].includes(String(v.mode))||!['NONE','LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN'].includes(String(v.riskLevel))||!object(v.run)||!object(v.scoring))throw Error();
  const r=v.run,s=v.scoring;
  if(r.completionReason!=null && r.completionReason!=='POLICY_SATISFIED')throw Error();
  if(!['SUCCESS','PARTIAL_SUCCESS','FAILED','CANCELLED'].includes(String(r.status))||typeof r.reviewRequired!=='boolean'||!Array.isArray(r.trace)||r.trace.length>10_000||!r.trace.every(node)||!Array.isArray(r.findings)||!r.findings.every(finding)||!object(r.variables)||Object.keys(r.variables).some(k=>k.startsWith('__'))||!Array.isArray(v.fusion)||!v.fusion.every(fused))throw Error();
  if(!Array.isArray(v.items)||!v.items.every(i=>object(i)&&text(i.itemCode)&&text(i.name)&&typeof i.ruleId==='string'&&count(i.ruleVersionNo)&&(text(i.ruleId)&&i.ruleVersionNo>0||i.ruleId===''&&i.ruleVersionNo===0&&(v.fusion as FusedFinding[]).some(f=>f.rawFindings.some(raw=>(['METRIC','LLM','SKILL_API'].includes(raw.source.engineType)||raw.source.engineType==='SMALL_MODEL'&&raw.source.engineVersion==='small-model-v1'))))&&itemStatuses.includes(String(i.status))&&strings(i.matchedMessageIds)))throw Error();
  if(!['iqc-score-v2','iqc-score-v3'].includes(String(s.policyVersion))||!['DEDUCTION','POINTS'].includes(String(s.mode))||!['FINAL','PENDING','NOT_APPLICABLE'].includes(String(s.scoreStatus))||!['QUALIFIED','UNQUALIFIED','PENDING','NOT_APPLICABLE'].includes(String(s.conclusion))||typeof s.vetoTriggered!=='boolean'||!(s.finalScore==null||number(s.finalScore)&&s.finalScore>=0&&s.finalScore<=100)||!Array.isArray(s.lines)||!s.lines.every(l=>object(l)&&text(l.itemCode)&&itemStatuses.includes(String(l.status))&&count(l.configuredPoints)&&l.configuredPoints<=100&&(l.contribution==null||count(l.contribution))&&typeof l.vetoTriggered==='boolean')||!object(s.coverage)||!['expected','completed','notApplicable','pending'].every(k=>count((s.coverage as Record<string,unknown>)[k])))throw Error();
  const trace=v as unknown as PipelineTrace;
  const items=new Map(trace.items.map(i=>[i.itemCode,i]));
  if(items.size!==trace.items.length||new Set(trace.fusion.map(f=>f.code)).size!==trace.fusion.length||new Set(trace.scoring.lines.map(l=>l.itemCode)).size!==trace.scoring.lines.length||trace.scoring.lines.length!==items.size||trace.scoring.policyVersion==='iqc-score-v2'&&trace.scoring.lines.some(l=>items.get(l.itemCode)?.status!==l.status))throw Error();
  const c=trace.scoring.coverage;
  if(c.expected!==items.size||c.completed+c.notApplicable+c.pending!==c.expected||c.pending!==trace.scoring.lines.filter(i=>['REVIEW_REQUIRED','ERROR','NOT_EVALUATED'].includes(i.status)).length||c.completed!==trace.scoring.lines.filter(i=>['PASS','FAIL'].includes(i.status)).length||c.notApplicable!==trace.scoring.lines.filter(i=>i.status==='NOT_APPLICABLE').length||(s.scoreStatus==='FINAL')!==(s.finalScore!=null))throw Error();
  if(s.scoreStatus!==(c.pending>0?'PENDING':c.completed===0?'NOT_APPLICABLE':'FINAL'))throw Error();
  if(trace.scoring.policyVersion==='iqc-score-v3'?!consistentAdvanced(trace):trace.scoring.advanced!=null||!consistentScoring(trace.scoring))throw Error();
  if(!consistentReview(trace.reviewDecision,trace.inputHash))throw Error();
  return{status:'AVAILABLE',trace};
 }catch{return{status:'INVALID',message:'流水线轨迹格式无效，无法可靠展示执行数据'};}
}
