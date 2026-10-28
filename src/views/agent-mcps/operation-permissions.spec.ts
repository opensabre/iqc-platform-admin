import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import Mcps from './index.vue';
const api=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),update:vi.fn(),enable:vi.fn(),disable:vi.fn(),confirm:vi.fn()}));
vi.mock('@/api/config',()=>({listMcpServers:api.list,createMcpServer:api.create,updateMcpServer:api.update,enableMcpServer:api.enable,disableMcpServer:api.disable}));
vi.mock('@/api/dictionaries',()=>({getCachedDictionaries:vi.fn().mockResolvedValue({})}));
vi.mock('ant-design-vue',()=>({Modal:{confirm:api.confirm},message:{success:vi.fn(),error:vi.fn(),warning:vi.fn()}}));
const access=reactive({codes:[] as string[]});
vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>access.codes.includes(code)})}));
const row={id:'mcp',name:'MCP',code:'MCP',endpoint:'https://example.test/mcp',transport:'SSE',authType:'NONE',status:'ENABLED',timeoutSeconds:30,allowedToolsJson:'[]'};
let app:App,host:HTMLDivElement,vm:any;
async function settle(){for(let i=0;i<12;i++){await Promise.resolve();await nextTick();}}
const pass=defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())});
async function mount(){
 host=document.createElement('div');document.body.append(host);app=createApp(Mcps);
 for(const name of ['ACard','ATable','ASpace','ATag','AForm','AFormItem','ARow','ACol','AInput','ASelect','ASelectOption','AInputNumber','ATextarea','AAlert'])app.component(name,pass);
 app.component('ATableColumn',defineComponent({render:()=>null}));
 app.component('AButton',defineComponent({setup:(_,{slots,attrs})=>()=>h('button',attrs,slots.default?.())}));
 app.component('AModal',defineComponent({props:['open'],setup:(p,{slots})=>()=>p.open?h('article',slots.default?.()):null}));
 app.mount(host);vm=(app as any)._instance.setupState;await settle();
}
beforeEach(()=>{vi.clearAllMocks();access.codes=['iqc:mcp:view'];api.list.mockResolvedValue([row]);api.update.mockResolvedValue(row);api.create.mockResolvedValue(row);});
afterEach(()=>{app?.unmount();host?.remove();});
describe('MCP exact operation permissions',()=>{
 it('old manage permits creation but cannot update an existing MCP',async()=>{
  access.codes.push('iqc:mcp:manage');await mount();vm.edit(row);await settle();expect(vm.modalOpen).toBe(true);await vm.save();expect(api.update).not.toHaveBeenCalled();
  vm.modalOpen=false;await settle();vm.createNew();Object.assign(vm.form,row);await vm.save();expect(api.create).toHaveBeenCalledOnce();
 });
 it('update permits existing saves and cannot open creation',async()=>{
  access.codes.push('iqc:mcp:update');await mount();vm.createNew();expect(vm.modalOpen).toBe(false);vm.edit(row);await vm.save();expect(api.update).toHaveBeenCalledWith('mcp',expect.objectContaining({code:'MCP'}));expect(api.create).not.toHaveBeenCalled();
 });
 it('rechecks disable permission in an already opened confirmation',async()=>{
  access.codes.push('iqc:mcp:disable');await mount();vm.changeStatus(row);expect(api.confirm).toHaveBeenCalledOnce();access.codes=['iqc:mcp:view'];await settle();await api.confirm.mock.calls[0][0].onOk();expect(api.disable).not.toHaveBeenCalled();
 });
 it('enable does not authorize disable and enable uses its own endpoint',async()=>{
  access.codes.push('iqc:mcp:enable');await mount();vm.changeStatus(row);expect(api.confirm).not.toHaveBeenCalled();vm.changeStatus({...row,status:'DISABLED'});await api.confirm.mock.calls[0][0].onOk();expect(api.enable).toHaveBeenCalledWith('mcp');expect(api.disable).not.toHaveBeenCalled();
 });
 it('revoking update closes the editor and prevents a later save',async()=>{
  access.codes.push('iqc:mcp:update');await mount();vm.edit(row);await settle();expect(host.querySelector('article')).not.toBeNull();access.codes=['iqc:mcp:view'];await settle();expect(host.querySelector('article')).toBeNull();await vm.save();expect(api.update).not.toHaveBeenCalled();
 });
 it('revoking view discards an in-flight list response',async()=>{
  let resolve!:(rows:any[])=>void;api.list.mockReturnValueOnce(new Promise(done=>resolve=done));await mount();access.codes=[];await settle();resolve([row]);await settle();expect(vm.mcps).toEqual([]);expect(vm.modalOpen).toBe(false);
 });
});
