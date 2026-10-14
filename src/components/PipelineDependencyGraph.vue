<script setup lang="ts">
import {computed,useId} from 'vue';
import {dependencyGraph,type GraphNode} from './pipeline-dependency-graph';
const props=defineProps<{nodes:GraphNode[]}>();
const emit=defineEmits<{select:[index:number]}>();
const graph=computed(()=>dependencyGraph(props.nodes));
const arrow=`pipeline-arrow-${useId().replace(/[^A-Za-z0-9_-]/g,'')}`;
function path(source:number,target:number){
  const a=graph.value.positions[source],b=graph.value.positions[target];
  const x=a.x+200,y=a.y+38,tx=b.x,ty=b.y+38;
  return `M${x},${y} C${x+30},${y} ${tx-30},${ty} ${tx},${ty}`;
}
</script>
<template>
  <section class="dependency-graph" aria-label="流水线依赖图">
    <p>实线表示依赖，虚线表示失败后的备用路径。点击节点可打开配置；同列表示相同依赖深度，实际并发仍受执行模式与容量约束。</p>
    <a-alert v-if="graph.errors.length" type="warning" :message="graph.errors.join('；')"/>
    <p v-else-if="!nodes.length">添加节点后显示依赖图。</p>
    <div v-else class="graph-scroll">
      <svg :width="graph.width" :height="graph.height" :viewBox="`0 0 ${graph.width} ${graph.height}`" role="group" aria-label="节点及执行路径">
        <defs><marker :id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="currentColor"/></marker></defs>
        <path v-for="(edge,index) in graph.edges" :key="index" :d="path(edge.source,edge.target)" class="edge" :class="{'fallback-edge':edge.fallback}" :marker-end="`url(#${arrow})`"><title>{{edge.fallback?'备用':'依赖'}}：{{nodes[edge.source].nodeId}} → {{nodes[edge.target].nodeId}}</title></path>
        <g v-for="position in graph.positions" :key="position.index" :transform="`translate(${position.x},${position.y})`" class="graph-node" :class="{'inactive-node':!position.node.enabled}" role="button" tabindex="0" :aria-label="`配置节点 ${position.node.name} (${position.node.nodeId})`" @click="emit('select',position.index)" @keydown.enter="emit('select',position.index)" @keydown.space.prevent="emit('select',position.index)">
          <title>{{position.node.name}} · {{position.node.nodeId}} · {{position.node.type}}{{position.node.condition?' · 条件执行':''}}{{position.node.enabled?'':' · 停用/备用'}}</title>
          <rect width="200" height="80" rx="8"/>
          <text x="12" y="24">{{position.node.name.length>18?position.node.name.slice(0,18)+'…':position.node.name}}</text>
          <text x="12" y="45" class="node-id">{{position.node.nodeId.length>24?position.node.nodeId.slice(0,24)+'…':position.node.nodeId}}</text>
          <text x="12" y="65" class="node-kind">{{position.node.type}}{{position.node.condition?' · 条件':''}}{{position.node.enabled?'':' · 停用/备用'}}</text>
        </g>
      </svg>
    </div>
  </section>
</template>
<style scoped>
.graph-scroll{overflow:auto;border:1px solid #d9d9d9;border-radius:8px;max-height:640px}.edge{fill:none;stroke:currentColor;stroke-width:1.5;color:#687b8e}.fallback-edge{stroke-dasharray:6 4;color:#b07816}.graph-node{cursor:pointer}.graph-node rect{fill:var(--iqc-graph-fill,#f5f9ff);stroke:#1677ff;stroke-width:1.5}.graph-node:focus rect{stroke-width:3}.graph-node text{font-size:13px;fill:#183153}.graph-node .node-id,.graph-node .node-kind{font-size:11px;fill:#52667b}.inactive-node rect{stroke:#8c8c8c;stroke-dasharray:4 3;fill:#fafafa}
</style>
