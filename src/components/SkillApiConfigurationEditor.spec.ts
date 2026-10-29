vi.mock('@/composables/permission',()=>({usePermission:()=>({can:(code:string)=>['iqc:agent:view','iqc:agent:versions:view'].includes(code)})}));
import {afterEach,describe,it,expect,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import type {PipelineNode} from '@/api/pipelines';
const mocks=vi.hoisted(()=>({versions:vi.fn()}));
vi.mock('@/api/config',()=>({listAgentVersions:mocks.versions}));
import Editor from './SkillApiConfigurationEditor.vue';
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();});
const snapshot=(id:string)=>[{versionNo:2,status:'PUBLISHED',configJson:JSON.stringify({schemaVersion:'3.0',assetSnapshots:{skills:[{id,code:id,name:id,versionNo:3}],mcpServers:[{id:'server',code:'server',name:'server',versionNo:4,allowedToolsJson:'["inspect"]'}]}})}];
async function settle(){await Promise.resolve();await nextTick();await Promise.resolve();await nextTick();}
function mount(config:PipelineNode['config'],inference=false){
 host=document.createElement('div');document.body.append(host);app=createApp(defineComponent({setup:()=>()=>h(Editor,{config,inference})}));
 app.component('AFormItem',defineComponent({props:['label'],setup:(p,{slots})=>()=>h('section',{'data-label':p.label},slots.default?.())}));
 app.component('ASelect',defineComponent({props:['value','options','disabled'],emits:['change','update:value'],setup:(p,{emit})=>()=>h('select',{value:p.value,disabled:p.disabled,onChange:(event:Event)=>{const value=(event.target as HTMLSelectElement).value;emit('change',value);emit('update:value',value);}},(p.options||[]).map((option:{value:string;label:string})=>h('option',{value:option.value},option.label)))}));
 app.component('ATextarea',defineComponent({props:['value','disabled'],emits:['update:value'],setup:(p,{emit})=>()=>h('textarea',{value:p.value,disabled:p.disabled,onInput:(event:Event)=>emit('update:value',(event.target as HTMLTextAreaElement).value)})}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));app.mount(host);
}
describe('frozen Skill/API configuration',()=>{
 it('selects exact snapshot versions and preserves invalid schema drafts',async()=>{
  mocks.versions.mockResolvedValue(snapshot('skill'));const config=reactive<PipelineNode['config']>({agentReference:{id:'agent',versionNo:2}});
  mount(config);await settle();const selects=host.querySelectorAll('select');
  selects[0].value='skill';selects[0].dispatchEvent(new Event('change'));await settle();
  selects[1].value='server';selects[1].dispatchEvent(new Event('change'));await settle();
  expect(config.skillReference).toEqual({id:'skill',versionNo:3});expect(config.mcpReference).toEqual({id:'server',versionNo:4});
  expect(selects[2].textContent).toContain('inspect');
  const input=host.querySelector('textarea')!;input.value='{broken';input.dispatchEvent(new Event('input'));await settle();
  expect(config.toolInputSchema).toBe('{broken');
 });
 it('ignores stale version loads and clears old capability choices',async()=>{
  let resolve!:(rows:ReturnType<typeof snapshot>)=>void;mocks.versions.mockReturnValueOnce(new Promise(r=>{resolve=r;})).mockResolvedValueOnce(snapshot('new-skill'));
  const config=reactive<PipelineNode['config']>({agentReference:{id:'old',versionNo:2},skillReference:{id:'old-skill',versionNo:1},mcpReference:{id:'old-server',versionNo:1},toolName:'old-tool'});
  mount(config);config.agentReference={id:'new',versionNo:2};await settle();resolve(snapshot('old-skill'));await settle();
  expect(config.skillReference).toBeUndefined();expect(config.mcpReference).toBeUndefined();expect(config.toolName).toBeUndefined();
  expect(host.querySelector('select')!.textContent).toContain('new-skill');expect(host.querySelector('select')!.textContent).not.toContain('old-skill');
 });
 it('selects exact frozen inference models and retains invalid inference schemas',async()=>{
  mocks.versions.mockResolvedValue([{versionNo:2,status:'PUBLISHED',configJson:JSON.stringify({schemaVersion:'3.0',assetSnapshots:{skills:[],
   primaryModel:{id:'primary',name:'Primary',versionNo:3},fallbackModels:[{id:'dedicated',name:'Classifier',versionNo:7}],
   mcpServers:[{id:'server',name:'Inference',versionNo:4,allowedToolsJson:'["inspect"]'}]}})}]);
  const config=reactive<PipelineNode['config']>({agentReference:{id:'agent',versionNo:2},operation:'CLASSIFICATION'});
  mount(config,true);await settle();
  const model=host.querySelector('[data-label="冻结专用模型"] select') as HTMLSelectElement;
  expect(model.textContent).toContain('Classifier · v7');model.value='dedicated';model.dispatchEvent(new Event('change'));await settle();
  expect(config.modelReference).toEqual({id:'dedicated',versionNo:7});expect(config.skillReference).toBeUndefined();
  const schema=host.querySelector('[data-label="推理输入Schema（JSON）"] textarea') as HTMLTextAreaElement;
  schema.value='{broken';schema.dispatchEvent(new Event('input'));await settle();expect(config.inputSchema).toBe('{broken');
 });

});
