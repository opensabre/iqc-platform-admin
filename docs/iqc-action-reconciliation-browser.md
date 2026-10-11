# UNKNOWN 核对：真实浏览器组件验收

基线 UI c1ef22e。使用 playwright skill、安装的 CLI 包装脚本和实际 Chromium；挂载原 ActionHistoryPanel、Pinia 权限 composable、Ant 表格/弹窗/输入/按钮。接口是显式本地 Axios adapter 夹具，权限变化也是本地控制，不连接真实组织、后端、数据库或网关。

## 已取得证据

- 实际 Ant 表格显示 CREATE_REVIEW、待核对、attempt1；打开弹窗能读取动作名称和原因输入框。
- 空原因提示“请填写不超过1000字的核对原因”，夹具posts仍为0。
- 有效提交只包含观察version3与原因，posts为1；实际loading按钮再次点击仍是1。等待响应时原因/取消/刷新/行操作禁用、关闭按钮不存在，Escape不关闭弹窗。
- 释放UNCONFIRMED后显示“继续等待核对”，行状态保持待核对。
- 本地撤权控制在提交中关闭弹窗、移除操作入口；之后释放CONFIRMED不会显示成功消息。
- 本地结果切换控制在提交中加载fixture-result-2行；旧成功响应不改新行或显示旧成功提示。
- 正常CONFIRMED显示实际产物完成提示，后续GET夹具读取version4/COMPLETE，实际Ant表格显示“已完成”，操作入口移除。

这些是浏览器运行断言和DOM属性证据，不是仅靠截图判断。关键结果由CLI run-code返回：duplicateBlocked/pendingCancelBlocked/unconfirmedVisible=true；revokedDialogClosed/revokedReceiptDiscarded=true；changedResultReceiptDiscarded/newSourceStillUnconfirmed=true；confirmedMessage/refreshedCompleteRow/operationRemoved=true；inputDisabled/cancelDisabled=true，closeButtonCount=0。

截图保存在本地 `output/playwright/reconciliation-pending.png` 和 `reconciliation-confirmed.png`；页面快照及console日志保存在 `.playwright-cli/`。两目录作为本地产物忽略，不提交生成截图/缓存。等待态第一次抓图过早，已等真实disabled DOM渲染后重拍；判断禁用行为仍以DOM断言为准。控制台仅缺favicon404及一次本地Vite连接丢失记录，原服务句柄27021核对仍live，重新获取快照后继续；没有把失效引用当产品缺陷。完成后浏览器close61619 exit0，原Vite句柄请求中断后退出。临时依赖链接清理。

## 复现

在本工作树安装仓库声明的依赖，复制保留的手工浏览器夹具到已验证的路径：

```bash
mkdir -p output/playwright
cp scripts/browser-fixtures/action-reconciliation* output/playwright/
pnpm exec vite --host 127.0.0.1 --port 3017 --strictPort
```

打开 `http://127.0.0.1:3017/output/playwright/action-reconciliation.html`。默认UNCONFIRMED；选择CONFIRMED可验证正常完成。提交后响应暂停，释放按钮模拟接口返回；遮罩后面的夹具控制可通过Playwright对该控制调用DOM click模拟异步外部授权/来源变化，不能据此声称真实用户能穿透弹窗遮罩。每个独立场景reload恢复夹具。

本批只保存浏览器夹具与验收文档/产物忽略规则；产品源码没有变化，因此沿用c1ef22e的180项组件/API测试及构建证据，没有重复运行无关全量。新夹具不是自动CI测试规格，也不建立第二套权限或动作实现。

真实四角色登录/HTTP权限链、真实后端产物返回和完整生产调度仍未验收；没有推送、合入A或部署。完整尝试审计、阻塞恢复、远端适配及完整非实时语音PRD继续，目标仍active。
