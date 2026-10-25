import { afterEach, expect, it } from 'vitest';
import { createApp, defineComponent, h, provide, inject, reactive, nextTick, type App } from 'vue';
import Panel from './ConfidenceDiagnosticsPanel.vue';
import type { ConfidenceCalibrationCandidate, FindingConfidenceDiagnostics } from '@/api/evaluation';
let app:App,host:HTMLDivElement;
const metrics:FindingConfidenceDiagnostics={schemaVersion:'iqc-finding-confidence-diagnostics-v1',scope:'RAW_NODE_VALUE_CORRECTNESS_ON_KNOWN_GOLD',eligibleKnownGold:40,scored:40,unscored:0,coverage:1,brierScore:0.2,expectedCalibrationError:0.1,bins:[
 {index:0,lowerInclusive:0,upperBound:0.1,upperInclusive:false,count:19,meanConfidence:0.05,observedAccuracy:1},
 {index:1,lowerInclusive:0.1,upperBound:0.2,upperInclusive:false,count:21,meanConfidence:0.15,observedAccuracy:0}
]};
const candidate:ConfidenceCalibrationCandidate={schemaVersion:'iqc-confidence-calibration-candidate-v1',method:'EQUAL_WIDTH_10_MIN20',event:'TYPED_VALUE_CORRECTNESS_ON_KNOWN_GOLD',minimumBinSamples:20,eligibleKnownGold:40,scored:40,source:{taskId:'task',executionId:'original-execution',datasetHash:'a'.repeat(64),pipelineHash:'b'.repeat(64),evidenceHash:'c'.repeat(64),nodeId:'node',nodeHash:'d'.repeat(64),findingCode:'QUALITY_HIT',modelKey:'9'.repeat(64),deploymentRef:'provider/model@v1'},contentHash:'e'.repeat(64),bins:[{index:0,samples:19,correct:19,calibratedProbability:null},{index:1,samples:21,correct:0,calibratedProbability:0}]};
function mount(initial:ConfidenceCalibrationCandidate|null) {
 const props=reactive({metrics,calibrationCandidate:initial});
 host=document.createElement('div');document.body.append(host);app=createApp({render:()=>h(Panel,props)});
 const pass=defineComponent({setup(_, {slots,attrs}){return()=>h('div',[String(attrs.message??''),String(attrs.title??''),String(attrs.label??''),slots.default?.()]);}});
 for(const name of ['ACard','AAlert','ADescriptions','ADescriptionsItem'])app.component(name,pass);
 app.component('ATypographyParagraph',defineComponent({props:['copyable'],setup(p,{slots}){return()=>h('p',{'data-copy':p.copyable.text},slots.default?.());}}));
 app.component('ATable',defineComponent({props:['dataSource'],setup(p,{slots}){provide('rows',()=>p.dataSource);return()=>h('div',slots.default?.());}}));
 app.component('ATableColumn',defineComponent({props:['title','dataIndex'],setup(p,{slots}){const rows=inject<()=>Record<string,unknown>[]>('rows')!;return()=>h('section',[p.title,...rows().map(record=>h('span',slots.default?.({record})??String(record[p.dataIndex]??'')))]);}}));
 app.mount(host);return props;
}
afterEach(()=>{app?.unmount();host?.remove();});
it('shows unpublished provenance and distinguishes insufficient samples from a supported zero probability',()=>{
 mount(candidate);expect(host.textContent).toContain('拟合候选不代表经过独立验证或发布');expect(host.textContent).toContain('original-execution');expect(host.textContent).toContain('e'.repeat(64));
 const column=[...host.querySelectorAll('section')].find(el=>el.textContent?.startsWith('候选经验率'))!;
 expect([...column.querySelectorAll('span')].map(el=>el.textContent)).toEqual(['样本不足','0.00%']);
});
it('removes candidate claims when switching to a historical report without a candidate',async()=>{
 const props=mount(candidate);props.calibrationCandidate=null;await nextTick();
 expect(host.textContent).not.toContain('original-execution');expect(host.textContent).not.toContain('候选经验率');expect(host.textContent).not.toContain('拟合候选不代表');
 expect(host.textContent).toContain('Brier');
});

it('copies only an exact four-field reference array and updates it when the selected report changes',async()=>{
 const props=mount(candidate);
 const copied=()=>JSON.parse(host.querySelector('p[data-copy]')!.getAttribute('data-copy')!);
 expect(copied()).toEqual([{taskId:'task',executionId:'original-execution',nodeId:'node',contentHash:'e'.repeat(64)}]);
 props.calibrationCandidate={...candidate,source:{...candidate.source,taskId:'other-task',executionId:'other-execution'},contentHash:'f'.repeat(64)};
 await nextTick();
 expect(copied()).toEqual([{taskId:'other-task',executionId:'other-execution',nodeId:'node',contentHash:'f'.repeat(64)}]);
 const copy=host.querySelector('p[data-copy]')!.getAttribute('data-copy')!;
 expect(copy).not.toContain('calibratedProbability');expect(copy).not.toContain('datasetHash');expect(copy).not.toContain('original-execution');
 props.calibrationCandidate=null;await nextTick();expect(host.querySelector('p[data-copy]')).toBeNull();
});

it('keeps diagnostic bins but removes executable references when model binding is lost',async()=>{
 const props=mount(candidate);expect(host.querySelector('p[data-copy]')).not.toBeNull();
 props.calibrationCandidate={...candidate,source:{...candidate.source,modelKey:undefined}};await nextTick();
 expect(host.querySelector('p[data-copy]')).toBeNull();expect(host.textContent).toContain('仅供诊断，不能用于执行');expect(host.textContent).toContain('候选经验率');
 props.calibrationCandidate=candidate;await nextTick();expect(host.querySelector('p[data-copy]')).not.toBeNull();
 props.calibrationCandidate={...candidate,source:{...candidate.source,deploymentRef:undefined}};await nextTick();
 expect(host.querySelector('p[data-copy]')).toBeNull();expect(host.textContent).toContain('仅供诊断，不能用于执行');
});
it('rejects malformed model and deployment identities for executable copying',async()=>{
 const props=mount({...candidate,source:{...candidate.source,modelKey:'not-a-digest'}});
 expect(host.querySelector('p[data-copy]')).toBeNull();
 props.calibrationCandidate={...candidate,source:{...candidate.source,deploymentRef:'bad deployment'}};await nextTick();
 expect(host.querySelector('p[data-copy]')).toBeNull();expect(host.textContent).toContain('仅供诊断，不能用于执行');
});
