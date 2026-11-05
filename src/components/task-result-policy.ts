import type { TaskEngineConfiguration, TaskMappedValue, TaskResultProcessingConfiguration, LabelValueType } from "@/api/tasks";
import type { LabelDetail } from "@/api/labels";

export interface ResultTarget { value: string; label: string; }
export interface ResultMappingDraft { onHit?: TaskMappedValue; onMiss?: TaskMappedValue; }
export interface ResultTargetDraft {
  aggregation?: "REQUIRE_AGREEMENT"; points?: number; veto: boolean; valueCode?: string;
  engines: Record<string, ResultMappingDraft>;
}
export interface ResultPolicyDraft {
  mode?: "DEDUCTION" | "POINTS"; baseScore?: number; passingScore?: number;
  inspection: Record<string, ResultTargetDraft>; labeling: Record<string, ResultTargetDraft>;
}
/** Groups only currently enabled engines; stale drafts must never add an operation or target to a request. */
export function resultTargets(config: TaskEngineConfiguration, operation: "inspection" | "labeling") {
  return [...new Set((config[operation]?.engines || []).map(engine => engine.parameters.targetId).filter((id): id is string => Boolean(id)))];
}
export function validMappedValue(type: LabelValueType, value: TaskMappedValue | undefined): boolean {
  if (value === undefined) return false;
  if (value === null) return true;
  switch (type) {
    case "BOOLEAN": return typeof value === "boolean";
    case "FIXED": return ["string", "number", "boolean"].includes(typeof value) && (typeof value !== "number" || Number.isFinite(value));
    case "PERCENTAGE": return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
    case "MONTH": return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12;
    case "DURATION_MONTHS": return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
    case "DATE": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }
  }
}
/** Builds a server policy only after explicit mappings and score fields are complete. */
export function buildResultPolicy(config: TaskEngineConfiguration, draft: ResultPolicyDraft, labels: Record<string, LabelDetail>) {
  const errors: string[] = [];
  const output: TaskResultProcessingConfiguration = { schemaVersion: "iqc-task-result-processing-v1", labeling: [] };
  const integer = (value: number | undefined, min: number, max: number): value is number =>
    value !== undefined && Number.isInteger(value) && value >= min && value <= max;
  if (!config.inspection && !config.labeling) errors.push("请至少选择质检或打标");
  for (const op of ["inspection", "labeling"] as const) {
    const engines = config[op]?.engines;
    if (!engines) continue;
    if (!engines.length || engines.length > 32 || engines.some(engine => !engine.parameters.targetId)
      || new Set(engines.map(engine => engine.id)).size !== engines.length) errors.push("请先完成任务类型中的引擎和目标配置");
    const targets = resultTargets(config, op);
    if (op === "inspection") {
      if (!draft.mode || !integer(draft.baseScore, 1, 100) || !integer(draft.passingScore, 0, draft.mode === "DEDUCTION" ? draft.baseScore || 0 : 100))
        errors.push("请设置评分方式、基础分（1–100）和有效的及格线");
      output.inspection = { aggregation: "REQUIRE_AGREEMENT", scoring: { version: "iqc-score-v2", mode: draft.mode!,
        baseScore: draft.baseScore!, passingScore: draft.passingScore!, items: [] }, checks: [] };
    }
    for (const targetId of targets) {
      const item = draft[op][targetId];
      if (item?.aggregation !== "REQUIRE_AGREEMENT") errors.push("请为每个目标明确选择结果汇总规则");
      const sources = engines.filter(engine => engine.parameters.targetId === targetId);
      if (op === "inspection") {
        if (!integer(item?.points, draft.mode === "POINTS" ? 1 : 0, 100)) errors.push("请为每个质检项设置有效分值");
        const mappings = sources.map(engine => {
          const mapping = item?.engines[engine.id];
          if (!["PASS", "FAIL"].includes(String(mapping?.onHit)) || !["PASS", "FAIL"].includes(String(mapping?.onMiss)))
            errors.push("每个质检引擎须分别设置命中与未命中的判断");
          return { engineInstanceId: engine.id, onHit: mapping?.onHit as "PASS" | "FAIL", onMiss: mapping?.onMiss as "PASS" | "FAIL" };
        });
        output.inspection!.scoring.items.push({ itemCode: targetId, points: item?.points!, veto: item?.veto || false });
        output.inspection!.checks.push({ targetId, engines: mappings });
      } else {
        const detail = labels[targetId];
        const definitions = detail?.values.filter(value => value.valueCode === item?.valueCode) || [];
        const definition = definitions.length === 1 ? definitions[0] : undefined;
        if (detail?.label.status !== "PUBLISHED" || !definition) errors.push("请选择目标标签的已发布值定义");
        const mappings = sources.map(engine => {
          const mapping = item?.engines[engine.id];
          if (!definition || !validMappedValue(definition.valueType, mapping?.onHit) || !validMappedValue(definition.valueType, mapping?.onMiss))
            errors.push("每个打标引擎须设置符合标签类型的命中值和未命中值，或明确选择未知");
          return { engineInstanceId: engine.id, onHit: mapping?.onHit!, onMiss: mapping?.onMiss! };
        });
        output.labeling.push({ targetId, valueCode: item?.valueCode!, valueType: definition?.valueType!, aggregation: "REQUIRE_AGREEMENT", engines: mappings });
      }
    }
  }
  return { errors: [...new Set(errors)], configuration: errors.length ? undefined : output };
}
