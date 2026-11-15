// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, reactive, type App } from "vue";
import Antd from "ant-design-vue";
import RuleLabelUsage from "./RuleLabelUsage.vue";
import { listLabelsUsingRule } from "@/api/labels";
vi.mock("@/api/labels",()=>({listLabelsUsingRule:vi.fn()}));
let app:App, root:HTMLDivElement;
const row = {id:"label",name:"退款诉求",code:"REFUND",groupId:"group",targetRole:"all",weight:1,status:"PUBLISHED",versionNo:3,sourceType:"MANUAL"};
const page = {records:[row],current:1,size:20,total:21};
async function settle(){for(let i=0;i<10;i++){await Promise.resolve();await nextTick();}}
function mount(){const props=reactive({ruleId:"rule"});root=document.createElement("div");document.body.append(root);app=createApp({render:()=>h(RuleLabelUsage,props)}).use(Antd);app.mount(root);return props;}
function button(text:string){return [...root.querySelectorAll("button")].find(b=>b.textContent?.replace(/\s/g,"").includes(text))!;}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(listLabelsUsingRule).mockResolvedValue(page);});
afterEach(()=>{app?.unmount();root?.remove();});
it("shows visible label metadata and requests another page through the existing API",async()=>{
  mount();await settle();expect(listLabelsUsingRule).toHaveBeenCalledWith("rule",1,20);
  expect(root.textContent).toContain("退款诉求");expect(root.textContent).toContain("V3");expect(root.textContent).toContain("共 21 个可见标签");
  expect(button("上一页").disabled).toBe(true);
  vi.mocked(listLabelsUsingRule).mockResolvedValue({...page,current:2,records:[{...row,id:"last",name:"最后一个标签"}]});
  button("下一页").click();await settle();expect(listLabelsUsingRule).toHaveBeenLastCalledWith("rule",2,20);
  expect(root.textContent).toContain("最后一个标签");expect(button("下一页").disabled).toBe(true);
});
it("retries a failed page without presenting failure as no references",async()=>{
  vi.mocked(listLabelsUsingRule).mockRejectedValueOnce(new Error("unavailable"));mount();await settle();
  expect(root.textContent).toContain("引用标签加载失败");expect(root.textContent).not.toContain("暂无可见");
  button("重试").click();await settle();expect(root.textContent).toContain("退款诉求");
});
it("does not allow a stale rule response to replace the newly selected rule",async()=>{
  let finish!:(value:typeof page)=>void;
  vi.mocked(listLabelsUsingRule).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const props=mount();await settle();props.ruleId="new-rule";await settle();
  finish({...page,records:[{...row,name:"旧规则标签"}]});await settle();
  expect(root.textContent).not.toContain("旧规则标签");expect(listLabelsUsingRule).toHaveBeenLastCalledWith("new-rule",1,20);
});
it("shows empty visible references without claiming globally unreferenced",async()=>{
  vi.mocked(listLabelsUsingRule).mockResolvedValue({...page,records:[],total:0});mount();await settle();
  expect(root.textContent).toContain("暂无可见的引用标签");
});
