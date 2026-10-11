import type { LabelResult } from "@/api/results";

type State = NonNullable<LabelResult["status"]>;
interface Quote { messageId?: string; text: string }
interface Candidate { value: string; source: string; evidence: Quote[] }
export interface LabelPresentation {
  state: State; valid: boolean; title: string; color: string; value: string; subject: string;
  reasons: string[]; candidates: Candidate[];
}
const states: Record<State, { title: string; color: string }> = {
  HIT: { title: "命中（兼容）", color: "blue" }, KNOWN: { title: "确定", color: "blue" },
  UNKNOWN: { title: "未知", color: "default" }, CONFLICT: { title: "冲突", color: "orange" },
  ERROR: { title: "错误", color: "red" }, NOT_EVALUATED: { title: "未评估", color: "default" },
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

function findingPresentation(result: LabelResult, payload: Record<string, unknown>): LabelPresentation | undefined {
  const binding = payload.binding, state = payload.status;
  if (result.generationSource !== "PIPELINE_FINDING" || !object(binding) || binding.labelId !== result.labelId
    || binding.labelVersion !== result.labelVersionNo || binding.valueCode !== result.valueCode
    || typeof binding.findingCode !== "string" || !binding.findingCode.trim()
    || !["FIXED", "BOOLEAN", "PERCENTAGE", "DURATION_MONTHS", "MONTH", "DATE"].includes(String(binding.valueType))
    || !["user", "customer", "agent", "all"].includes(String(binding.targetRole))
    || typeof state !== "string" || !["KNOWN", "UNKNOWN", "CONFLICT", "ERROR", "NOT_EVALUATED"].includes(state)
    || result.status !== state || typeof payload.reasonCode !== "string"
    || !Array.isArray(payload.rawFindings) || !Array.isArray(payload.selectedFindingIds) || !Array.isArray(payload.evidence)
    || state === "KNOWN" && (!scalar(payload.value) || !payload.selectedFindingIds.length)
    || state !== "KNOWN" && payload.value != null) return undefined;
  const evidence = (values: unknown[]): Quote[] | undefined => {
    const quotes: Quote[] = [];
    for (const value of values) {
      if (!object(value) || typeof value.id !== "string" || typeof value.reference !== "string"
        || !["CONVERSATION", "RULE_MATCH", "METRIC", "KNOWLEDGE", "BUSINESS_FIELD", "EXTERNAL_RESULT"].includes(String(value.type))) return undefined;
      const details = object(value.details) ? value.details : undefined;
      const messageId = value.type === "CONVERSATION" ? value.reference
        : value.type === "RULE_MATCH" && typeof details?.messageId === "string" ? details.messageId : undefined;
      const text = typeof details?.text === "string" ? details.text : typeof details?.matchedText === "string" ? details.matchedText
        : `${value.type} · ${value.reference}${details ? `：${JSON.stringify(details)}` : ""}`;
      quotes.push({ messageId, text });
    }
    return quotes;
  };
  if (!evidence(payload.evidence)) return undefined;
  const candidates: Candidate[] = [], ids = new Set<string>();
  for (const raw of payload.rawFindings) {
    if (!object(raw) || typeof raw.id !== "string" || ids.has(raw.id) || raw.code !== binding.findingCode
      || !Array.isArray(raw.evidence) || !object(raw.source) || typeof raw.source.nodeId !== "string"
      || !["KNOWN", "UNKNOWN", "CONFLICT", "ERROR", "NOT_EVALUATED"].includes(String(raw.state))
      || raw.state === "KNOWN" && !scalar(raw.value) || raw.state !== "KNOWN" && raw.value != null) return undefined;
    const quotes = evidence(raw.evidence); if (!quotes) return undefined;
    ids.add(raw.id);
    candidates.push({ value: raw.state === "KNOWN" ? display(raw.value) : states[raw.state as State].title,
      source: `${raw.id} · 节点 ${raw.source.nodeId}`, evidence: quotes });
  }
  if (new Set(payload.selectedFindingIds).size !== payload.selectedFindingIds.length
    || payload.selectedFindingIds.some(id => typeof id !== "string" || !ids.has(id))) return undefined;
  const reasons: Record<string, string> = { FINDING_MISSING: "未产生该项分析事实", FINDING_VALUE_PROJECTED: "取自生产分析的融合结果",
    FINDING_UNKNOWN: "分析事实尚不确定", FINDING_CONFLICT: "分析事实存在冲突", FINDING_ERROR: "分析事实生成失败",
    FINDING_NOT_EVALUATED: "该项分析尚未评估", LABEL_VALUE_TYPE_MISMATCH: "分析值与标签类型不一致" };
  return { ...presentation(state as State), value: state === "KNOWN" ? display(payload.value) : "—",
    subject: binding.targetRole === "agent" ? "坐席（政策绑定）" : binding.targetRole === "all" ? "整会话（政策绑定）" : "客户（政策绑定）",
    reasons: [reasons[payload.reasonCode] || "请查看分析事实记录"], candidates };
}

/** Read-only presentation: malformed coverage must not turn into a legacy hit or a definitive value. */
export function presentLabel(result: LabelResult): LabelPresentation {
  const invalid = { ...presentation("ERROR"), valid: false, reasons: ["结果格式异常，请联系管理员检查识别输出"] };
  try {
    const payload: unknown = result.valueJson ? JSON.parse(result.valueJson) : {};
    if (!object(payload)) return invalid;
    if (payload.schemaVersion === "iqc-label-finding-projection-v1") return findingPresentation(result, payload) || invalid;
    if (payload.schemaVersion !== "iqc-label-result-v2") {
      if (Object.prototype.hasOwnProperty.call(payload, "schemaVersion") || result.generationSource === "PIPELINE_FINDING") return invalid;
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
