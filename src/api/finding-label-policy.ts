import type { ActionPolicy, FindingLabelPolicy } from './pipelines';

export function validateFindingLabelPolicy(policy?: FindingLabelPolicy | null): FindingLabelPolicy | undefined {
  if (!policy) return undefined;
  const copy = JSON.parse(JSON.stringify(policy)) as FindingLabelPolicy;
  if (copy.schemaVersion !== 'iqc-finding-label-policy-v1' || !Array.isArray(copy.bindings)
    || !copy.bindings.length || copy.bindings.length > 100) throw Error('标签绑定必须为 1 到 100 项');
  const values = new Set<string>(), versions = new Map<string, number>();
  for (const binding of copy.bindings) {
    if (!binding || typeof binding.labelId !== 'string' || typeof binding.findingCode !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_./@+-]{0,63}$/.test(binding.labelId)
      || !Number.isSafeInteger(binding.labelVersion) || binding.labelVersion < 1 || binding.labelVersion > 2147483647
      || typeof binding.valueCode !== 'string' || !binding.valueCode.trim() || binding.valueCode.length > 64
      || /[\u0000-\u001f\u007f-\u009f]/.test(binding.valueCode)
      || !/^[A-Z][A-Z0-9_]{1,63}$/.test(binding.findingCode)) throw Error('标签身份、版本、值编码或 Finding 编码无效');
    const key = JSON.stringify([binding.labelId, binding.valueCode]);
    if (values.has(key)) throw Error('同一个标签值不能重复绑定');
    values.add(key);
    if (versions.has(binding.labelId) && versions.get(binding.labelId) !== binding.labelVersion) throw Error('同一标签只能绑定一个版本');
    versions.set(binding.labelId, binding.labelVersion);
  }
  return copy;
}

export function validateLabelActionTargets(actions: ActionPolicy | null | undefined, labels: FindingLabelPolicy | undefined) {
  for (const action of actions?.actions || []) {
    if (action.type !== 'UPDATE_LABEL' || (action.adapterVersion ?? 1) !== 1) continue;
    const target = action.configuration;
    if (Object.keys(target).length !== 2 || typeof target.labelId !== 'string' || typeof target.valueCode !== 'string'
      || !labels?.bindings.some(binding => binding.labelId === target.labelId && binding.valueCode === target.valueCode))
      throw Error(`打标动作 ${action.actionId} 必须引用已声明的标签值绑定`);
  }
}
