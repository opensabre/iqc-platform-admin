import http from './http';
import type {RunUsage} from './model-gateway';
import type {InspectionTask} from './tasks';
import type {EvaluationReport} from './evaluation';
export type BenchmarkDimension='PROMPT'|'MODEL'|'SKILL'|'FUSION'|'PIPELINE';
export interface BenchmarkTarget {pipelineId:string;pipelineVersion?:number;draftRevision?:number}
export interface BenchmarkSelection {dimension:BenchmarkDimension;nodeId?:string;slot?:number}
export interface BenchmarkCreate {name?:string;datasetId:string;datasetVersion:number;baseline:BenchmarkTarget;candidate:BenchmarkTarget;selection:BenchmarkSelection;concurrency:number;requestId:string}
export interface BenchmarkPair {schemaVersion:string;experimentId:string;name:string;datasetId:string;datasetVersion:number;datasetHash:string;selection:BenchmarkSelection;comparison:Record<string,unknown>;baseline:InspectionTask;candidate:InspectionTask}
export interface BenchmarkUsageSide {expectedSamples:number;boundSamples:number;unboundSamples:number;recorded:RunUsage}
export interface BenchmarkModelUsage {schemaVersion:string;scope:string;baseline:BenchmarkUsageSide;candidate:BenchmarkUsageSide}
export interface BenchmarkReport {modelUsage?:BenchmarkModelUsage|null;schemaVersion:string;experiment:BenchmarkPair;baseline:EvaluationReport;candidate:EvaluationReport;complete:boolean;deltas:Record<string,number|null>}
const base='/iqc/evaluation/benchmarks';
export const createBenchmark=(body:BenchmarkCreate)=>http.post<BenchmarkPair>(base,body).then(r=>r.data);
export const getBenchmark=(id:string)=>http.get<BenchmarkPair>(`${base}/${encodeURIComponent(id)}`).then(r=>r.data);
export const getBenchmarkReport=(id:string,baselineExecutionId:string,candidateExecutionId:string,includeModelUsage=false)=>http.get<BenchmarkReport>(`${base}/${encodeURIComponent(id)}/report`,{params:{baselineExecutionId,candidateExecutionId,...(includeModelUsage?{includeModelUsage:true}:{})}}).then(r=>r.data);
