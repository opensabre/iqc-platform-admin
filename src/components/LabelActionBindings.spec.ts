import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {createApp,h,nextTick,reactive,type App} from "vue";
import Antd from "ant-design-vue";
import LabelActionBindings from "./LabelActionBindings.vue";
import {listLabelActions,getLabelActions,replaceLabelActions} from "@/api/labels";
vi.mock("@/api/labels",()=>({listLabelActions:vi.fn(),getLabelActions:vi.fn(),replaceLabelActions:vi.fn(),createLabelAction:vi.fn(),updateLabelAction:vi.fn(),disableLabelAction:vi.fn(),deleteLabelAction:vi.fn()}));
let app:App,root:HTMLDivElement;
const id="9007199254740993";
const bound={bindingId:"b",actionId:id,versionNo:1,type:"DEDUCT_SCORE",name:"违规动作",status:"ENABLED"};
async function settle(){for(let i=0;i<10;i++){await Promise.resolve();await nextTick();}}
function mount(){const props=reactive({labelId:"label",editable:true});root=document.createElement("div");document.body.append(root);app=createApp({render:()=>h(LabelActionBindings,props)}).use(Antd);app.mount(root);return props;}
function button(text:string){return [...root.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.replace(/\s/g,"").includes(text))!;}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(listLabelActions).mockResolvedValue([{id,type:"DEDUCT_SCORE",name:"违规动作",versionNo:1,status:"ENABLED"}]);vi.mocked(getLabelActions).mockResolvedValue([bound]);vi.mocked(replaceLabelActions).mockResolvedValue([bound]);});
afterEach(()=>{app?.unmount();root?.remove();});
describe("action metadata bindings",()=>{
  it("shows the policy boundary and preserves a snowflake ID during save",async()=>{
    mount();await settle();expect(root.textContent).toContain("扣分策略待对接");expect(root.textContent).toContain("违规动作");
    button("保存动作绑定").click();await settle();expect(replaceLabelActions).toHaveBeenCalledWith("label",[id]);
  });
  it("allows an empty replacement to unlink all actions",async()=>{
    vi.mocked(getLabelActions).mockResolvedValue([]);mount();await settle();button("保存动作绑定").click();await settle();
    expect(replaceLabelActions).toHaveBeenCalledWith("label",[]);
  });
  it("ignores an old label response after switching labels",async()=>{
    let resolve!:(value:typeof bound[])=>void;
    vi.mocked(getLabelActions).mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue([]);
    const props=mount();await settle();props.labelId="other";await settle();resolve([bound]);await settle();
    button("保存动作绑定").click();await settle();expect(replaceLabelActions).toHaveBeenCalledWith("other",[]);
  });
});
