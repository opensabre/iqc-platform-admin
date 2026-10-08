import type {ModelMonitoringHistory} from '@/api/model-gateway';

// Adapted from opensabre-admin monitoring/history-chart.ts: same ECharts line option shape.
// Protocol errors remain errors; missing and non-finite samples remain gaps.
export interface ModelTrend {name:string;type:'line';showSymbol:boolean;connectNulls:boolean;data:Array<[number,number|null]>}
export function modelTrendSeries(history:ModelMonitoringHistory,key:string,label:string,multiplier=1):ModelTrend[]{
  const raw=history.series[key];
  if(typeof raw!=='string'||raw.length>1048576)throw new Error('监控矩阵缺失或超出范围');
  let envelope:unknown;
  try{envelope=JSON.parse(raw);}catch{throw new Error('监控矩阵无法解析');}
  const response=envelope as {status?:unknown;data?:{resultType?:unknown;result?:unknown}};
  if(!response||response.status!=='success'||response.data?.resultType!=='matrix'||!Array.isArray(response.data.result)||response.data.result.length>32)
    throw new Error('监控矩阵格式无效');
  const start=Math.floor(Date.parse(history.start)/1000),end=Math.floor(Date.parse(history.end)/1000),step=history.stepSeconds;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isInteger(step)||step<1||Math.floor((end-start)/step)>2000||!Number.isFinite(multiplier))
    throw new Error('监控时间窗口无效');
  return response.data.result.map((row:unknown)=>{
    const item=row as {metric?:unknown;values?:unknown};
    if(!item||!item.metric||typeof item.metric!=='object'||Array.isArray(item.metric)||!Array.isArray(item.values)||item.values.length>2001)
      throw new Error('监控序列格式无效');
    const metric=item.metric as Record<string,unknown>;
    if(Object.entries(metric).some(([name,value])=>!['kind','status','stage','outcome','__name__'].includes(name)||typeof value!=='string'||value.length>64))
      throw new Error('监控序列标签无效');
    const points=new Map<number,number|null>();let previous=-Infinity;
    for(const entry of item.values){
      if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='number'||typeof entry[1]!=='string')throw new Error('监控采样格式无效');
      const [timestamp,text]=entry as [number,string];
      if(!Number.isFinite(timestamp)||timestamp<start||timestamp>end||timestamp<=previous||(timestamp-start)%step!==0)throw new Error('监控采样时间无效');
      previous=timestamp;
      let value:number|null=null;
      if(!['NaN','+Inf','-Inf','Inf'].includes(text)){
        if(!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(text))throw new Error('监控采样数值无效');
        const numeric=Number(text)*multiplier;if(Number.isFinite(numeric))value=numeric;
      }
      points.set(timestamp,value);
    }
    const data:Array<[number,number|null]>=[];
    for(let timestamp=start;timestamp<=end;timestamp+=step)data.push([timestamp*1000,points.get(timestamp)??null]);
    const dimensions=['kind','status','stage','outcome'].map(name=>metric[name]).filter(value=>typeof value==='string');
    return {name:dimensions.length?`${label} · ${dimensions.join(' / ')}`:label,type:'line' as const,showSymbol:false,connectNulls:false,data};
  });
}
export function modelTrendOptions(history:ModelMonitoringHistory,fields:Array<{key:string;label:string;multiplier?:number}>){
  return {animation:false,tooltip:{trigger:'axis',renderMode:'richText'},legend:{type:'scroll',top:0},grid:{left:56,right:24,top:48,bottom:30},
    xAxis:{type:'time'},yAxis:{type:'value',scale:true},series:fields.flatMap(field=>modelTrendSeries(history,field.key,field.label,field.multiplier??1))};
}
