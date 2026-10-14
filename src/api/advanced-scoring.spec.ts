import {describe,it,expect} from 'vitest';
import {validateScoringPolicy} from './advanced-scoring';
import type {ScoringPolicy} from './pipelines';

function policy():ScoringPolicy {
  return {version:'iqc-score-v3',mode:'DEDUCTION',baseScore:100,passingScore:60,
    items:[{itemCode:'a',points:10,veto:false}],
    advanced:{schemaVersion:'iqc-score-advanced-v1',lowerBound:'0',upperBound:'100',
      items:[{itemCode:'a',weight:'1.000000000000000001',passAdjustment:'0',failAdjustment:'-0.000000000000000001',dimensionCode:null,appliesWhen:null}],
      dimensions:[],grades:[{code:'good',minimumScore:'60'},{code:'low',minimumScore:'0'}]}};
}

describe('advanced scoring publication validation',()=>{
  it('preserves exact decimal strings and returns an independent frozen candidate',()=>{
    const source=policy();
    const frozen=validateScoringPolicy(source,source.items,[]);
    expect(frozen.advanced!.items[0].weight).toBe('1.000000000000000001');
    expect(frozen.advanced!.items[0].failAdjustment).toBe('-0.000000000000000001');
    source.advanced!.items[0].weight='2';
    expect(frozen.advanced!.items[0].weight).toBe('1.000000000000000001');
  });
  it('rejects fractional precision overflow and grades without full coverage',()=>{
    const source=policy();source.advanced!.items[0].weight='1.0000000000000000001';
    expect(()=>validateScoringPolicy(source,source.items,[])).toThrow();
    const uncovered=policy();uncovered.advanced!.grades.pop();
    expect(()=>validateScoringPolicy(uncovered,uncovered.items,[])).toThrow('覆盖0分');
  });
  it('rejects circular score inputs inside compound applicability conditions',()=>{
    const source=policy();
    source.advanced!.items[0].appliesWhen={kind:'ALL',code:null,value:null,children:[
      {kind:'FINAL_SCORE_BELOW',code:null,value:null,decimalOperand:'60',children:[]}]};
    expect(()=>validateScoringPolicy(source,source.items,[])).toThrow('不能引用评分');
  });
});
