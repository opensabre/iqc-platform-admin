async page => {
 await page.getByRole('tab',{name:'业务评分统计',exact:true}).click();
 const region=page.getByRole('region',{name:'业务评分统计',exact:true});
 const task=region.locator('input[role="combobox"]');
 await task.fill('task');await task.press('Enter');
 await page.getByLabel('运行统计口径',{exact:true}).selectOption('SELECTED_RUNS');
 await page.getByRole('checkbox',{name:'包含所选结果轮次的调用费用与耗时'}).check();
 await page.getByRole('button',{name:'查询业务统计',exact:true}).click();
 await page.getByText('供应商已报告输入 Token：已知小计 18446744073709551615',{exact:false}).waitFor();
 await page.screenshot({path:'output/playwright/business-token-browser.png',fullPage:true});
 const result=await page.evaluate(async()=>{
  const store=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('iqc-auth');
  const original=[...store.permissions];
  store.permissions=original.filter(code=>code!=='iqc:report:view');
  await new Promise(resolve=>setTimeout(resolve,50));
  store.permissions=original;
  await new Promise(resolve=>setTimeout(resolve,50));
  return {staleVisible:document.body.textContent.includes('18446744073709551615'),queryVisible:document.body.textContent.includes('查询业务统计')};
 });
 if(result.staleVisible||!result.queryVisible)throw new Error('Revocation restoration did not clear loaded report: '+JSON.stringify(result));
 await page.screenshot({path:'output/playwright/business-revocation-cleared.png',fullPage:true});
 console.log(JSON.stringify({loadedReportRevocation:'PASS',exactLargeTokens:'PASS',zeroAndUnknown:'visible',result}));
}
