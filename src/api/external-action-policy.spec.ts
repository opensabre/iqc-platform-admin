import {describe,it,expect} from 'vitest';
import {parseExternalActionPayload,validateActionPolicy,always} from './action-policy-editor';
import type {ActionPolicy} from './pipelines';

describe('external action publication boundary',()=>{
  it('preserves exact destination versions and frozen payload for all three types',()=>{
    for(const type of ['WEBHOOK','CREATE_WORK_ORDER','CREATE_COACHING_TASK'] as const){
      const policy:ActionPolicy={schemaVersion:'iqc-action-policy-v1',actions:[{actionId:'external',type,
        condition:always(),adapterVersion:1,idempotency:'PRODUCTION_SOURCE_V1',retry:null,failureHandling:'RECORD_ONLY',
        configuration:{destinationId:'receiver',destinationVersion:7,payload:{ticket:'source:1'}}}]};
      const frozen=validateActionPolicy(policy)!;
      expect(frozen.actions[0].configuration.destinationVersion).toBe(7);
      policy.actions[0].configuration.payload={ticket:'changed'};
      expect(frozen.actions[0].configuration.payload).toEqual({ticket:'source:1'});
      frozen.actions[0].configuration.url='https://other.example';
      expect(()=>validateActionPolicy(frozen)).toThrow('不支持');
    }
  });
  it('rejects malformed or rounded payload rather than saving last valid data',()=>{
    expect(()=>parseExternalActionPayload('{')).toThrow();
    expect(()=>parseExternalActionPayload('{"amount":99.999999999999999999}')).toThrow('精确');
    expect(()=>parseExternalActionPayload('{"ticket":9007199254740993}')).toThrow('精确');
    expect(parseExternalActionPayload('{"amount":"99.999999999999999999"}')).toEqual({amount:'99.999999999999999999'});
    expect(()=>parseExternalActionPayload('[]')).toThrow('对象');
  });
  it('enforces UTF8 bytes and nesting instead of character count',()=>{
    expect(()=>parseExternalActionPayload(JSON.stringify({text:'会'.repeat(6000)}))).toThrow('16KiB');
    let nested:unknown={};for(let i=0;i<18;i++)nested={child:nested};
    expect(()=>parseExternalActionPayload(JSON.stringify(nested))).toThrow('16层');
  });
});
