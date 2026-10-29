async page => {
 const score={resultCount:1,finalCount:1,pendingCount:0,notApplicableCount:0,qualifiedCount:1,averageScore:90,qualifiedRate:100};
 const report={scope:'SELECTED_TASK_RUNS',runPolicy:'SELECTED_RUNS',taskCount:1,conversationCount:1,groups:[{groupKey:'test',schemeId:'scheme',versionNo:'1',draftRevision:'',kind:'PUBLISHED',mode:'DEDUCTION',passingScore:60,taskIds:['task'],executionIds:['e1'],conversationCount:1,missingResultCount:0,missingReviewCount:1,pendingReviewCount:0,machine:score,reviewed:score,modelUsage:{schemaVersion:'iqc-business-model-usage-v1',selectedResults:1,boundResults:1,unboundResults:0,costs:{callCount:'3',knownCount:'0',unknownCount:'3',currencies:[]},latency:{callCount:'3',measuredCount:'0',unknownCount:'3',averageMillis:null},tokens:{callCount:'3',input:{knownCount:'2',unknownCount:'1',knownSubtotal:'18446744073709551615'},output:{knownCount:'1',unknownCount:'2',knownSubtotal:'0'},total:{knownCount:'0',unknownCount:'3',knownSubtotal:null}}}}]};
 let pending;
 await page.unroute('**/api/**');
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());let data;
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(request.method()!=='GET')return route.fulfill({status:405,json:{code:'WRITES_BLOCKED'}});
  if(url.pathname==='/api/org/user/current')data={id:'browser-user',username:'browser-user'};
  else if(url.pathname==='/api/org/products/iqc/profile')data={code:'iqc',name:'IQC browser validation',shortName:'IQC',homePath:'/quality-operations',enabled:true};
  else if(url.pathname==='/api/org/menu/current')data=['review:view','report:view','task:view','task:model-calls:view'].map((perm,i)=>({id:String(i),type:'BUTTON',perm:'iqc:'+perm}));
  else if(url.pathname==='/api/iqc/dictionaries')data={};
  else if(url.pathname==='/api/iqc/tasks/task/executions')data=[{id:'e1',attemptNo:1,status:'SUCCEEDED'}];
  else if(url.pathname==='/api/iqc/quality-operations/report'&&url.searchParams.get('view')==='BUSINESS'){
   if(await page.evaluate(()=>window.delayBusinessReport===true)) { const blocked=new Promise(resolve=>{pending=resolve;}); await page.evaluate(()=>{window.businessReportPending=true;}); await blocked; }
   data=report;
  }else if(url.pathname==='/api/iqc/quality-operations/report')data={};
  else return route.fulfill({status:404,json:{code:'UNCONFIGURED',data:null}});
  await route.fulfill({json:{code:'000000',data}});
 });
 await page.exposeFunction('releaseBusinessReport4',()=>{if(pending){pending();pending=undefined;}});
 await page.goto('http://127.0.0.1:43217/quality-operations');
}
