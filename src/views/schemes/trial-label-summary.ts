import type { LabelResult } from "@/api/results";
import type { InspectionTask } from "@/api/tasks";
import { presentLabel } from "@/views/tasks/label-results";

export interface TrialLabelSummary {
  expected: number;
  received: number;
  counts: { KNOWN: number; UNKNOWN: number; CONFLICT: number; ERROR: number };
  complete: boolean;
  invalid: boolean;
}

/** Compares returned rows with the trial's frozen conversation and label-value scope. */
export function summarizeTrialLabels(task: InspectionTask, rows: LabelResult[]): TrialLabelSummary {
  const counts = { KNOWN: 0, UNKNOWN: 0, CONFLICT: 0, ERROR: 0 };
  const invalidResult = (): TrialLabelSummary => ({ expected: 0, received: rows.length, counts, complete: false, invalid: true });
  try {
    const scope = JSON.parse(task.labelScopeSnapshotJson || "null");
    const conversationIds = JSON.parse(task.conversationIdsJson || "null");
    if (scope?.schemaVersion !== "2.0" || !Array.isArray(scope.labels) || !scope.labels.length
      || !Array.isArray(conversationIds) || !conversationIds.length || conversationIds.length > 20) return invalidResult();
    const expected = new Set<string>();
    for (const conversationId of conversationIds) {
      if (typeof conversationId !== "string" || !conversationId.trim()) return invalidResult();
      for (const label of scope.labels) {
        if (typeof label?.id !== "string" || !label.id.trim() || !Number.isInteger(label.versionNo)
          || label.versionNo < 1 || !Array.isArray(label.values) || !label.values.length) return invalidResult();
        for (const value of label.values) {
          if (typeof value?.valueCode !== "string" || !value.valueCode.trim()) return invalidResult();
          const key = JSON.stringify([conversationId, label.id, label.versionNo, value.valueCode]);
          if (expected.has(key)) return invalidResult();
          expected.add(key);
        }
      }
    }
    const received = new Set<string>();
    let invalid = false;
    for (const row of rows) {
      const key = JSON.stringify([row.conversationId, row.labelId, row.labelVersionNo, row.valueCode]);
      if (!expected.has(key) || received.has(key)) invalid = true;
      received.add(key);
      const presentation = presentLabel(row);
      const state = presentation.state;
      counts[state === "HIT" ? "ERROR" : state]++;
      if (!presentation.valid || state === "HIT") invalid = true;
    }
    return { expected: expected.size, received: rows.length, counts,
      complete: !invalid && received.size === expected.size, invalid };
  } catch { return invalidResult(); }
}
