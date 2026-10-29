import type {PipelineNode} from '@/api/pipelines';

export type GraphNode=Pick<PipelineNode,'nodeId'|'name'|'type'|'dependsOn'|'enabled'|'onError'|'fallbackNodeId'|'condition'>;
export function dependencyGraph(nodes:GraphNode[]){
  const errors:string[]=[],ids=new Map<string,number>(),ranks:number[]=[];
  if(nodes.length>200)errors.push('依赖图最多显示200个节点');
  nodes.forEach((node,index)=>{
    if(!node.nodeId.trim()||ids.has(node.nodeId))errors.push(`节点 ${index+1} 的编码为空或重复`);
    ids.set(node.nodeId,index);
  });
  const edges:Array<{source:number;target:number;fallback:boolean}>=[];
  nodes.forEach((node,index)=>{
    ranks[index]=0;
    for(const id of node.dependsOn){
      const source=ids.get(id);
      if(source===undefined||source>=index){errors.push(`节点 ${node.nodeId} 的依赖须指向前序节点：${id}`);continue;}
      ranks[index]=Math.max(ranks[index],ranks[source]+1);edges.push({source,target:index,fallback:false});
    }
    if(node.onError==='FALLBACK'){
      const target=ids.get(node.fallbackNodeId??'');
      if(target===undefined||target===index||nodes[target].enabled||nodes[target].onError==='FALLBACK'||nodes[target].dependsOn.some(id=>!node.dependsOn.includes(id)))errors.push(`节点 ${node.nodeId} 的备用路径无效`);
      else edges.push({source:index,target,fallback:true});
    }
  });
  // Place dormant fallback nodes near their owning source, independently of normal execution dependencies.
  for(const edge of edges)if(edge.fallback)ranks[edge.target]=Math.max(ranks[edge.target],ranks[edge.source]+1);
  const rows=new Map<number,number>();
  const positions=nodes.map((node,index)=>{
    const row=rows.get(ranks[index])??0;rows.set(ranks[index],row+1);
    return {node,index,x:24+ranks[index]*244,y:24+row*112};
  });
  return {errors,positions,edges,width:Math.max(480,Math.max(0,...ranks)*244+268),height:Math.max(160,Math.max(0,...rows.values())*112+32)};
}

export interface GraphEdgeCommand {sourceId:string;targetId:string;fallback:boolean}
/** Edits the existing graph representation and preserves every draft/configuration field. */
export function editGraphEdge<T extends GraphNode>(nodes:T[],edge:GraphEdgeCommand,remove=false):T[]{
  const ids=nodes.map(node=>node.nodeId);
  if(nodes.length>200||ids.some(id=>!id.trim())||new Set(ids).size!==ids.length)throw Error('请先修正节点数量及空或重复编码');
  const source=ids.indexOf(edge.sourceId),target=ids.indexOf(edge.targetId);
  if(source<0||target<0)throw Error('连接的节点已删除或重命名');
  if(!remove && source===target)throw Error('节点不能连接自身');
  let changed:T[];
  if(edge.fallback){
    if(remove){
      if(nodes[source].onError!=='FALLBACK'||nodes[source].fallbackNodeId!==edge.targetId)throw Error('备用连接已变化，请重新选择');
      changed=nodes.map((node,index)=>index===source?{...node,onError:'FAIL_PIPELINE',fallbackNodeId:null}:node);
    }else{
      if(!nodes[source].enabled||nodes[target].enabled||nodes[target].onError==='FALLBACK'||nodes[target].dependsOn.some(id=>!nodes[source].dependsOn.includes(id)))throw Error('备用路径须从启用节点连接到停用、非递归且依赖可用的节点');
      if(nodes[source].onError==='FALLBACK'&&nodes[source].fallbackNodeId===edge.targetId)throw Error('该备用连接已存在');
      changed=nodes.map((node,index)=>index===source?{...node,onError:'FALLBACK',fallbackNodeId:edge.targetId}:node);
    }
  }else{
    const exists=nodes[target].dependsOn.includes(edge.sourceId);
    if(remove&&!exists)throw Error('依赖连接已变化，请重新选择');
    if(!remove&&(source>=target||!nodes[source].enabled||exists))throw Error('依赖必须来自启用的前序节点，且不能重复或形成循环');
    changed=nodes.map((node,index)=>index===target?{...node,dependsOn:remove?node.dependsOn.filter(id=>id!==edge.sourceId):[...node.dependsOn,edge.sourceId]}:node);
  }
  const before=new Set(dependencyGraph(nodes).errors);
  const introduced=dependencyGraph(changed).errors.filter(error=>!before.has(error));
  if(introduced.length)throw Error(introduced.join('；'));
  return changed;
}
