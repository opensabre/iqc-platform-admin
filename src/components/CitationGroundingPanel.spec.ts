import {afterEach,it,expect} from 'vitest';
import {createApp,defineComponent,h,nextTick,reactive,type App} from 'vue';
import Panel from './CitationGroundingPanel.vue';
import type {CitationGroundingSummary} from '@/api/evaluation';
let app:App,host:HTMLDivElement;
afterEach(()=>{app?.unmount();host?.remove();});
const sample:CitationGroundingSummary={schemaVersion:'iqc-citation-grounding-report-v1',scope:'LAST_TRACE_PER_FROZEN_SAMPLE_LLM_NODE',expectedNodeSamples:4,observedNodeSamples:3,measuredNodeSamples:1,partialNodeSamples:1,unmeasuredNodeSamples:2,invalidDiagnosticNodeSamples:1,outputs:3,recognizedOutputs:2,unmeasuredOutputs:1,claimedQuotes:2,invalidQuotes:1,malformedContainers:1,measurementCoverage:0.25,observedQuoteErrorRate:0.5};
function mount(metrics:CitationGroundingSummary|null){const props=reactive<{metrics:CitationGroundingSummary|null}>({metrics});host=document.createElement('div');document.body.append(host);app=createApp(defineComponent({setup:()=>()=>h(Panel,props)}));
 for(const name of ['ACard','ADescriptions'])app.component(name,defineComponent({setup:(_,{slots})=>()=>h('section',slots.default?.())}));
 app.component('ADescriptionsItem',defineComponent({props:['label'],setup:(p,{slots})=>()=>h('div',{'data-label':p.label},slots.default?.())}));
 app.component('AAlert',defineComponent({props:['message'],setup:p=>()=>h('p',p.message)}));app.mount(host);return props;}
function value(label:string){return host.querySelector(`[data-label="${label}"]`)?.textContent;}
it('keeps partial and unknown coverage visible beside the observed quote error rate',()=>{mount(sample);expect(value('完整测量覆盖')).toBe('25.00% · 1 / 4 样本节点');expect(value('已观测引用错误率')).toBe('50.00% · 1 / 2 条引用');expect(value('部分测量')).toBe('1 样本节点');expect(value('未测量')).toBe('2 样本节点');expect(value('无效诊断记录')).toBe('1');expect(host.textContent).toContain('引用匹配不证明事实判断正确');});
it('shows null rates as unmeasured and clears unsupported or missing metrics',async()=>{const props=mount({...sample,expectedNodeSamples:0,measuredNodeSamples:0,measurementCoverage:null,claimedQuotes:0,invalidQuotes:0,observedQuoteErrorRate:null});expect(value('完整测量覆盖')).toContain('未测量');expect(value('已观测引用错误率')).toBe('未测量 · 0 / 0 条引用');expect(host.textContent).toContain('当前报告不适用引用测量');props.metrics={...sample,schemaVersion:'unknown'};await nextTick();expect(host.textContent).toBe('');props.metrics=null;await nextTick();expect(host.textContent).toBe('');});
