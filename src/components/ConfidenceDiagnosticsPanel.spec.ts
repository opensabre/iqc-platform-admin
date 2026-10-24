import { afterEach, expect, it } from 'vitest';
import { createApp, defineComponent, h, provide, inject, reactive, nextTick, type App } from 'vue';
import Panel from './ConfidenceDiagnosticsPanel.vue';
import type { ConfidenceCalibrationCandidate, FindingConfidenceDiagnostics } from '@/api/evaluation';
let app:App,host:HTMLDivElement;
const metrics:FindingConfidenceDiagnostics={schemaVersion:'iqc-finding-confidence-diagnostics-v1',scope:'RAW_NODE_VALUE_CORRECTNESS_ON_KNOWN_GOLD',eligibleKnownGold:40,scored:40,unscored:0,coverage:1,brierScore:0.2,expectedCalibrationError:0.1,bins:[
 {index:0,lowerInclusive:0,upperBound:0.1,upperInclusive:false,count:19,meanConfidence:0.05,observedAccuracy:1},
 {index:1,lowerInclusive:0.1,upperBound:0.2,upperInclusive:false,count:21,meanConfidence:0.15,observedAccuracy:0}
]};
const candidate:ConfidenceCalibrationCandidate={schemaVersion:'iqc-confidence-calibration-candidate-v1',method:'EQUAL_WIDTH_10_MIN20',event:'TYPED_VALUE_CORRECTNESS_ON_KNOWN_GOLD',minimumBinSamples:20,eligibleKnownGold:40,scored:40,source:{taskId:'task',executionId:'original-execution',datasetHash:'a'.repeat(64),pipelineHash:'b'.repeat(64),evidenceHash:'c'.repeat(64),nodeId:'node',nodeHash:'d'.repeat(64),findingCode:'QUALITY_HIT'},contentHash:'e'.repeat(64),bins:[{index:0,samples:19,correct:19,calibratedProbability:null},{index:1,samples:21,correct:0,calibratedProbability:0}]};
function mount(initial:ConfidenceCalibrationCandidate|null) {
 const props=reactive({metrics,calibrationCandidate:initial});
 host=document.createElement('div');document.body.append(host);app=createApp({render:()=>h(Panel,props)});
 const pass=defineComponent({setup(_, {slots,attrs}){return()=>h('div',[String(attrs.message??''),String(attrs.title??''),String(attrs.label??''),slots.default?.()]);}});
 for(const name of ['ACard','AAlert','ADescriptions','ADescriptionsItem'])app.component(name,pass);
 app.component('ATable',defineComponent({props:['dataSource'],setup(p,{slots}){provide('rows',()=>p.dataSource);return()=>h('div',slots.default?.());}}));
 app.component('ATableColumn',defineComponent({props:['title','dataIndex'],setup(p,{slots}){const rows=inject<()=>Record<string,unknown>[]>('rows')!;return()=>h('section',[p.title,...rows().map(record=>h('span',slots.default?.({record})??String(record[p.dataIndex]??'')))]);}}));
 app.mount(host);return props;
}
afterEach(()=>{app?.unmount();host?.remove();});
it('shows unpublished provenance and distinguishes insufficient samples from a supported zero probability',()=>{
 mount(candidate);expect(host.textContent).toContain('尚未发布，也未用于融合');expect(host.textContent).toContain('original-execution');expect(host.textContent).toContain('e'.repeat(64));
 const column=[...host.querySelectorAll('section')].find(el=>el.textContent?.startsWith('候选经验率'))!;
 expect([...column.querySelectorAll('span')].map(el=>el.textContent)).toEqual(['样本不足','0.00%']);
});
it('removes candidate claims when switching to a historical report without a candidate',async()=>{
 const props=mount(candidate);props.calibrationCandidate=null;await nextTick();
 expect(host.textContent).not.toContain('original-execution');expect(host.textContent).not.toContain('候选经验率');expect(host.textContent).not.toContain('尚未发布');
 expect(host.textContent).toContain('Brier');
});
