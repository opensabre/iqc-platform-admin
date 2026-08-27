import http from "@/api/http";

export interface ResultFeedback { id:string; resultId:string; feedbackType:string; comment?:string; status:string; createdTime?:string }
export interface ResultReview { id:string; resultId:string; status:string; originalStatus:string; originalScore?:number; originalRiskLevel?:string; finalStatus?:string; finalScore?:number; finalRiskLevel?:string; reviewComment?:string; reviewerId?:string; reviewedTime?:string }
export interface QualitySample { id:string; name:string; sampleType:string; sourceResultId?:string; contentSnapshot:string; expectedJson?:string; tagsJson?:string; status:string; createdTime?:string }
export interface QualityReport { pendingReviewCount:number; completedReviewCount:number; correctedReviewCount:number; reviewCorrectionRate:number; falsePositiveCount:number; falseNegativeCount:number; confirmedFeedbackCount:number; sampleCount:number }

export const createFeedback = (resultId:string, data:{feedbackType:string;comment?:string;evidenceJson?:string}) => http.post<ResultFeedback>(`/iqc/quality-operations/results/${resultId}/feedback`,data).then(r=>r.data);
export const listFeedbacks = (params:{resultId?:string;type?:string}={}) => http.get<ResultFeedback[]>("/iqc/quality-operations/feedback",{params}).then(r=>r.data);
export const requestReview = (resultId:string, comment?:string) => http.post<ResultReview>(`/iqc/quality-operations/results/${resultId}/reviews`,{comment}).then(r=>r.data);
export const listReviews = (status?:string) => http.get<ResultReview[]>("/iqc/quality-operations/reviews",{params:{status}}).then(r=>r.data);
export const decideReview = (reviewId:string,data:{decision:string;finalStatus?:string;finalScore?:number;finalRiskLevel?:string;comment?:string}) => http.post<ResultReview>(`/iqc/quality-operations/reviews/${reviewId}/decision`,data).then(r=>r.data);
export const createSample = (resultId:string,data:{name?:string;sampleType:string;expectedJson?:string;tagsJson?:string}) => http.post<QualitySample>(`/iqc/quality-operations/results/${resultId}/samples`,data).then(r=>r.data);
export const listSamples = (params:{type?:string;status?:string}={}) => http.get<QualitySample[]>("/iqc/quality-operations/samples",{params}).then(r=>r.data);
export const getQualityReport = () => http.get<QualityReport>("/iqc/quality-operations/report").then(r=>r.data);
