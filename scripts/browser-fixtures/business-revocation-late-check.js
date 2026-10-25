async page => {
 await page.getByRole('tab',{name:'业务评分统计',exact:true}).click();
 const task=page.getByRole('region',{name:'业务评分统计',exact:true}).locator('input[role="combobox"]');
 await task.fill('task');await task.press('Enter');
 await page.getByLabel('运行统计口径',{exact:true}).selectOption('SELECTED_RUNS');
 await page.getByRole('checkbox',{name:'包含所选结果轮次的调用费用与耗时'}).check();
 await page.evaluate(()=>{window.delayBusinessReport=true;window.businessReportPending=false;});
 const requested=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/iqc/quality-operations/report'&&request.url().includes('view=BUSINESS'));
 await page.getByRole('button',{name:'查询业务统计',exact:true}).click();await requested;
 await page.waitForFunction(()=>window.businessReportPending===true);
 const returned=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/iqc/quality-operations/report'&&response.url().includes('view=BUSINESS'));
 await page.evaluate(async()=>{
  const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('iqc-auth');
  window.savedBrowserPermissions=[...store.permissions];
  store.permissions=store.permissions.filter(code=>code!=='iqc:report:view');
 });
 await page.waitForFunction(()=>!document.body.textContent.includes('查询业务统计'));
 await page.evaluate(()=>window.releaseBusinessReport4());
 await returned;
 await page.evaluate(()=>{
  const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('iqc-auth');
  store.permissions=window.savedBrowserPermissions;window.delayBusinessReport=false;
 });
 await page.getByRole('button',{name:'查询业务统计',exact:true}).waitFor();
 if(await page.getByText('18446744073709551615',{exact:false}).count())throw new Error('Late response revived old tokens');
 if(await page.locator('section[aria-label="业务评分统计"] table').count())throw new Error('Late response revived report table');
 await page.screenshot({path:'output/playwright/business-late-response-cleared.png',fullPage:true});
 return {result:'LATE_RESPONSE_AFTER_REVOCATION_PASS',responseObserved:true};
}
