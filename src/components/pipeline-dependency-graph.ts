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
