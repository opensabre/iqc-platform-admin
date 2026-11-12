import { afterEach, describe, expect, it } from "vitest";
import { createApp, h, nextTick, reactive, type App } from "vue";
import Antd from "ant-design-vue";
import Selector from "./TaskEngineSelector.vue";
import type { TaskEngineConfiguration } from "@/api/tasks";
let app:App, root:HTMLDivElement;
afterEach(() => { app?.unmount();root?.remove(); });
describe("task engine names", () => {
  it("retains explicit zero temperature and task-local prompt/timeout on input", async () => {
    const state=reactive<{configuration:TaskEngineConfiguration}>({configuration:{schemaVersion:"iqc-task-processing-v1",inspection:{engines:[
      {id:"llm1",name:"模型判断",type:"LLM",parameters:{prompt:"检查退款",temperature:0.5,timeoutSeconds:30}}]}}});
    root=document.createElement("div");document.body.append(root);
    app=createApp({render:()=>h(Selector,{modelValue:state.configuration,rules:[],agents:[],inspectionTargets:[],labelingTargets:[],
      "onUpdate:modelValue":value=>{state.configuration=value;}})}).use(Antd);app.mount(root);await nextTick();
    const input=root.querySelector<HTMLInputElement>('[aria-label="质检第1个引擎温度"]')!;
    input.value="0";input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));await nextTick();
    expect(state.configuration.inspection!.engines[0]!.parameters).toEqual({prompt:"检查退款",temperature:0,timeoutSeconds:30});
  });
  it("retains names with stable identities when engines are reordered", async () => {
    const state=reactive<{configuration:TaskEngineConfiguration}>({configuration:{schemaVersion:"iqc-task-processing-v1",inspection:{engines:[
      {id:"engine1",name:"退款正则",type:"REGEX",parameters:{}}, {id:"engine2",name:"服务规则",type:"REGEX",parameters:{}}]}}});
    root=document.createElement("div");document.body.append(root);
    app=createApp({render:()=>h(Selector,{modelValue:state.configuration, rules:[],agents:[],inspectionTargets:[],labelingTargets:[],
      "onUpdate:modelValue":value=>{state.configuration=value;}})}).use(Antd);app.mount(root);await nextTick();
    const input=root.querySelector<HTMLInputElement>('[aria-label="质检第1个引擎名称"]')!;
    input.value="退款用语";input.dispatchEvent(new Event("input",{bubbles:true}));await nextTick();
    root.querySelector<HTMLButtonElement>('[aria-label="质检第1个引擎下移"]')!.click();await nextTick();
    expect(state.configuration.inspection!.engines.map(engine=>[engine.id,engine.name])).toEqual([["engine2","服务规则"],["engine1","退款用语"]]);
  });
});
