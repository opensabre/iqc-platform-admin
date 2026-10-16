import type {ParallelCompletionPolicy,PipelineNode} from '@/api/pipelines';
import {selectorJsonNeedsExactEditor} from '@/api/selectors';
export const completionOperators=['EXISTS','EQUALS','NOT_EQUALS','GREATER_OR_EQUAL','LESS_OR_EQUAL','GREATER_THAN','LESS_THAN'] as const;
export function completionValue(raw:string):unknown {
  if(selectorJsonNeedsExactEditor(raw))throw Error('比较值含浏览器无法精确保留的数值，请使用精确JSON接口，不能自动舍入');
  return JSON.parse(raw);
}
/** Mirrors the existing backend ownership contract; the server remains authoritative. */
export function validateParallelCompletionPolicy(policy:ParallelCompletionPolicy,nodes:PipelineNode[]):ParallelCompletionPolicy {
  if(!Array.isArray(policy.requiredNodes)||!policy.requiredNodes.length||policy.requiredNodes.length>200||new Set(policy.requiredNodes).size!==policy.requiredNodes.length)throw Error('请选择1至200个不同的必需成功节点');
  const enabled=new Map(nodes.filter(node=>node.enabled).map(node=>[node.nodeId,node]));
  if(policy.requiredNodes.some(id=>!enabled.has(id)))throw Error('必需节点已删除、重命名或停用，请明确调整策略');
  const condition=policy.condition;
  if(!condition)return {requiredNodes:[...policy.requiredNodes],condition:null};
  if(!completionOperators.includes(condition.operator))throw Error('提前满足比较方式无效');
  if(typeof condition.pointer!=='string'||!condition.pointer.startsWith('/')||/~(?:[^01]|$)/.test(condition.pointer))throw Error('条件路径须为有效JSON Pointer');
  if(condition.operator!=='EXISTS'&&condition.value==null)throw Error('请填写比较值');
  if(['GREATER_OR_EQUAL','LESS_OR_EQUAL','GREATER_THAN','LESS_THAN'].includes(condition.operator)&&(typeof condition.value!=='number'||!Number.isFinite(condition.value)))throw Error('大小比较须使用JSON数值');
  const [root,key]=condition.pointer.slice(1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));
  if(root!=='input') {
    if(!key||!['variables','upstream'].includes(root))throw Error('条件只能读取原输入或必需节点的具体输出');
    const producers=new Set<string>();
    if(root==='upstream')producers.add(key);
    else for(const node of enabled.values()) {
      const outputs=[node];
      const fallback=nodes.find(row=>row.nodeId===node.fallbackNodeId);
      if(node.onError==='FALLBACK'&&fallback)outputs.push(fallback);
      if(outputs.some(row=>Object.hasOwn((row.outputSchema?.properties as Record<string,unknown>)||{},key)))producers.add(node.nodeId);
    }
    if(producers.size!==1||![...producers].every(id=>policy.requiredNodes.includes(id)))throw Error('条件输出须由一个必需成功节点声明生产');
  }
  return {requiredNodes:[...policy.requiredNodes],condition:{...condition,value:condition.operator==='EXISTS'?null:completionValue(JSON.stringify(condition.value,(_key,value)=>{if(typeof value==='number'&&!Number.isFinite(value))throw Error('比较值必须是有限JSON数值');return value;}))}};
}
