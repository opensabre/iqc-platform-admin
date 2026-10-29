<script setup lang="ts">
import {computed,nextTick,ref,useId,watch} from 'vue';
import {dependencyGraph,type GraphNode,type GraphEdgeCommand} from './pipeline-dependency-graph';
const props=defineProps<{nodes:GraphNode[];disabled?:boolean}>();
const emit=defineEmits<{select:[index:number];connect:[edge:GraphEdgeCommand];disconnect:[edge:GraphEdgeCommand]}>();
type Point={x:number;y:number};
const manualPositions=ref(new Map<string,Point>()),zoom=ref(1);
const graph=computed(()=>{
 const layout=dependencyGraph(props.nodes);
 const positions=layout.positions.map(position=>({...position,...manualPositions.value.get(position.node.nodeId)}));
 return {...layout,positions,width:Math.max(layout.width,...positions.map(position=>position.x+224)),height:Math.max(layout.height,...positions.map(position=>position.y+104))};
});
const svg=ref<SVGSVGElement>();
const sourceId=ref<string>(),targetId=ref<string>(),edgeType=ref<'DEPENDENCY'|'FALLBACK'>('DEPENDENCY');
const fallback=computed(()=>edgeType.value==='FALLBACK');
const dragging=ref<{sourceId:string;x:number;y:number}>();
const moving=ref<{nodeId:string;pointerId:number;start:Point;origin:Point;moved:boolean}>();
let movedNode:string|undefined;
function cancelInteraction(){dragging.value=undefined;moving.value=undefined;}
function bounded(point:Point):Point{return {x:Math.max(24,Math.min(65536,point.x)),y:Math.max(24,Math.min(65536,point.y))};}
function placeNode(nodeId:string,point:Point){
 if(props.disabled||!props.nodes.some(node=>node.nodeId===nodeId)||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
 manualPositions.value.set(nodeId,bounded(point));
}
function resetLayout(){if(props.disabled)return;cancelInteraction();manualPositions.value.clear();}
function startMove(event:PointerEvent,nodeId:string){
 movedNode=undefined;
 if(props.disabled||event.button!==0)return;
 const point=coordinate(event),position=graph.value.positions.find(row=>row.node.nodeId===nodeId);if(!point||!position)return;
 event.preventDefault();(event.currentTarget as Element).setPointerCapture(event.pointerId);
 dragging.value=undefined;moving.value={nodeId,pointerId:event.pointerId,start:point,origin:{x:position.x,y:position.y},moved:false};
}
function movePointer(event:PointerEvent){
 moveConnection(event);
 const pending=moving.value;if(props.disabled||!pending||pending.pointerId!==event.pointerId)return;
 const point=coordinate(event);if(!point)return;
 const dx=point.x-pending.start.x,dy=point.y-pending.start.y;
 if(!pending.moved&&Math.hypot(dx,dy)*zoom.value<4)return;
 pending.moved=true;placeNode(pending.nodeId,{x:pending.origin.x+dx,y:pending.origin.y+dy});
}
function finishPointer(event:PointerEvent){
 const pending=moving.value;
 if(pending&&pending.pointerId===event.pointerId){moving.value=undefined;if(pending.moved)movedNode=pending.nodeId;return;}
 finishConnection(event);
}
function selectNode(event:MouseEvent,index:number,nodeId:string){
 if(event.detail>0&&movedNode===nodeId){movedNode=undefined;return;}
 movedNode=undefined;emit('select',index);
}
function moveByKey(event:KeyboardEvent,nodeId:string){
 if(props.disabled||!event.ctrlKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
 event.preventDefault();const position=graph.value.positions.find(row=>row.node.nodeId===nodeId);if(!position)return;
 const step=event.shiftKey?48:16;
 placeNode(nodeId,{x:position.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:position.y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)});
 const element=event.currentTarget as Element|null;
 void nextTick(()=>{if(element?.isConnected)element.scrollIntoView({block:'nearest',inline:'nearest'});});
}
function zoomBy(delta:number){zoom.value=Math.max(0.25,Math.min(1.5,zoom.value+delta));}

const options=computed(()=>props.nodes.map(node=>({value:node.nodeId,label:`${node.name} (${node.nodeId})`})));
watch(()=>props.disabled,disabled=>{if(disabled)cancelInteraction();});
watch(()=>props.nodes.map(node=>node.nodeId).join('\0'),()=>{
 cancelInteraction();movedNode=undefined;
 const ids=new Set(props.nodes.map(node=>node.nodeId));
 for(const id of manualPositions.value.keys())if(!ids.has(id))manualPositions.value.delete(id);
 if(!props.nodes.some(node=>node.nodeId===sourceId.value))sourceId.value=undefined;
 if(!props.nodes.some(node=>node.nodeId===targetId.value))targetId.value=undefined;
});
function coordinate(event:Pick<MouseEvent,'clientX'|'clientY'>){
 const matrix=svg.value?.getScreenCTM();if(!matrix||!svg.value)return;
 const point=svg.value.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
 return point.matrixTransform(matrix.inverse());
}
function startConnection(event:PointerEvent,id:string){
 if(props.disabled||event.button!==0)return;
 const point=coordinate(event);if(!point)return;
 (event.currentTarget as Element).setPointerCapture(event.pointerId);
 moving.value=undefined;dragging.value={sourceId:id,x:point.x,y:point.y};
}
function moveConnection(event:PointerEvent){
 if(props.disabled||!dragging.value)return;
 const point=coordinate(event);if(point)dragging.value={...dragging.value,x:point.x,y:point.y};
}
function finishConnection(event:PointerEvent){
 const pending=dragging.value;dragging.value=undefined;
 if(props.disabled||!pending)return;
 const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-input-node]')?.getAttribute('data-input-node');
 if(target)emit('connect',{sourceId:pending.sourceId,targetId:target,fallback:fallback.value});
}
function formConnection(remove=false){
 if(props.disabled||!sourceId.value||!targetId.value)return;
 const edge={sourceId:sourceId.value,targetId:targetId.value,fallback:fallback.value};
 if(remove)emit('disconnect',edge);else emit('connect',edge);
}
function selectEdge(source:number,target:number,isFallback:boolean){
 sourceId.value=props.nodes[source].nodeId;targetId.value=props.nodes[target].nodeId;edgeType.value=isFallback?'FALLBACK':'DEPENDENCY';
}
const pendingPath=computed(()=>{
 const pending=dragging.value;if(!pending)return '';
 const position=graph.value.positions.find(row=>row.node.nodeId===pending.sourceId);if(!position)return '';
 return `M${position.x+200},${position.y+38} L${pending.x},${pending.y}`;
});
defineExpose({dropPosition:coordinate,placeNode});
const arrow=`pipeline-arrow-${useId().replace(/[^A-Za-z0-9_-]/g,'')}`;
function path(source:number,target:number){
  const a=graph.value.positions[source],b=graph.value.positions[target];
  const x=a.x+200,y=a.y+38,tx=b.x,ty=b.y+38;
  return `M${x},${y} C${x+30},${y} ${tx-30},${ty} ${tx},${ty}`;
}
</script>
<template>
  <section class="dependency-graph" aria-label="流水线依赖图">
    <p>实线表示依赖，虚线表示失败后的备用路径。点击节点可打开配置；自动布局按依赖深度排列，实际并发受执行模式与容量约束。拖动右侧输出端口到目标的左侧输入端口可创建实际连接；也可使用下面的表单和键盘。</p>
    <a-space wrap class="connection-controls">
      <a-select v-model:value="sourceId" aria-label="连接源节点" placeholder="源节点" :options="options" :disabled="disabled" style="min-width:170px"/>
      <a-select v-model:value="targetId" aria-label="连接目标节点" placeholder="目标节点" :options="options" :disabled="disabled" style="min-width:170px"/>
      <a-select v-model:value="edgeType" aria-label="连接类型" :options="[{value:'DEPENDENCY',label:'依赖'},{value:'FALLBACK',label:'失败后备用（设置/替换）'}]" :disabled="disabled" style="min-width:220px"/>
      <a-button :disabled="disabled || !sourceId || !targetId" @click="formConnection()">添加连接</a-button>
      <a-button danger :disabled="disabled || !sourceId || !targetId" @click="formConnection(true)">{{fallback?'移除备用并恢复失败停止策略':'移除依赖'}}</a-button>
    </a-space>
    <p>依赖仍须指向前序节点；移除依赖不会自动修改输入映射或提前满足策略，保存/发布时需修正失效引用。移除备用保留原重试次数。</p>
    <a-space wrap class="layout-controls">
      <a-button aria-label="缩小画布" :disabled="zoom<=0.25" @click="zoomBy(-0.25)">−</a-button>
      <a-button aria-label="恢复100%缩放" @click="zoom=1">{{Math.round(zoom*100)}}%</a-button>
      <a-button aria-label="放大画布" :disabled="zoom>=1.5" @click="zoomBy(0.25)">＋</a-button>
      <a-button :disabled="disabled || !manualPositions.size" @click="resetLayout">恢复自动布局</a-button>
    </a-space>
    <p>拖动节点可调整画布位置；聚焦节点后按 Ctrl＋方向键移动，按住 Shift 加大步长。布局保留到本次编辑结束，重新打开按依赖自动排布；执行顺序由依赖与运行模式决定。</p>
    <a-alert v-if="graph.errors.length" type="warning" :message="graph.errors.join('；')"/>
    <p v-if="!nodes.length">添加节点后显示依赖图。</p>
    <div v-if="nodes.length<=200" class="graph-scroll">
      <svg ref="svg" @pointermove="movePointer" @pointerup="finishPointer" @pointercancel="cancelInteraction" @lostpointercapture="cancelInteraction" :width="graph.width*zoom" :height="graph.height*zoom" :viewBox="`0 0 ${graph.width} ${graph.height}`" role="group" aria-label="节点及执行路径">
        <defs><marker :id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>
        <g v-for="(edge,index) in graph.edges" :key="index" role="button" tabindex="0" :aria-label="`选择${edge.fallback?'备用':'依赖'}连接 ${nodes[edge.source].nodeId} 到 ${nodes[edge.target].nodeId}`" @click.stop="selectEdge(edge.source,edge.target,edge.fallback)" @keydown.enter="selectEdge(edge.source,edge.target,edge.fallback)" @keydown.space.prevent="selectEdge(edge.source,edge.target,edge.fallback)">
          <title>{{edge.fallback?'备用':'依赖'}}：{{nodes[edge.source].nodeId}} → {{nodes[edge.target].nodeId}}；选择后可用表单移除</title>
          <path :d="path(edge.source,edge.target)" class="edge-hit"/>
          <path :d="path(edge.source,edge.target)" class="edge" :class="{'fallback-edge':edge.fallback}" :marker-end="`url(#${arrow})`"/>
        </g>
        <path v-if="dragging" :d="pendingPath" class="edge pending-edge"/>
        <g v-for="position in graph.positions" :key="position.index" :transform="`translate(${position.x},${position.y})`" class="graph-node" :class="{'inactive-node':!position.node.enabled,'moving-node':moving?.nodeId===position.node.nodeId,'readonly-node':disabled}" role="button" tabindex="0" :aria-label="`配置节点 ${position.node.name} (${position.node.nodeId})`" @pointerdown="startMove($event,position.node.nodeId)" @click="selectNode($event,position.index,position.node.nodeId)" @keydown="moveByKey($event,position.node.nodeId)" @keydown.enter="emit('select',position.index)" @keydown.space.prevent="emit('select',position.index)">
          <title>{{position.node.name}} · {{position.node.nodeId}} · {{position.node.type}}{{position.node.condition?' · 条件执行':''}}{{position.node.enabled?'':' · 停用/备用'}}</title>
          <rect width="200" height="80" rx="8"/>
          <circle cx="0" cy="38" r="8" class="port input-port" @pointerdown.stop :data-input-node="position.node.nodeId"><title>输入：{{position.node.nodeId}}</title></circle>
          <circle v-if="!disabled" cx="200" cy="38" r="8" class="port output-port" @pointerdown.stop.prevent="startConnection($event,position.node.nodeId)" @click.stop><title>拖动到目标输入端口</title></circle>
          <text x="12" y="24">{{position.node.name.length>18?position.node.name.slice(0,18)+'…':position.node.name}}</text>
          <text x="12" y="45" class="node-id">{{position.node.nodeId.length>24?position.node.nodeId.slice(0,24)+'…':position.node.nodeId}}</text>
          <text x="12" y="65" class="node-kind">{{position.node.type}}{{position.node.condition?' · 条件':''}}{{position.node.enabled?'':' · 停用/备用'}}</text>
        </g>
      </svg>
    </div>
  </section>
</template>
<style scoped>
.connection-controls,.layout-controls{margin-bottom:8px}.graph-scroll svg{display:block;max-width:none}.port{fill:#fff;stroke:#1677ff;stroke-width:2}.output-port{cursor:crosshair;touch-action:none}.edge-hit{fill:none;stroke:transparent;stroke-width:14;cursor:pointer}.pending-edge{pointer-events:none;stroke-dasharray:4 3}.graph-scroll{overflow:auto;border:1px solid #d9d9d9;border-radius:8px;max-height:640px}.edge{fill:none;stroke:currentColor;stroke-width:1.5;color:#687b8e}.fallback-edge{stroke-dasharray:6 4;color:#b07816}.graph-node{cursor:grab;touch-action:none;user-select:none}.moving-node{cursor:grabbing}.readonly-node{cursor:pointer}.graph-node rect{fill:var(--iqc-graph-fill,#f5f9ff);stroke:#1677ff;stroke-width:1.5}.graph-node:focus rect{stroke-width:3}.graph-node text{font-size:13px;fill:#183153}.graph-node .node-id,.graph-node .node-kind{font-size:11px;fill:#52667b}.inactive-node rect{stroke:#8c8c8c;stroke-dasharray:4 3;fill:#fafafa}
</style>
