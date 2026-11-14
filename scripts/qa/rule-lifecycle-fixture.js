// Playwright CLI run-code fixture; API responses are simulated, never forwarded.
async page => {
  let rules = [
    {id:'referenced',name:'被引用规则',code:'REFERENCED',category:'CUSTOM',ruleType:'REGEX',expression:'退款',status:'PUBLISHED',versionNo:1},
    {id:'free',name:'可停用规则',code:'FREE',category:'CUSTOM',ruleType:'REGEX',expression:'投诉',status:'PUBLISHED',versionNo:1},
    {id:'remove',name:'可删除规则',code:'REMOVE',category:'CUSTOM',ruleType:'REGEX',expression:'咨询',status:'DRAFT',versionNo:1}
  ];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data = [], status = 200, code = '000000', msg = 'success';
    if (path === '/api/org/user/current') data = {id:'browser-test',username:'browser-test',name:'验收用户'};
    else if (path === '/api/org/products/iqc/profile') data = {id:'iqc',code:'iqc',name:'IQC 本地浏览器验收',shortName:'IQC',homePath:'/rules/library',enabled:true};
    else if (path === '/api/org/menu/current') data = [
      {id:'rules',name:'规则库',href:'/rules/library',perm:'iqc:rule:view'},
      ...(!page.url().includes('readonly=1') ? [{id:'manage',name:'规则管理',perm:'iqc:rule:manage'}] : [])
    ];
    else if (path === '/api/iqc/dictionaries') data = {};
    else if (path === '/api/iqc/config/rules' && method === 'GET') data = rules;
    else if ((method === 'POST' && /^\/api\/iqc\/config\/rules\/[^/]+\/disable$/.test(path)) ||
      (method === 'DELETE' && /^\/api\/iqc\/config\/rules\/[^/]+$/.test(path))) {
      const id = path.split('/')[5];
      await page.evaluate(({method,path}) => { window.__iqcMutationLog ||= []; window.__iqcMutationLog.push({method,path}); }, {method,path});
      if (id === 'referenced') { code = 'IQC-1006'; msg = 'IQC 业务状态不允许当前操作：规则仍被引用，不能删除或停用'; data = undefined; }
      else if (method === 'DELETE') { rules = rules.filter(rule => rule.id !== id); data = null; }
      else { rules = rules.map(rule => rule.id === id ? {...rule,status:'DISABLED'} : rule); data = rules.find(rule => rule.id === id); }
    } else if (method !== 'GET') { status = 500; code = 'MOCK_UNEXPECTED_WRITE'; msg = 'Unexpected fixture mutation'; data = null; }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify({code,mesg:msg,data})});
  });
}
