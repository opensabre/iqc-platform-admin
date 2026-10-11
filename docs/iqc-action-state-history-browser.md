# 动作状态历史界面验收

ActionHistoryPanel复用原history:view权限和摘要GET，所有可见动作可“查看历史”，不要求核对权限。单动作按字符串版本游标加载更多，明确记录缺口，不把领取/状态日志当发送证明。GET防重复；关闭/刷新/切换结果/撤权/卸载清空历史与标题并废弃旧响应。另一动作/错序/错误游标响应显示读取失败；文字引用不渲染HTML。

组件定向14项，包括原核对9项及新历史5项。完整28文件185项通过；最终标题清除后再跑14项及vue-tsc/Vite构建通过，原engine/chunk提示保留。见/private/tmp/iqc-b-action-history-ui-{targeted,full,types,build,final-targeted,final-build}.log。本地组件Ant stub不证明真实登录或网关授权。

## 真实浏览器边界及可复现夹具

复用既有action-reconciliation手工夹具，`?history=1`启用50条+3条大版本日志，接口及权限变化全为local Axios/Pinia adapter。两个结果证据区分，延迟接口用于废弃响应场景，不访问真实组织、模型或数据库。

```
mkdir -p output/playwright
cp scripts/browser-fixtures/action-reconciliation* output/playwright/
pnpm exec vite --host 127.0.0.1 --port 3017 --strictPort
```

打开`http://127.0.0.1:3017/output/playwright/action-reconciliation.html?history=1`，Playwright CLI的`run-code`参数使用`scripts/browser-fixtures/action-history-browser-check.js`内容。它验证50→53、精确游标9223372036854775757、缺口提示、结果切换和撤权。被遮罩的“切换结果/权限”仅通过夹具控制的evaluate模拟外部异步状态变化，不表示用户可穿透遮罩。

本轮Chromium实际完成50→53、游标/末页/缺口及截图。初轮要求关闭后DOM容器不存在，实际Ant仅隐藏容器，但已清空旧条目；断言已修正。后轮全body搜索通用证据前缀，混入新结果摘要；夹具已按来源区分并修正断言。修正后的最后完整脚本因自动审批审核usage limit失败没有执行；不是操作被判不安全，不把部分浏览器结果计为最终全通过。撤权的浏览器步骤未验，仅有组件证据。

截图`output/playwright/action-history-pages.png`与`.playwright-cli/`仅本地忽略文件，截图来自最终夹具来源前缀修正前的部分运行。Vite句柄80197请求中断后exit1；缓存CLI清理62143 exit0报告浏览器session未打开。浏览器重跑及两条独立审查均待审批/额度恢复。后端150dde7事务日志及本批查询接口为运行依赖，当前未合并、推送或部署。
