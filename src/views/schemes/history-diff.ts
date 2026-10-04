import type { ReleasedSchemeVersion, SchemeDefinition } from "@/api/schemes";

export interface HistoryDiffRow { key: string; scope: string; field: string; before: string; after: string }

/** Compare only published, frozen business fields; never resolve mutable rule or label catalogs. */
export function diffReleasedStandards(before: ReleasedSchemeVersion, after: ReleasedSchemeVersion): HistoryDiffRow[] {
  const rows: HistoryDiffRow[] = [];
  const add = (scope: string, field: string, left: unknown, right: unknown) => {
    const oldValue = show(left), newValue = show(right);
    if (oldValue !== newValue) rows.push({ key: `${scope}/${field}`, scope, field, before: oldValue, after: newValue });
  };
  const old = before.snapshot, current = after.snapshot;
  add("方案", "名称", old.name, current.name);
  add("方案", "编码", old.code, current.code);
  add("方案", "场景", old.businessScene, current.businessScene);
  add("方案", "说明", old.description, current.description);
  add("执行", "推荐路线", old.dependencies?.executionMode, current.dependencies?.executionMode);
  add("执行", "智能体版本", reference(old.definition.agent), reference(current.definition.agent));
  for (const field of ["maxConversations", "defaultConcurrency", "maxConcurrency"] as const)
    add("运行约束", { maxConversations: "会话上限", defaultConcurrency: "默认并发", maxConcurrency: "最大并发" }[field],
      old.definition.runLimits?.[field], current.definition.runLimits?.[field]);
  const oldItems = index(old.definition.items), newItems = index(current.definition.items);
  for (const code of new Set([...oldItems.keys(), ...newItems.keys()])) {
    const left = oldItems.get(code), right = newItems.get(code), scope = `质检项 ${code}`;
    add(scope, left && right ? "名称" : "项目", left?.name, right?.name);
    add(scope, "检测规则版本", reference(left?.rule), reference(right?.rule));
    add(scope, "适用条件版本", reference(left?.appliesWhen), reference(right?.appliesWhen));
    add(scope, "命中含义", left?.hitMeaning, right?.hitMeaning);
    add(scope, "LLM 输入范围", left?.inputScope, right?.inputScope);
    add(scope, "逐项执行路线", left?.execution?.route, right?.execution?.route);
    add(scope, "初筛规则版本", reference(left?.execution?.prefilter), reference(right?.execution?.prefilter));
    add(scope, "候选规则版本", reference(left?.execution?.candidate), reference(right?.execution?.candidate));
    add(scope, "阶段 LLM 输入范围", left?.execution?.stageInputScope, right?.execution?.stageInputScope);
    add(scope, "初筛覆盖全部违规", left?.execution?.prefilterCoversViolation, right?.execution?.prefilterCoversViolation);
  }
  const a = old.definition.scoring, b = current.definition.scoring;
  add("评分", "方式", a.mode, b.mode);
  add("评分", "基础分", a.baseScore, b.baseScore);
  add("评分", "及格线", a.passingScore, b.passingScore);
  const oldScores = index(a.items), newScores = index(b.items);
  for (const code of new Set([...oldScores.keys(), ...newScores.keys()])) {
    const left = oldScores.get(code), right = newScores.get(code), scope = `评分项 ${code}`;
    if (!left || !right) add(scope, "是否计分", Boolean(left), Boolean(right));
    add(scope, "分值", left?.points, right?.points);
    add(scope, "一票否决", left?.veto, right?.veto);
  }
  const oldLabels = indexById(old.definition), newLabels = indexById(current.definition);
  for (const id of new Set([...oldLabels.keys(), ...newLabels.keys()]))
    add(`标签 ${id}`, "版本", oldLabels.get(id), newLabels.get(id));
  return rows;
}

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}
function reference(value?: { id: string; versionNo: number } | null): string | undefined {
  return value ? `${value.id} · V${value.versionNo}` : undefined;
}
function index<T extends { itemCode: string }>(items: T[]): Map<string, T> { return new Map(items.map(item => [item.itemCode, item])); }
function indexById(definition: SchemeDefinition): Map<string, number> {
  return new Map((definition.labels ?? []).map(label => [label.id, label.versionNo]));
}
