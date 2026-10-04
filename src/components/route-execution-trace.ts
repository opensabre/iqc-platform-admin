import type {RouteExecutionTrace,RouteTraceNode,TraceFinding} from '@/api/results';
export type TraceParseResult = {status:'AVAILABLE';trace:RouteExecutionTrace;rounds:Array<{runIndex:number;nodes:RouteTraceNode[]}>}|{status:'MISSING'|'INVALID'|'UNSUPPORTED';message:string};
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const text=(v:unknown)=>typeof v==='string'&&v.length>0;
const nullable=(v:unknown)=>v==null||typeof v==='string';
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
function finding(v:unknown):v is TraceFinding {
 if(!obj(v)||!['id','code','category'].every(k=>text(v[k]))||!['KNOWN','UNKNOWN','CONFLICT','ERROR','NOT_EVALUATED'].includes(String(v.state))||!['BOOLEAN','STRING','NUMBER','ENUM','OBJECT'].includes(String(v.valueType))||!['NONE','LOW','MEDIUM','HIGH','CRITICAL'].includes(String(v.severity))||!nullable(v.reason)||!(v.confidence==null||typeof v.confidence==='number'&&v.confidence>=0&&v.confidence<=1)||!Array.isArray(v.evidence)||!v.evidence.every(e=>obj(e)&&text(e.id)&&text(e.reference)&&['CONVERSATION','RULE_MATCH','METRIC','KNOWLEDGE','BUSINESS_FIELD','EXTERNAL_RESULT'].includes(String(e.type)))||!obj(v.source))return false;
 const source=v.source;
 if(!['nodeId','engineType','engineVersion'].every(k=>text(source[k]))||!integer(source.runIndex)||!nullable(source.inputHash))return false;
 if(v.state!=='KNOWN')return v.value==null;
 switch(v.valueType){case 'BOOLEAN':return typeof v.value==='boolean';case 'STRING':case 'ENUM':return typeof v.value==='string';case 'NUMBER':return typeof v.value==='number'&&Number.isFinite(v.value);case 'OBJECT':return obj(v.value);default:return false;}
}
function node(v:unknown):v is RouteTraceNode {
 if(!obj(v)||!['nodeId','ruleId','engineType','phase','inputScope','resultStatus'].every(k=>text(v[k]))||!integer(v.runIndex)||!integer(v.ruleVersion)||typeof v.executed!=='boolean'||!['SUCCESS','FAILED','SKIPPED'].includes(String(v.executionStatus))||!['POSITIVE','NEGATIVE','UNKNOWN','ERROR','NOT_EVALUATED'].includes(String(v.factState))||typeof v.durationNanos!=='number'||!Number.isFinite(v.durationNanos)||v.durationNanos<0||!['reason','inputHash','startedAt','upstreamNodeId'].every(k=>nullable(v[k]))||!['rawFindingParseError','evidenceParseError'].every(k=>v[k]===undefined||typeof v[k]==='boolean')||!(v.findings===undefined||Array.isArray(v.findings)&&v.findings.every(finding)))return false;
 if(!v.executed&&(v.executionStatus!=='SKIPPED'||v.factState!=='NOT_EVALUATED'||v.durationNanos!==0)||v.executed&&v.executionStatus==='SKIPPED')return false;
 return !(Array.isArray(v.findings)&&v.findings.some(f=>f.source.nodeId!==v.nodeId||f.source.runIndex!==v.runIndex||f.source.engineType!==v.engineType||!v.executed&&f.state==='KNOWN'));
}
export function parseRouteExecutionTrace(raw:string|null|undefined):TraceParseResult {
 if(raw==null||raw.trim()==='')return{status:'MISSING',message:'此执行未记录节点轨迹'};
 try{if(raw.length>5_000_000)throw Error();const data:unknown=JSON.parse(raw);if(!obj(data))throw Error();
 if(data.schemaVersion!=='iqc-route-execution-trace-v1'||data.findingSchemaVersion!==undefined&&data.findingSchemaVersion!=='iqc-finding-v1')return{status:'UNSUPPORTED',message:'当前页面不支持此轨迹版本，无法展示执行数据'};
 if(!['taskId','executionId','conversationId','planSchemaVersion','inputHash','ruleSnapshotHash'].every(k=>text(data[k]))||!nullable(data.agentSnapshotHash)||!Array.isArray(data.nodes)||data.nodes.length>10_000||!data.nodes.every(node))throw Error();
 const keys=data.nodes.map(n=>`${n.runIndex}:${n.nodeId}`);if(new Set(keys).size!==keys.length)throw Error();
 const trace=data as unknown as RouteExecutionTrace;const groups=new Map<number,RouteTraceNode[]>();trace.nodes.forEach(n=>groups.set(n.runIndex,[...(groups.get(n.runIndex)??[]),n]));
 return{status:'AVAILABLE',trace,rounds:[...groups].sort(([a],[b])=>a-b).map(([runIndex,nodes])=>({runIndex,nodes}))};
 }catch{return{status:'INVALID',message:'节点轨迹格式无效，无法可靠展示执行数据'};}
}
export const traceJson=(v:unknown)=>v==null?'未记录':JSON.stringify(v,null,2);
export const traceStateLabel=(state:string)=>({KNOWN:'已知',UNKNOWN:'未知，待确认',CONFLICT:'事实冲突',ERROR:'检测错误',NOT_EVALUATED:'未评估',POSITIVE:'显式阳性',NEGATIVE:'显式阴性'} as Record<string,string>)[state]??state;
