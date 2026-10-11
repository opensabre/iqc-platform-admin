async (page) => {
  await page.getByRole('button',{name:'查看历史',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.journal-events li').length===50);
  const before=JSON.parse(await page.locator('#fixture-ledger').innerText());
  if(before.journalGets!==1)throw Error('unexpected initial history calls');
  await page.getByRole('button',{name:'加载更早记录',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.journal-events li').length===53);
  const after=JSON.parse(await page.locator('#fixture-ledger').innerText());
  if(after.journalCursor!=='9223372036854775757'||after.journalGets!==2)throw Error('cursor precision or page count lost');
  if(await page.getByRole('button',{name:'加载更早记录',exact:true}).count())throw Error('cursor did not terminate');
  await page.getByText('较早的动作历史未保留；日志启用前的过程无法完整还原。',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/action-history-pages.png',fullPage:true});
  await page.getByRole('button',{name:'关闭历史',exact:true}).click();
  await page.getByRole('button',{name:'切换历史延迟',exact:true}).click();
  await page.getByRole('button',{name:'查看历史',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#fixture-ledger').textContent).journalGets===3);
  await page.getByRole('button',{name:'切换结果',exact:true}).evaluate(button=>button.click());
  await page.getByRole('button',{name:'释放历史夹具',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.journal-events li').length===0);
  if((await page.locator('body').innerText()).includes('browser-proof-fixture-result-1-'))throw Error('old-result history leaked');
  await page.getByRole('button',{name:'查看历史',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#fixture-ledger').textContent).journalGets===4);
  await page.getByRole('button',{name:'切换历史权限',exact:true}).evaluate(button=>button.click());
  await page.getByRole('button',{name:'释放历史夹具',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.action-history')===null);
  if((await page.locator('body').innerText()).includes('browser-proof-'))throw Error('revoked history leaked');
  console.log(JSON.stringify({realAntModal:true,firstPage:50,combinedPages:53,cursor:after.journalCursor,upgradeGap:true,resultChangeDiscarded:true,permissionRevocationDiscarded:true}));
}
