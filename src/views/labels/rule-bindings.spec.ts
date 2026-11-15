import {describe,it,expect} from "vitest";
import {validateRuleBindings} from "./rule-bindings";
const rules=[{id:"1",ruleType:"REGEX"},{id:"2",ruleType:"regex"},{id:"3",ruleType:"LLM"}];
describe("one rule per type",()=>{
  it("allows an explicit empty selection to unbind all rules",()=>expect(()=>validateRuleBindings([],rules)).not.toThrow());
  it("rejects two same-type rules before saving",()=>expect(()=>validateRuleBindings(["1","2"],rules)).toThrow("最多绑定一条"));
  it("allows different types and reuse by another label",()=>{validateRuleBindings(["1","3"],rules);validateRuleBindings(["1"],rules);});
  it("rejects an unavailable selection",()=>expect(()=>validateRuleBindings(["4"],rules)).toThrow("不可用"));
});
