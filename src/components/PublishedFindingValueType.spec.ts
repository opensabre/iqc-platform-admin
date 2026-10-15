import {afterEach,it,expect,vi} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
const mocks=vi.hoisted(()=>({findings:vi.fn(),versions:vi.fn()}));
vi.mock('@/api/findings',()=>({listFindings:mocks.findings,listFindingVersions:mocks.versions}));
vi.mock('@/api/config',()=>({listRules:vi.fn(),listRuleVersions:vi.fn(),listAgents:vi.fn(),listAgentVersions:vi.fn()}));
import Reference from './PublishedAssetReference.vue';
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();vi.resetAllMocks();});
async function settle(){await Promise.resolve();await nextTick();await Promise.resolve();await nextTick();}
it('emits the selected published Finding type independently of the current asset',async()=>{
 mocks.findings.mockResolvedValue({records:[{id:'fact',name:'Fact',code:'FACT',status:'ACTIVE'}],total:1});
 mocks.versions.mockResolvedValue([{versionNo:1,snapshotJson:JSON.stringify({code:'ENTITY',valueType:'OBJECT'})},
  {versionNo:2,snapshotJson:JSON.stringify({code:'ENTITY',valueType:'NUMBER'})}]);
 const state=reactive({reference:{id:'fact',versionNo:1}});const types:Array<string|undefined>=[];
 host=document.createElement('div');document.body.append(host);
 app=createApp(defineComponent({setup:()=>()=>h(Reference,{modelValue:state.reference,kind:'FINDING',onValueType:(value:string|undefined)=>types.push(value)})}));
 for(const name of ['ASpace','APagination','AButton','AAlert'])app.component(name,defineComponent({setup:(_,{slots})=>()=>h('div',slots.default?.())}));
 app.component('ASelect',defineComponent({props:['value','options'],setup:()=>()=>h('select')}));
 app.mount(host);await settle();expect(types.at(-1)).toBe('OBJECT');
 state.reference={id:'fact',versionNo:2};await settle();expect(types.at(-1)).toBe('NUMBER');
 expect(mocks.findings).toHaveBeenCalledTimes(1);
 expect(mocks.versions.mock.calls.every(call=>call[0]==='fact')).toBe(true);
});
