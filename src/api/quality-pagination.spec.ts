import {beforeEach,describe,expect,it,vi} from 'vitest';
import http from './http';
import {listSamplePage,listSamples} from './quality';
vi.mock('./http',()=>({default:{get:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
const params={current:2,size:20,keyword:'精确样本',type:'UNCLASSIFIED',status:'CANDIDATE'};
const valid={records:[{id:'sample-two'}],total:41,current:2,size:20};
describe('candidate page HTTP contract',()=>{
 it('forwards pagination, cross-page keyword and filters without changing the projection',async()=>{
  vi.mocked(http.get).mockResolvedValueOnce({data:valid});
  expect(await listSamplePage(params)).toBe(valid);
  expect(http.get).toHaveBeenCalledExactlyOnceWith('/iqc/quality-operations/samples',{params});
 });
 it.each([[],null,{}, {...valid,records:null},{...valid,current:1},{...valid,size:10},{...valid,total:-1},{...valid,total:1.5},{...valid,total:Number.MAX_SAFE_INTEGER+1},{...valid,records:Array(21).fill({id:'extra'})}])('rejects unsupported response %j without a full-list fallback',async(data)=>{
  vi.mocked(http.get).mockResolvedValueOnce({data});
  await expect(listSamplePage(params)).rejects.toThrow('候选样本分页协议不受支持');
  expect(http.get).toHaveBeenCalledTimes(1);
 });
 it('accepts an empty authorized page retaining its filtered total',async()=>{
  const data={...valid,records:[]};vi.mocked(http.get).mockResolvedValueOnce({data});
  expect(await listSamplePage(params)).toBe(data);
 });
 it('retains the legacy array API for callers explicitly using it',async()=>{
  const rows=[{id:'legacy'}];vi.mocked(http.get).mockResolvedValueOnce({data:rows});
  expect(await listSamples({status:'CANDIDATE'})).toBe(rows);
  expect(http.get).toHaveBeenCalledExactlyOnceWith('/iqc/quality-operations/samples',{params:{status:'CANDIDATE'}});
 });
 it('propagates transport failure without retry or fallback',async()=>{
  const error=new Error('transport unavailable');vi.mocked(http.get).mockRejectedValueOnce(error);
  await expect(listSamplePage(params)).rejects.toBe(error);expect(http.get).toHaveBeenCalledTimes(1);
 });
});
