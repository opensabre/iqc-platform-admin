/** Validate the complete selection before saving any label metadata. */
export function validateRuleBindings(ids: string[], rules: Array<{id:string;ruleType:string}>) {
  const types = new Set<string>();
  for (const id of ids) {
    const rule = rules.find(item => item.id === id);
    if (!rule) throw new Error("所选规则不可用，请重新选择已发布规则");
    const type = rule.ruleType.toUpperCase();
    if (types.has(type)) throw new Error(`每种规则类型最多绑定一条：${type}`);
    types.add(type);
  }
}
