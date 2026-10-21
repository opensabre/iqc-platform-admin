import {afterEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,ref,type App} from 'vue';
import PipelineDependencyGraph from './PipelineDependencyGraph.vue';
import {dependencyGraph,type GraphNode} from './pipeline-dependency-graph';
function node(nodeId:string,dependsOn:string[]=[]):GraphNode{return {nodeId,name:nodeId,type:'RULE',dependsOn,enabled:true,onError:'FAIL_PIPELINE',fallbackNodeId:null,condition:null};}
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();});
describe('pipeline dependency visualization',()=>{
  it('shows independent branches at equal depth and their joined dependency',()=>{
    const graph=dependencyGraph([node('root'),node('left',['root']),node('right',['root']),node('join',['left','right'])]);
    expect(graph.errors).toEqual([]);expect(graph.edges).toHaveLength(4);
    expect(graph.positions[1].x).toBe(graph.positions[2].x);
    expect(graph.positions[1].y).not.toBe(graph.positions[2].y);
    expect(graph.positions[3].x).toBeGreaterThan(graph.positions[1].x);
  });
  it('distinguishes dormant fallback paths and rejects invalid references',()=>{
    const source={...node('source'),onError:'FALLBACK' as const,fallbackNodeId:'fallback'};
    const graph=dependencyGraph([source,{...node('fallback'),enabled:false}]);
    expect(graph.errors).toEqual([]);expect(graph.edges[0].fallback).toBe(true);
    expect(dependencyGraph([node('first',['later']),node('later')]).errors.length).toBeGreaterThan(0);
    expect(dependencyGraph([node('same'),node('same')]).errors.length).toBeGreaterThan(0);
    expect(dependencyGraph([source,node('fallback')]).errors.length).toBeGreaterThan(0);
  });
  it('opens nodes with click and keyboard and updates invalid edited graphs',async()=>{
    const nodes=ref([node('first'),node('second',['first'])]);const select=vi.fn();
    host=document.createElement('div');document.body.append(host);
    app=createApp(defineComponent({setup:()=>()=>h(PipelineDependencyGraph,{nodes:nodes.value,onSelect:select})}));
    app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',String(p.message))}));
    app.mount(host);await nextTick();
    // Connections are keyboard buttons too; node activation targets only node groups.
    const buttons=host.querySelectorAll('g.graph-node[role="button"]');expect(buttons).toHaveLength(2);
    expect(host.querySelectorAll('g[aria-label^="选择依赖连接"]')).toHaveLength(1);
    buttons[1].dispatchEvent(new MouseEvent('click',{bubbles:true}));expect(select).toHaveBeenLastCalledWith(1);
    buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));expect(select).toHaveBeenLastCalledWith(0);
    nodes.value=[node('first',['missing'])];await nextTick();
    // Invalid references remain visible for repair without rendering a phantom edge.
    expect(host.querySelector('svg')).not.toBeNull();expect(host.textContent).toContain('依赖须指向前序节点');
    const remaining=host.querySelectorAll('g.graph-node[role="button"]');
    expect(remaining).toHaveLength(1);
    expect(host.querySelectorAll('g[aria-label^="选择依赖连接"]')).toHaveLength(0);
    remaining[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    expect(select).toHaveBeenLastCalledWith(0);
  });
});
