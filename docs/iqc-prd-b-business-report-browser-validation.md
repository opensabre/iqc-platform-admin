# 业务报告撤权浏览器验收（2026-10-25）

输入仅为已处理会话，不包含语音转换或转写生成。代码基线为 UI d414ff8。

## 本轮证据

使用真实 Vite 应用、路由、Vue、Pinia 和 Ant Design 控件，访问 `/quality-operations` 的业务评分统计。Playwright 拦截 `/api/` 返回合成数据，非 GET 请求拒绝；未连接共享服务或数据库。

已加载报告显示输入 Token 精确字符串 `18446744073709551615`；输出为合法零，总量为空。撤销并恢复 `iqc:report:view` 后旧报告不重现。原12150终态0，日志 `/tmp/iqc-b-browser-loaded-report.log`；截图 `output/playwright/business-token-browser.png` 和 `business-revocation-cleared.png`。

迟到响应专项原20633终态0，日志 `/tmp/iqc-b-browser-late-report-final.log` 显式返回 `LATE_RESPONSE_AFTER_REVOCATION_PASS` 与 `responseObserved:true`：先等待路由确认请求挂起，再撤权，等待查询入口消失，释放响应并观察真实浏览器 response 事件，最后恢复权限；旧 Token 和报告表格均不存在。截图 `output/playwright/business-late-response-cleared.png` 已目视检查。初次原72697终态1，请求等待超时，因为页面重建后选择已清空；该轮不计通过。

页面父组件撤权时卸载报表，恢复后重新挂载，任务和口径需要重新选择。本轮页面证据不能替代同一组件存活时的请求代次验证；后者由 d414ff8 的两个撤权回归与其余组件测试覆盖。组件总计19项及 vue-tsc 通过，日志见协作记录。

## 复现

启动本地 Vite：`./node_modules/.bin/vite --host 127.0.0.1 --port 43217 --strictPort`。使用 Playwright CLI 打开浏览器，再以 `run-code` 执行 `scripts/browser-fixtures/business-revocation-fixture.js`。夹具中端口为本机43217。

执行 `business-revocation-browser-check.js` 检查加载后的撤权。随后执行 `business-revocation-late-check.js` 检查挂起响应：该脚本会重新选择任务和口径。夹具在同一页只安装一次，重复安装需新浏览器页，避免暴露函数重名。

截图保存至忽略的 `output/playwright/`，运行日志保存至 `/tmp/`。本轮已有默认业务复核队列未配置API的404，不属于被测业务报告接口。

## 尚未证明

授权由真实 Pinia store 的受控权限输入驱动，API 数据为合成；没有验证真实 PDP、组织账号、后端 SQL、供应商、完整报表端到端链路或容量。完整适用 I1–I7 目标仍未完成。
