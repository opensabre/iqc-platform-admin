import {describe,it,expect} from 'vitest';
import {always,editableAction,validateActionPolicy} from './action-policy-editor';
import type {ActionPolicy} from './pipelines';
function policy(configuration:Record<string,unknown>={findingCodes:['RISK'],threshold:'0.5'},version:number|undefined=2):ActionPolicy{
 return {schemaVersion:'iqc-action-policy-v1',actions:[{actionId:'mine',type:'ADD_TO_EVALUATION_CANDIDATE',adapterVersion:version,
 condition:always(),retry:null,idempotency:'PRODUCTION_SOURCE_V1',failureHandling:'RECORD_ONLY',configuration}]};
}
describe('mined candidate action publication boundary',()=>{
 it.each(['0','-0','+0','1','1.000000000000000000','0.500000000000000001'])('preserves exact threshold %s without numeric coercion',threshold=>{
  const input=policy({findingCodes:['RISK'],threshold,name:'pending',tags:['review']});const frozen=validateActionPolicy(input,['RISK'])!;
  expect(frozen.actions[0].configuration.threshold).toBe(threshold);expect(frozen).toEqual(input);
  input.actions[0].configuration.findingCodes=['OTHER'];expect(frozen.actions[0].configuration.findingCodes).toEqual(['RISK']);
 });
 it.each([-1,0.5,'-0.000000000000000001','1.000000000000000001','0.0000000000000000001','1e-1','NaN','',' 0.5','01'])('rejects invalid threshold %j',threshold=>{
  expect(()=>validateActionPolicy(policy({findingCodes:['RISK'],threshold}),['RISK'])).toThrow();
 });
 it.each([[],['RISK','RISK'],['risk'],['RISK','OTHER'],Array.from({length:51},(_,i)=>`R${i}`)])('rejects invalid or undeclared references %j',findingCodes=>{
  expect(()=>validateActionPolicy(policy({findingCodes,threshold:'0.5'}),['RISK'])).toThrow();
 });
 it('rejects stale v1 and expected-label fields in v2',()=>{
  for(const field of ['sampleType','reviewRevision','expected'])expect(()=>validateActionPolicy(policy({findingCodes:['RISK'],threshold:'0.5',[field]:'FALSE_POSITIVE'}),['RISK'])).toThrow('不支持');
 });
 it('round-trips omitted-version v1 without upgrading it',()=>{
  const input=policy({sampleType:'FALSE_POSITIVE',reviewRevision:1,name:'human reviewed',tags:['old']},1);delete input.actions[0].adapterVersion;
  const output=validateActionPolicy(input,['RISK'])!;expect(output).toEqual(input);expect(output.actions[0]).not.toHaveProperty('adapterVersion');expect(editableAction(output.actions[0])).toBe(true);
 });
 it('preserves unknown adapter versions as read-only without converting configuration',()=>{
  const input=policy({futureField:{exact:'0.123456789012345678'}},7);const output=validateActionPolicy(input,['RISK'])!;
  expect(output).toEqual(input);expect(editableAction(output.actions[0])).toBe(false);
 });
});
