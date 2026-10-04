import type { LabelResult } from "@/api/results";

type State = NonNullable<LabelResult["status"]>;
interface Quote { messageId: string; text: string }
interface Candidate { value: string; source: string; evidence: Quote[] }
export interface LabelPresentation {
  state: State; valid: boolean; title: string; color: string; value: string; subject: string;
  reasons: string[]; candidates: Candidate[];
}
const states: Record<State, { title: string; color: string }> = {
  HIT: { title: "命中（兼容）", color: "blue" }, KNOWN: { title: "确定", color: "blue" },
  UNKNOWN: { title: "未知", color: "default" }, CONFLICT: { title: "冲突", color: "orange" },
  ERROR: { title: "错误", color: "red" },
};
const reasonNames: Record<string, string> = {
  NOT_MENTIONED: "未提及可靠事实", SUBJECT_UNCERTAIN: "主体不明确或不是当前参与人",
  NO_TARGET_SPEAKER: "本会话没有可确认的目标说话人", UNMAPPED_SPEAKER_ROLE: "存在未识别的说话人角色，无法确认识别覆盖范围",
  MISSING_OBSERVATIONS: "缺少检测记录", DETECTION_INCOMPLETE: "检测未完整完成",
  INVALID_FACT_CONTRACT: "识别输出格式不符合约定", RULE_MISMATCH: "检测来源不一致",
  INVALID_VALUE: "识别值格式无效", INVALID_EVIDENCE: "证据校验未通过", INVALID_JSON: "识别输出格式损坏",
};
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function scalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}
function display(value: unknown) {
  return value === false ? "否" : value === true ? "是" : scalar(value) ? String(value) : "—";
}
function presentation(state: State): LabelPresentation {
  return { state, valid: true, ...states[state], value: "—", subject: "—", reasons: [], candidates: [] };
}

/** Read-only presentation: malformed coverage must not turn into a legacy hit or a definitive value. */
export function presentLabel(result: LabelResult): LabelPresentation {
  const invalid = { ...presentation("ERROR"), valid: false, reasons: ["结果格式异常，请联系管理员检查识别输出"] };
  try {
    const payload: unknown = result.valueJson ? JSON.parse(result.valueJson) : {};
    if (!object(payload)) return invalid;
    if (payload.schemaVersion !== "iqc-label-result-v2") {
      if (result.status && result.status !== "HIT") return invalid;
      return { ...presentation("HIT"), value: display(payload.value) };
    }
    const state = payload.status;
    if (typeof state !== "string" || !["KNOWN", "UNKNOWN", "CONFLICT", "ERROR"].includes(state)
      || (result.status && result.status !== state) || !Array.isArray(payload.candidates)
      || !Array.isArray(payload.reasons) || (state === "KNOWN" && (!scalar(payload.value) || !payload.candidates.length))) return invalid;
    const candidates: Candidate[] = [];
    for (const candidate of payload.candidates) {
      if (!object(candidate) || !scalar(candidate.value) || typeof candidate.sourceRuleResultId !== "string"
        || !candidate.sourceRuleResultId.trim() || !Array.isArray(candidate.evidence) || !candidate.evidence.length) return invalid;
      const evidence: Quote[] = [];
      for (const quote of candidate.evidence) {
        if (!object(quote) || typeof quote.messageId !== "string" || !quote.messageId.trim()
          || typeof quote.text !== "string" || !quote.text.trim()) return invalid;
        evidence.push({ messageId: quote.messageId, text: quote.text });
      }
      candidates.push({ value: display(candidate.value), source: candidate.sourceRuleResultId, evidence });
    }
    return { ...presentation(state as State), value: state === "KNOWN" ? display(payload.value) : "—",
      subject: payload.subjectRole === "customer" || payload.subjectRole === "user" ? "客户" : payload.subjectRole === "agent" ? "坐席" : "未明确",
      reasons: payload.reasons.map(reason => typeof reason === "string" ? reasonNames[reason] || "识别存在异常，请查看技术记录" : "识别原因格式异常"), candidates };
  } catch { return invalid; }
}

/** The machine finding remains visible even when a later human review is pending. */
export function presentEffectiveLabel(result: LabelResult): string {
  const review = result.reviewOverlay;
  if (!review?.effectiveReviewId) return review?.latestStatus === "PENDING" ? "待复核（暂无人工值）" : "未人工修订";
  const value = review.effectiveStatus === "UNKNOWN" ? "未知" : display(review.effectiveValue);
  return `第 ${review.effectiveRevision} 轮：${value}${review.latestStatus === "PENDING" ? "（新一轮待复核）" : ""}`;
}

/** Counts only returned values; absence of a row never means a negative finding. */
export function countConversationLabelStates(results: LabelResult[]): Map<string, Partial<Record<State, number>>> {
  const counts = new Map<string, Partial<Record<State, number>>>();
  for (const result of results) {
    const item = counts.get(result.conversationId) || {};
    const state = presentLabel(result).state;
    item[state] = (item[state] || 0) + 1;
    counts.set(result.conversationId, item);
  }
  return counts;
}
